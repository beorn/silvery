/**
 * Popover — hover-driven floating overlay.
 *
 * Canonical silvery primitive, extracted from km-logview (the first consumer,
 * which had this inlined with a structured `{title, lines}` content). This
 * version accepts arbitrary React content so apps can render rich popovers
 * (colored text, nested Boxes, token-styled labels).
 *
 * Semantics:
 *   - `usePopoverHandlers(content)` returns mouse-enter / mouse-leave handlers.
 *     The default trigger is `cmd-hover`: the pointer must be over the anchor
 *     and Cmd/Super must be held. Pass `{ trigger: "hover" }` for plain-hover
 *     surfaces.
 *   - The popover overlay re-cancels the hide on mouse-enter (so you can
 *     actually read / interact with the content) and re-triggers it on leave.
 *   - Overlay is positioned via `position="absolute"` with marginTop /
 *     marginLeft, clamped to the `useWindowSize` viewport. Below-right of the
 *     anchor when it fits; flipped / clamped otherwise.
 *
 * Why in silvery (not per-app): km-logview and silvercode both want hover
 * popovers with the same semantics. Third consumers will come (km-tui omnibox,
 * bead detail peek). Owning this at the framework level removes three copies.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { SilveryMouseEvent } from "@silvery/ag-term/mouse-events"
import { Box } from "./Box"
import { useHover } from "../hooks/useHover"
import { useKineticScroll } from "../hooks/useKineticScroll"
import { lastModifierState, useModifierKeys } from "../hooks/useModifierKeys"
import { useWindowSize } from "../hooks/useWindowSize"

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface PopoverAnchor {
  /** Terminal column (0-indexed) of the anchor point. */
  x: number
  /** Terminal row (0-indexed) of the anchor point. */
  y: number
}

export interface PopoverContent {
  /** Arbitrary React content (Box, Text, nested structures). */
  body: React.ReactNode
  /** Max width in columns. Default: 48. */
  maxWidth?: number
  /**
   * Drop the round border. Default: true. Borderless popovers keep body
   * padding (2 columns left/right, 1 row top/bottom) so they read as a
   * lightweight overlay instead of a framed modal.
   */
  borderless?: boolean
  /**
   * Anchor flush to the cursor row (no `+1` row gap below). Default: false
   * (one-row gap below the cursor when placing below; no effect when placing above).
   */
  flushTop?: boolean
  /**
   * Horizontal offset added to the anchor column. Positive shifts the popover
   * right of the cursor, leaving the left side of nearby lines visible /
   * hoverable. Default: 0.
   */
  anchorOffsetX?: number
}

export type PopoverTrigger = "cmd-hover" | "hover"

export interface PopoverHandlerOptions {
  /** Default: "cmd-hover". */
  trigger?: PopoverTrigger
}

interface PopoverState {
  content: PopoverContent | null
  anchor: PopoverAnchor | null
}

interface PopoverCtxValue {
  show(content: PopoverContent, anchor: PopoverAnchor): void
  hide(options?: { immediate?: boolean }): void
  /** Cancel a pending hide — call when mouse enters the popover itself. */
  cancelHide(): void
}

// -----------------------------------------------------------------------------
// Timing
// -----------------------------------------------------------------------------

/** Dwell before a hover fires the popover. */
export const HOVER_SHOW_DELAY_MS = 500
/** Grace period for cursor transit from anchor into popover. */
export const HIDE_DELAY_MS = 200

// -----------------------------------------------------------------------------
// Context
// -----------------------------------------------------------------------------

const PopoverCtx = createContext<PopoverCtxValue | null>(null)

export function usePopover(): PopoverCtxValue | null {
  return useContext(PopoverCtx)
}

// -----------------------------------------------------------------------------
// Provider
// -----------------------------------------------------------------------------

