/**
 * ModalOverlay Component
 *
 * Full-screen scrim that centers a modal and dismisses it on an outside click.
 * Wrap a `ModalDialog` (or any modal content) so mouse users can click the
 * dimmed backdrop to close — matching the Esc affordance.
 *
 * It owns the two-Box dance that every modal otherwise hand-rolls:
 *   - an absolutely-positioned, screen-filling backdrop whose `onClick` calls
 *     `onClose` (so a click anywhere outside the dialog body dismisses it), and
 *   - an inner guard Box that `stopPropagation()`s clicks so an empty-space
 *     click INSIDE the dialog does not bubble to the backdrop and close it.
 *
 * `position="absolute"` lifts the overlay out of the surrounding layout flow so
 * it fills the screen + centers regardless of where the modal is mounted in the
 * tree. The guard is capped at the screen, so a modal taller or wider than the
 * terminal is pinned to it (title and footer visible, body scrollable) instead
 * of being centred off both edges.
 *
 * ```tsx
 * <ModalOverlay onClose={() => setOpen(false)}>
 *   <ModalDialog title="Settings" onClose={() => setOpen(false)}>…</ModalDialog>
 * </ModalOverlay>
 * ```
 */
import React from "react"
import { Box } from "../../components/Box"

export interface ModalOverlayProps {
  /** Called when the backdrop (outside the dialog body) is clicked. */
  onClose?: () => void
  /** The modal content (typically a ModalDialog), centered over the scrim. */
  children: React.ReactNode
}

export function ModalOverlay({ onClose, children }: ModalOverlayProps): React.ReactElement {
  return (
    <Box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      onClick={() => onClose?.()}
    >
      {/* Viewport clamp. A centred child taller or wider than the screen
          would overflow equally off BOTH edges (that is what justify-content
          center does with negative remaining space, in CSS, in Yoga and in
          flexily), losing the border, the title and the first rows above
          row 0. This full-width row is capped at the screen height on the
          overlay's main axis, where a percent max resolves against the
          screen; it centres the guard horizontally and carries no click
          handler, so a click beside the dialog still reaches the backdrop.
          A fitting modal is centred exactly as before; an oversized one is
          pinned to the screen, the dialog stretches to the clamped height and
          its body scrolls (ModalDialog's content area). */}
      <Box flexDirection="row" width="100%" justifyContent="center" maxHeight="100%" flexShrink={0}>
        {/* Inner guard: clicks on the dialog body stop here, so an empty-space
            click inside the dialog never bubbles to the backdrop's onClose.
            Silvery dispatches clicks target→root (DOM-style bubbling). Width
            needs no max: the guard is a flex item of the full-width row, so a
            guard wider than the screen simply shrinks to it (CSS default
            flexShrink 1) once minWidth 0 lifts the auto min-size floor its
            child's declared width would set; ModalDialog's own minWidth 0
            lets the dialog shrink with it and reflow. A percent max on this
            box is deliberately NOT used: on a cross axis flexily resolves it
            against the child's own measured size, and on this main axis it
            collapsed the guard in testing. */}
        <Box minWidth={0} onClick={(event) => event.stopPropagation()}>
          {children}
        </Box>
      </Box>
    </Box>
  )
}
