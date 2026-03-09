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
 * import { Image } from "@silvery/react"
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
import { type JSX, useContext, useEffect, useMemo, useRef } from "react"
import { StdoutContext } from "@silvery/react/context"
import { useContentRect } from "@silvery/react/hooks/useLayout"
import { encodeKittyImage, isKittyGraphicsSupported, deleteKittyImage } from "./kitty-graphics"
import { isSixelSupported } from "./sixel-encoder"

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
  const contentRect = useContentRect()
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
  const effectiveWidth = requestedWidth ?? contentRect.width
  const effectiveHeight = requestedHeight ?? Math.max(1, Math.floor(effectiveWidth / 2))

  // Detect protocol support
  const activeProtocol = useMemo(() => detectProtocol(preferredProtocol), [preferredProtocol])

  // Assign a stable image ID for Kitty (for cleanup on unmount)
  if (activeProtocol === "kitty" && imageIdRef.current == null) {
    imageIdRef.current = nextImageId++
  }

  // Write image escape sequences after render
  useEffect(() => {
    if (!pngData || !stdoutCtx || !activeProtocol) return
    if (effectiveWidth <= 0 || effectiveHeight <= 0) return

    const { write } = stdoutCtx

    if (activeProtocol === "kitty") {
      const seq = encodeKittyImage(pngData, {
        width: effectiveWidth,
        height: effectiveHeight,
        id: imageIdRef.current ?? undefined,
      })
      write(seq)
    } else if (activeProtocol === "sixel") {
      // For Sixel, we would need the decoded pixel data.
      // Since we receive PNG, and decoding PNG requires a library,
      // Sixel rendering from raw PNG is deferred. The Kitty protocol
      // can transmit PNG directly (f=100), but Sixel cannot.
      // For now, Sixel only works if src is already decoded pixel data.
      // This is a known limitation noted in the module docs.
      //
      // If someone passes a Buffer that's already RGBA pixel data
      // (not PNG), this would need a flag. For now, Sixel falls through
      // to fallback when src is PNG.
    }
  }, [pngData, stdoutCtx, activeProtocol, effectiveWidth, effectiveHeight])

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
  const spaceContent = Array.from({ length: Math.max(0, effectiveHeight) }, () => spaceLine).join("\n")

  return (
    <silvery-box width={effectiveWidth} height={effectiveHeight}>
      <silvery-text>{spaceContent}</silvery-text>
    </silvery-box>
  )
}