export function PopoverProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [state, setState] = useState<PopoverState>({ content: null, anchor: null })
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const overlayHoveredRef = useRef(false)

  const clearHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const show = useCallback(
    (content: PopoverContent, anchor: PopoverAnchor) => {
      if (overlayHoveredRef.current) return
      clearHide()
      setState({ content, anchor })
    },
    [clearHide],
  )

  const hide = useCallback(
    (options?: { immediate?: boolean }) => {
      clearHide()
      if (options?.immediate) {
        overlayHoveredRef.current = false
        setState({ content: null, anchor: null })
        return
      }
      if (overlayHoveredRef.current) return
      hideTimerRef.current = setTimeout(() => {
        hideTimerRef.current = null
        setState({ content: null, anchor: null })
      }, HIDE_DELAY_MS)
    },
    [clearHide],
  )

  const cancelHide = useCallback(() => {
    clearHide()
  }, [clearHide])

  const onOverlayEnter = useCallback(() => {
    overlayHoveredRef.current = true
    clearHide()
  }, [clearHide])

  const onOverlayLeave = useCallback(() => {
    overlayHoveredRef.current = false
    hide()
  }, [hide])

  useEffect(() => clearHide, [clearHide])

  const value = useMemo<PopoverCtxValue>(
    () => ({ show, hide, cancelHide }),
    [show, hide, cancelHide],
  )

  return (
    <PopoverCtx.Provider value={value}>
      {children}
      <PopoverOverlay state={state} onEnter={onOverlayEnter} onLeave={onOverlayLeave} />
    </PopoverCtx.Provider>
  )
}

// -----------------------------------------------------------------------------
// Hook: spread handlers onto any element
// -----------------------------------------------------------------------------

/**
 * Returns `{ isHovered, onMouseEnter, onMouseLeave }` for a hover target that
 * can show a popover after dwell. `isHovered` is true from the moment the
 * cursor enters the element (no dwell) — callers use it to highlight
 * interactive rows. The default `cmd-hover` trigger requires both hover and
 * Cmd/Super; plain-hover consumers must opt in with `{ trigger: "hover" }`.
 */
export function usePopoverHandlers(
  content: PopoverContent,
  options?: PopoverHandlerOptions,
): {
  isHovered: boolean
  onMouseEnter: (e: SilveryMouseEvent) => void
  onMouseLeave: (e: SilveryMouseEvent) => void
} {
  const popover = usePopover()
  const hover = useHover()
  const trigger = options?.trigger ?? "cmd-hover"
  const requiresCmd = trigger === "cmd-hover"
  const { super: cmdHeld } = useModifierKeys({ enabled: requiresCmd && hover.isHovered })
  const pendingShowRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const anchorRef = useRef<PopoverAnchor | null>(null)
  const hoverRef = useRef(false)
  const cmdHeldRef = useRef(false)

  useEffect(() => {
    cmdHeldRef.current = cmdHeld
  }, [cmdHeld])

  const isArmed = useCallback(
    () => trigger === "hover" || cmdHeldRef.current || lastModifierState.super,
    [trigger],
  )

  const clearPending = useCallback(() => {
    if (pendingShowRef.current) {
      clearTimeout(pendingShowRef.current)
      pendingShowRef.current = null
    }
  }, [])

  const scheduleShow = useCallback(
    (anchor: PopoverAnchor) => {
      if (!popover) return
      clearPending()
      pendingShowRef.current = setTimeout(() => {
        pendingShowRef.current = null
        if (!hoverRef.current) return
        if (anchorRef.current !== anchor) return
        if (!isArmed()) return
        popover.show(content, anchor)
      }, HOVER_SHOW_DELAY_MS)
    },
    [popover, content, clearPending, isArmed],
  )

  useEffect(() => {
    if (!popover) return
    if (!hoverRef.current || !hover.isHovered) {
      clearPending()
      popover.hide()
      return
    }
    const anchor = anchorRef.current
    if (isArmed() && anchor) {
      scheduleShow(anchor)
      return
    }
    if (trigger === "hover") clearPending()
    popover.hide()
  }, [cmdHeld, hover.isHovered, popover, scheduleShow, clearPending, isArmed, trigger])

  useEffect(() => {
    return () => {
      clearPending()
      popover?.hide()
    }
  }, [clearPending, popover])

  const onMouseEnter = useCallback(
    (e: SilveryMouseEvent) => {
      hover.onMouseEnter(e)
      hoverRef.current = true
      // `e` is pooled — capture coords eagerly.
      const anchor = { x: e.x, y: e.y }
      anchorRef.current = anchor
      if (!popover) return
      scheduleShow(anchor)
    },
    [hover, popover, scheduleShow, trigger],
  )
  const onMouseLeave = useCallback(
    (e: SilveryMouseEvent) => {
      hover.onMouseLeave(e)
      hoverRef.current = false
      anchorRef.current = null
      if (!popover) return
      clearPending()
      popover.hide()
    },
    [hover, popover, clearPending],
  )
  return { isHovered: hover.isHovered, onMouseEnter, onMouseLeave }
}

