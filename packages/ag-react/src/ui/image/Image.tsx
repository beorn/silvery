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
import { useBoxRect } from "../../hooks/useLayout"
import { encodeKittyImage, isKittyGraphicsSupported, deleteKittyImage } from "./kitty-graphics"
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
  // LAYOUT_READ_AT_RENDER: image rendering writes Kitty/Sixel escape
  // sequences with explicit pixel/cell dimensions. The encoded image must
  // match the reserved cell area exactly, so `width`/`height` need to be
  // resolved before encoding — flex auto-sizing isn't enough because the
  // pixel-to-cell ratio depends on the actual cell count. Consumers may
  // pass `width`/`height` to skip the auto-fill read.
  const boxRect = useBoxRect()
  const stdoutCtx = useContext(StdoutContext)
  const imageIdRef = useRef<number | null>(null)

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

  // Determine effective dimensions
  const effectiveWidth = requestedWidth ?? boxRect.width
  const effectiveHeight = requestedHeight ?? Math.max(1, Math.floor(effectiveWidth / 2))

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
  // On dep-change re-emission (boxRect or dimensions changed across a
  // re-render), DELETE the previous Kitty image before placing a new
  // one. Without this, every layout-cascade re-render leaves a stacked
  // copy of the image at the prior cell coords (Kitty z=1 keeps them
  // all above the text layer), giving the user-visible "doubled" /
  // "tripled" image effect during startup. The cleanup-on-unmount
  // effect below only fires at component teardown, not per re-emit.
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

    const { write } = stdoutCtx
    const moveCursor = `\x1b[${boxRect.y + 1};${boxRect.x + 1}H`

    if (activeProtocol === "kitty") {
      const id = imageIdRef.current
      // Delete prior placement (no-op if this is the first emission —
      // Kitty silently ignores deletes for unknown ids).
      if (id != null) write(deleteKittyImage(id))
      const seq = encodeKittyImage(pngData, {
        width: effectiveWidth,
        height: effectiveHeight,
        id: id ?? undefined,
      })
      write(moveCursor + seq)
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
    return (
      <silvery-box width={effectiveWidth} height={effectiveHeight}>
        <silvery-text>{fallback}</silvery-text>
      </silvery-box>
    )
  }

  // Reserve visual space with an empty box.
  // The image is drawn over this space via stdout escape sequences.
  // Fill with spaces so the cell buffer allocates the right area.
  const spaceLine = " ".repeat(Math.max(0, effectiveWidth))
  const spaceContent = Array.from({ length: Math.max(0, effectiveHeight) }, () => spaceLine).join(
    "\n",
  )

  return (
    <silvery-box width={effectiveWidth} height={effectiveHeight}>
      <silvery-text>{spaceContent}</silvery-text>
    </silvery-box>
  )
}
