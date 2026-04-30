/**
 * Image Component
 *
 * Renders bitmap images in supported terminals using the Kitty graphics
 * protocol (primary) or Sixel (fallback). When neither is supported,
 * displays a text placeholder.
 *
 * Since terminal images are escape-sequence-based and don't fit the cell
 * buffer model, the component reserves visual space with a Box of the
 * requested dimensions and uses `useEffect` to write image data directly
 * to stdout after render.
 *
 * @example
 * ```tsx
 * import { readFileSync } from "fs"
 * import { Image } from "@silvery/ag-react"
 *
 * const png = readFileSync("photo.png")
 * <Image src={png} width={40} height={20} />
 *
 * // With file path
 * <Image src="/path/to/image.png" width={40} height={20} />
 *
 * // Auto-detect protocol, fall back to text
 * <Image src={png} width={40} height={20} fallback="[photo]" />
 * ```
 */

import { readFileSync } from "node:fs"
import { type JSX, useContext, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { StdoutContext } from "../../context"
import { Box } from "../../components/Box"
import { Text } from "../../components/Text"
import { useBoxRect, useScreenRect } from "../../hooks/useLayout"
import {
  encodeKittyImage,
  isKittyGraphicsSupported,
  deleteKittyImage,
  deleteKittyPlacement,
  placeKittyImage,
} from "./kitty-graphics"
import { decodePngToRgba, encodeSixel, isSixelSupported } from "./sixel-encoder"

// ============================================================================
// Types
// ============================================================================

export type ImageProtocol = "kitty" | "sixel" | "auto"

export interface ImageProps {
  /** PNG image data (Buffer) or file path (string) to a PNG file */
  src: Buffer | string
  /** Width in terminal columns. If omitted, uses available width from layout. */
  width?: number
  /** Height in terminal rows. If omitted, defaults to half the width (rough aspect ratio). */
  height?: number
  /** Text to display when image rendering is not supported. Default: "[image]" */
  fallback?: string
  /** Which protocol to use. Default: "auto" (tries Kitty, then Sixel, then fallback) */
  protocol?: ImageProtocol
}

// ============================================================================
// Protocol Detection
// ============================================================================

/**
 * Determine the best available image protocol.
 * Returns null if no image protocol is available.
 */
function detectProtocol(preferred: ImageProtocol): "kitty" | "sixel" | null {
  if (preferred === "kitty") {
    return isKittyGraphicsSupported() ? "kitty" : null
  }
  if (preferred === "sixel") {
    return isSixelSupported() ? "sixel" : null
  }

  // Auto-detect: prefer Kitty, fall back to Sixel
  if (isKittyGraphicsSupported()) return "kitty"
  if (isSixelSupported()) return "sixel"
  return null
}

// ============================================================================
// Component
// ============================================================================

/** Incrementing image ID counter for Kitty protocol */
let nextImageId = 1

/**
 * Renders a bitmap image in the terminal.
 *
 * The component operates in two phases:
 * 1. **Layout phase**: Renders a Box that reserves the visual space
 *    (filled with spaces so the cell buffer has the right dimensions).
 * 2. **Effect phase**: After render, writes the image escape sequence
 *    directly to stdout, positioned over the reserved space.
 *
 * When image protocols are not available, the fallback text is shown instead.
 */
export function Image({
  src,
  width: requestedWidth,
  height: requestedHeight,
  fallback = "[image]",
  protocol: preferredProtocol = "auto",
}: ImageProps): JSX.Element {
  const parentRect = useBoxRect()
  const effectiveWidth = requestedWidth ?? parentRect.width
  const effectiveHeight = requestedHeight ?? Math.max(1, Math.floor(effectiveWidth / 2))

  return (
    <Box width={effectiveWidth} height={effectiveHeight}>
      <ImagePlacement
        src={src}
        width={effectiveWidth}
        height={effectiveHeight}
        fallback={fallback}
        protocol={preferredProtocol}
      />
    </Box>
  )
}

function ImagePlacement({
  src,
  width: effectiveWidth,
  height: effectiveHeight,
  fallback,
  protocol: preferredProtocol,
}: Required<ImageProps>): JSX.Element {
  // LAYOUT_READ_AT_RENDER: image rendering writes Kitty/Sixel escape
  // sequences with explicit pixel/cell dimensions. The encoded image must
  // match the reserved cell area exactly, so `width`/`height` need to be
  // resolved before encoding — flex auto-sizing isn't enough because the
  // pixel-to-cell ratio depends on the actual cell count. Consumers may
  // pass `width`/`height` to skip the auto-fill read.
  const boxRect = useScreenRect()
  const stdoutCtx = useContext(StdoutContext)
  const imageIdRef = useRef<number | null>(null)
  // Tracks the PNG data the image was last *transmitted* with. While this
  // matches the current `pngData`, position changes can re-place the
  // already-stored image via `a=p` instead of re-encoding the full
  // base64 blob — eliminating the visible flicker on scroll re-emit.
  const transmittedSrcRef = useRef<Buffer | null>(null)
  // Tracks the dimensions the image was last placed at. If only x/y
  // change, we can re-place without re-transmitting; if width/height
  // change, the stored image's display sizing also needs updating
  // (placeKittyImage carries new c=/r=, so re-place is still enough).
  const placedSizeRef = useRef<{ width: number; height: number } | null>(null)
  // Tracks the last emitted (x, y, w, h). Re-place is skipped when
  // every coordinate matches what's already on screen — the layout
  // engine fires `useScreenRect` updates on every commit even when
  // the box's position didn't actually change. Without this gate,
  // every chat re-render (e.g. status streaming) emits a Kitty
  // `a=p` packet at the same position as before — visible as
  // micro-stutter / "the image jumps around" because each
  // re-place momentarily races with whatever else is being drawn
  // at that location.
  const lastEmittedRef = useRef<{ x: number; y: number; width: number; height: number } | null>(
    null,
  )

  // Resolve image data
  const pngData = useMemo(() => {
    if (Buffer.isBuffer(src)) return src
    // String path — read file synchronously (during render is fine for a path)
    try {
      return readFileSync(src)
    } catch {
      return null
    }
  }, [src])

  // Detect protocol support
  const activeProtocol = useMemo(() => detectProtocol(preferredProtocol), [preferredProtocol])

  // Assign a stable image ID for Kitty (for cleanup on unmount)
  if (activeProtocol === "kitty" && imageIdRef.current == null) {
    imageIdRef.current = nextImageId++
  }

  // Write image escape sequences after render. Both Kitty and Sixel
  // place the image at the CURRENT cursor position, so we prepend a
  // CSI cursor-positioning escape (CSI row;col H — 1-indexed, hence
  // the +1 on box rect's 0-indexed coords) to land it inside the
  // reserved Box. Without this, silvery's render leaves the cursor at
  // the bottom-right of the buffer and the image spills off-screen.
  //
  // Two re-emit paths for Kitty:
  //
  //   - Cold path (first paint, src changed): TRANSMIT the PNG bytes
  //     once with a=t (transmit only) + an immediate a=p placement at
  //     the current cursor.
  //   - Warm path (only position / dimensions changed): the image is
  //     already stored on the terminal; emit a=d,p=… to clear the
  //     prior placement, position the cursor, then a=p to re-place.
  //     No re-encoding of the base64 blob — eliminates the flicker
  //     scroll-driven re-emits otherwise produce.
  //
  // useLayoutEffect (not useEffect): fires synchronously during the
  // React commit phase, BEFORE silvery's paintFrame writes the cell
  // buffer. With z=1 the image ends up above paintFrame's spaces, no
  // visible "blank then image" flicker. Using useEffect, the order was
  // paintFrame (blank cells visible) → useEffect (image appears) — the
  // user reported "small/partial then full" flicker which is this gap.
  useLayoutEffect(() => {
    if (!pngData || !stdoutCtx || !activeProtocol) return
    if (effectiveWidth <= 0 || effectiveHeight <= 0) return
    // Gate on a measured boxRect — flexily emits a (0, 0, 0×0) rect on
    // the first render before layout has assigned the host node a
    // position. If we don't gate, the placement uses cursor (0, 0) and
    // the image briefly flashes at the top-left corner of the alt
    // screen until the next render's effect deletes it and emits at
    // the real position. boxRect.width > 0 is the canonical "I've been
    // measured" predicate (same gate <MeasuredBox> uses).
    if (boxRect.width <= 0) return

    // Visibility gate — skip emission when the image is wholly off-
    // screen or scrolled past a viewport boundary. screenRect on a
    // node scrolled OUT of its parent's overflow container can be
    // negative (rows above the viewport) or extend past the
    // terminal's last row; firing the CSI cursor-position escape
    // with a bogus row number sends Kitty's `a=p` to whatever the
    // terminal interprets as that coordinate (often row 0/1, the
    // top-left of the screen). User-visible: the image appears to
    // teleport to the top, then snap back when it scrolls back into
    // view.
    //
    // Detection: any negative coordinate, OR the image's bounding
    // box extends fully past the bottom of the terminal. We only
    // emit when the image's footprint at least partially intersects
    // a sane on-screen region. When the image is fully off-screen
    // and we had a prior placement, delete it so the terminal isn't
    // left with a stale image at the old position.
    const imageOffscreen =
      boxRect.y + effectiveHeight <= 0 ||
      boxRect.x + effectiveWidth <= 0 ||
      boxRect.x < 0 ||
      boxRect.y < 0
    if (imageOffscreen) {
      if (activeProtocol === "kitty" && placedSizeRef.current !== null) {
        const id = imageIdRef.current
        if (id != null) {
          stdoutCtx.write(deleteKittyPlacement(id))
        }
        placedSizeRef.current = null
        lastEmittedRef.current = null
      }
      return
    }

    const { write } = stdoutCtx
    const moveCursor = `\x1b[${boxRect.y + 1};${boxRect.x + 1}H`

    if (activeProtocol === "kitty") {
      const id = imageIdRef.current
      if (id == null) return
      const srcChanged = transmittedSrcRef.current !== pngData

      if (srcChanged) {
        // Cold path: transmit the PNG once. If we had a prior placement
        // for an OLD src under the same id, drop the entire stored
        // image first so the terminal doesn't keep stale bytes around.
        if (placedSizeRef.current !== null) write(deleteKittyImage(id))
        const seq = encodeKittyImage(pngData, {
          width: effectiveWidth,
          height: effectiveHeight,
          id,
          transmitOnly: true,
        })
        write(seq)
        transmittedSrcRef.current = pngData
      }

      // Skip the re-place when the position + dimensions exactly
      // match what's already on screen. The layout engine can fire
      // `useScreenRect` updates on commits that didn't actually
      // change the box's position (resize coalescing, descendant
      // re-renders); without this gate, every chat tick re-emits
      // the same Kitty `a=p` packet — visually a stutter as the
      // terminal repaints the same image at the same location while
      // the surrounding cell buffer is being overdrawn.
      const last = lastEmittedRef.current
      const positionUnchanged =
        last !== null &&
        last.x === boxRect.x &&
        last.y === boxRect.y &&
        last.width === effectiveWidth &&
        last.height === effectiveHeight
      if (positionUnchanged && !srcChanged) return

      // Position cursor + (re-)place. Kitty's protocol replaces an
      // existing placement when (image_id, placement_id) match, so
      // a move on every scroll tick is just one APC packet — no
      // delete-then-place gap that otherwise produces a visible
      // flicker frame between the prior placement vanishing and the
      // new one rendering at the updated coords.
      write(
        moveCursor +
          placeKittyImage({ id, width: effectiveWidth, height: effectiveHeight }),
      )
      placedSizeRef.current = { width: effectiveWidth, height: effectiveHeight }
      lastEmittedRef.current = {
        x: boxRect.x,
        y: boxRect.y,
        width: effectiveWidth,
        height: effectiveHeight,
      }
    } else if (activeProtocol === "sixel") {
      // Sixel cannot transmit PNG directly (unlike Kitty's f=100), so we
      // decode PNG → RGBA via upng-js, then hand off to encodeSixel().
      // Decode failures (malformed PNG) leave the reserved space blank
      // rather than tearing the screen with garbled escape sequences.
      // Sixel has no per-image-id delete; rely on the cell-buffer
      // overwrite from the next paintFrame to clear the stale image.
      const rgba = decodePngToRgba(pngData)
      if (rgba) {
        write(moveCursor + encodeSixel(rgba))
      }
    }
  }, [pngData, stdoutCtx, activeProtocol, effectiveWidth, effectiveHeight, boxRect.x, boxRect.y])

  // Cleanup: delete Kitty image on unmount
  useEffect(() => {
    const id = imageIdRef.current
    if (activeProtocol !== "kitty" || id == null || !stdoutCtx) return

    return () => {
      stdoutCtx.write(deleteKittyImage(id))
    }
  }, [activeProtocol, stdoutCtx])

  // If no protocol or no image data, render fallback text
  if (!activeProtocol || !pngData) {
    return <Text>{fallback}</Text>
  }

  // Reserve visual space with an empty box.
  // The image is drawn over this space via stdout escape sequences.
  // Fill with spaces so the cell buffer allocates the right area.
  const spaceLine = " ".repeat(Math.max(0, effectiveWidth))
  const spaceContent = Array.from({ length: Math.max(0, effectiveHeight) }, () => spaceLine).join(
    "\n",
  )

  return <Text>{spaceContent}</Text>
}