// -----------------------------------------------------------------------------
// Overlay
// -----------------------------------------------------------------------------

function PopoverOverlay({
  state,
  onEnter,
  onLeave,
}: {
  state: PopoverState
  onEnter: () => void
  onLeave: () => void
}): React.ReactElement | null {
  const { columns, rows } = useWindowSize()
  // Kinetic wheel scroll for tall content. `maxScroll` is left undefined —
  // the layout engine clamps via `overflow="scroll"`, and resetting on
  // content change is handled by the key prop on the inner Box below.
  const { scrollOffset, onWheel } = useKineticScroll({})
  const { content, anchor } = state
  if (!content || !anchor) return null

  // Edge margins: popover must stay at least this far from the viewport
  // edges. 2 cols (left/right) + 1 row (top/bottom) per design convention.
  const EDGE_X = 2
  const EDGE_Y = 1

  // Cap width at the smaller of the requested maxWidth and the viewport
  // width minus edge margins on both sides.
  const maxWidth = Math.min(content.maxWidth ?? 48, Math.max(20, columns - EDGE_X * 2))

  // Placement heuristic: flip to whichever side has more space. When
  // placing ABOVE, anchor the popover from the viewport BOTTOM (using the
  // `bottom` prop) so the popover's bottom edge sits one row above the
  // hover target. This is critical — using `top = anchor.y - maxHeight`
  // would pin a content-sized Box to the top of the screen (Box auto-
  // sizes to content, so the gap to the anchor was huge). With `bottom`,
  // the Box grows upward from near the anchor.
  const spaceBelow = Math.max(0, rows - anchor.y - 1 - EDGE_Y)
  const spaceAbove = Math.max(0, anchor.y - EDGE_Y)
  const placeAbove = spaceAbove > spaceBelow

  const maxHeight = Math.max(4, placeAbove ? spaceAbove : spaceBelow)

  // Horizontal clamp: prefer anchor.x + offset but enforce both edge margins.
  let left = anchor.x + (content.anchorOffsetX ?? 0)
  if (left + maxWidth > columns - EDGE_X) left = columns - EDGE_X - maxWidth
  if (left < EDGE_X) left = EDGE_X

  // Positional props — pass `top` OR `bottom`, never both. Below-anchor
  // gets `top = anchor.y + 1` for a 1-row gap by default; `flushTop: true`
  // drops the gap so the popover sits directly on the anchor row. Above-
  // anchor: `bottom = rows - anchor.y`.
  const belowTop = (content.flushTop ?? false) ? anchor.y : anchor.y + 1
  const placement = placeAbove ? { bottom: rows - anchor.y } : { top: belowTop }

  // Borderless is the default popup chrome: no frame, still padded.
  // Callers can opt back into the old framed surface with borderless:false.
  const borderless = content.borderless ?? true
  const paddingX = borderless ? 2 : 1
  const paddingY = borderless ? 1 : 0
  const bodyMaxWidth = Math.max(1, maxWidth - paddingX * 2)

  return (
    <Box
      position="absolute"
      {...placement}
      left={left}
      maxWidth={maxWidth}
      maxHeight={maxHeight}
      flexDirection="column"
      overflow="scroll"
      scrollOffset={scrollOffset}
      onWheel={onWheel}
      borderStyle={borderless ? undefined : "round"}
      borderColor={borderless ? undefined : "$fg-muted"}
      backgroundColor="$bg-surface-overlay"
      paddingX={paddingX}
      paddingY={paddingY}
      onMouseEnter={(e: SilveryMouseEvent) => {
        e.stopPropagation()
        onEnter()
      }}
      onMouseLeave={(e: SilveryMouseEvent) => {
        e.stopPropagation()
        onLeave()
      }}
      onClick={(e: SilveryMouseEvent) => {
        // Don't let the underlying row handle a click on the popover chrome.
        e.stopPropagation()
      }}
    >
      <Box flexDirection="column" maxWidth={bodyMaxWidth} minWidth={0} overflow="hidden">
        {content.body}
      </Box>
    </Box>
  )
}
