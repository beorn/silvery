/**
 * Backdrop — render-time fade effect.
 *
 * Wraps content that should appear faded (pushed toward the background) while
 * a modal or drag overlay is active. This is a render-time cell transform —
 * analogous to CSS `backdrop-filter: opacity(...)`. The wrapped children
 * render normally; the renderer applies `blend(fg, bg, amount)` in OKLab on
 * every cell covered by this node's screen rect after the content phase.
 *
 * At the ANSI 16 tier, the fade degrades to SGR 2 (dim). At the `none`
 * (monochrome) tier, the fade is a no-op — separation comes from the modal's
 * border and box-drawing characters.
 *
 * Usage:
 * ```tsx
 * <Backdrop fade={0.5}>
 *   <Board />
 * </Backdrop>
 * <DragGhost />  {/* crisp, on top, not wrapped *\/}
 * ```
 *
 * For modals, prefer the `fade` prop on `ModalDialog` / `PickerDialog` — it
 * fades everything OUTSIDE the dialog (via `data-backdrop-fade-excluded`)
 * without wrapping siblings.
 */
import React from "react"
import { Box, type BoxProps } from "../../components/Box"

export interface BackdropProps extends Omit<BoxProps, "children"> {
  /**
   * Fade amount in [0, 1]. 0 = crisp (no fade), 1 = fully blended into bg
   * (fg == bg, effectively invisible text). Default: 0.4.
   *
   * Interpreted by the `backdrop-phase` pass after content rendering — the
   * fade is NOT applied in React; it's a cell-level transform on the finished
   * buffer. Fade propagates through the subtree via the node's screen rect.
   */
  fade?: number
  /** Children to wrap. */
  children: React.ReactNode
}

/**
 * Wrap content in a render-time fade region. See {@link BackdropProps.fade}.
 *
 * `fade={0}` is a passthrough — no data attribute is emitted, no pass work.
 */
export function Backdrop({ fade = 0.7, children, ...boxProps }: BackdropProps): React.ReactElement {
  const clamped = clamp01(fade)
  const attrs: Record<string, unknown> = clamped > 0 ? { "data-backdrop-fade": clamped } : {}
  return (
    <Box {...boxProps} {...attrs}>
      {children}
    </Box>
  )
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}
