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
import { resolveInteractionTreatment, type InteractionRole } from "@silvery/ag"
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
  /**
   * Show a popover. `owner` identifies the handler instance requesting it;
   * subsequent owned `hide` calls from OTHER owners are no-ops, so an
   * unrelated handler mounting/unmounting (a transcript leaf streaming in)
   * can never close a popover it doesn't own. The flicker-guard pattern,
   * ported from km-tui's popover store (bead @km/tui/14289-popover-flicker).
   */
  show(content: PopoverContent, anchor: PopoverAnchor, owner?: symbol): void
  /**
   * Hide the popover. With `owner`, only hides when that owner currently
   * holds the popover (guarded). Without `owner`, force-hides (external
   * dismissals: click-away, escape).
   */
  hide(options?: { immediate?: boolean; owner?: symbol }): void
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
  /** The handler instance whose popover is currently showing (or pending). */
  const ownerRef = useRef<symbol | null>(null)

  const clearHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const show = useCallback(
    (content: PopoverContent, anchor: PopoverAnchor, owner?: symbol) => {
      if (overlayHoveredRef.current) return
      clearHide()
      ownerRef.current = owner ?? null
      setState({ content, anchor })
    },
    [clearHide],
  )

  const hide = useCallback(
    (options?: { immediate?: boolean; owner?: symbol }) => {
      // Owned hides only apply when the caller owns the visible popover —
      // an unrelated handler (a new transcript leaf mounting, the unmount
      // cleanup of a different row) must not close someone else's popover.
      // This is the flap fix: pre-guard, every handler mount/unmount hid
      // the global popover while the user was still cmd-hovering an anchor.
      if (
        options?.owner !== undefined &&
        ownerRef.current !== null &&
        ownerRef.current !== options.owner
      ) {
        return
      }
      clearHide()
      if (options?.immediate) {
        overlayHoveredRef.current = false
        ownerRef.current = null
        setState({ content: null, anchor: null })
        return
      }
      if (overlayHoveredRef.current) return
      hideTimerRef.current = setTimeout(() => {
        hideTimerRef.current = null
        ownerRef.current = null
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
  const role: InteractionRole = options?.trigger === "hover" ? "control" : "content-link"
  const reveal = resolveInteractionTreatment(
    { hovered: false, armed: false, selected: false, focused: false, dropTarget: false },
    role,
    "bare",
  ).reveal
  const requiresCmd = reveal === "cmd-hover"
  const { super: cmdHeld } = useModifierKeys({ enabled: requiresCmd && hover.isHovered })
  const pendingShowRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const anchorRef = useRef<PopoverAnchor | null>(null)
  const hoverRef = useRef(false)
  const cmdHeldRef = useRef(false)
  // Latest content lives in a REF, not in callback deps. Consumers rebuild
  // the content object on every render (live metrics chrome re-renders every
  // second); if `scheduleShow` depended on `content`, every parent render
  // would restart the dwell timer (a parent ticking faster than
  // HOVER_SHOW_DELAY_MS starves the popover — it never opens) and re-run the
  // arm/hide effect (the "popover flaps open/closed under a stationary
  // cursor" report, silvercode 2026-06-10). The ref keeps the timers and
  // effects identity-stable across renders while `show` always reads the
  // freshest content.
  const contentRef = useRef(content)
  contentRef.current = content
  // True from the moment this handler's popover is showing until it hides
  // for any reason — used to refresh content in place without a new dwell.
  const shownRef = useRef(false)
  // Stable per-instance identity: owned show/hide so this handler can never
  // close a popover held by a different anchor (and vice versa).
  const ownerIdRef = useRef<symbol | null>(null)
  ownerIdRef.current ??= Symbol("popover-owner")
  const ownerId = ownerIdRef.current

  useEffect(() => {
    cmdHeldRef.current = cmdHeld
  }, [cmdHeld])

  const isRevealActive = useCallback(
    () => reveal === "hover" || cmdHeldRef.current || lastModifierState.super,
    [reveal],
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
      // A reveal-active recheck while dwell is already pending must NOT restart
      // the clock; the first complete dwell wins.
      if (pendingShowRef.current !== null) return
      pendingShowRef.current = setTimeout(() => {
        pendingShowRef.current = null
        if (!hoverRef.current) return
        if (anchorRef.current !== anchor) return
        if (!isRevealActive()) return
        shownRef.current = true
        popover.show(contentRef.current, anchor, ownerId)
      }, HOVER_SHOW_DELAY_MS)
    },
    [popover, isRevealActive, ownerId],
  )

  const hideNow = useCallback(() => {
    shownRef.current = false
    popover?.hide({ owner: ownerId })
  }, [popover, ownerId])

  useEffect(() => {
    if (!popover) return
    if (!hoverRef.current || !hover.isHovered) {
      clearPending()
      hideNow()
      return
    }
    const anchor = anchorRef.current
    if (isRevealActive() && anchor) {
      scheduleShow(anchor)
      return
    }
    if (reveal === "hover") clearPending()
    hideNow()
  }, [
    cmdHeld,
    hover.isHovered,
    popover,
    scheduleShow,
    clearPending,
    hideNow,
    isRevealActive,
    reveal,
  ])

  // Content refresh: when the popover is already SHOWING for this anchor and
  // the consumer re-rendered with new content, swap the content in place —
  // no dwell, no hide/show cycle. Runs every render by design (content
  // identity changes every render for live consumers); `show` is a setState
  // under the hood, so React bails out when nothing visible changed.
  useEffect(() => {
    if (!popover) return
    const anchor = anchorRef.current
    if (!shownRef.current || !hoverRef.current || anchor === null) return
    popover.show(contentRef.current, anchor, ownerId)
  })

  useEffect(() => {
    return () => {
      clearPending()
      shownRef.current = false
      popover?.hide({ owner: ownerId })
    }
  }, [clearPending, popover, ownerId])

  const onMouseEnter = useCallback(
    (e: SilveryMouseEvent) => {
      hover.onMouseEnter(e)
      hoverRef.current = true
      // `e` is pooled — capture coords eagerly.
      const anchor = { x: e.x, y: e.y }
      anchorRef.current = anchor
      if (!popover) return
      // Fresh hover: restart the dwell against the new anchor.
      clearPending()
      scheduleShow(anchor)
    },
    [hover, popover, clearPending, scheduleShow],
  )
  const onMouseLeave = useCallback(
    (e: SilveryMouseEvent) => {
      hover.onMouseLeave(e)
      hoverRef.current = false
      anchorRef.current = null
      if (!popover) return
      clearPending()
      hideNow()
    },
    [hover, popover, clearPending, hideNow],
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
  // The box is as wide as its content, capped by maxWidth (#26388), so when
  // the cap would cross the right margin place it by `right`: it then ends at
  // the margin whatever its content width, instead of a `left` computed from
  // the cap that leaves narrow content short of its anchor (#26660). Pass
  // `left` OR `right`, never both, as `top`/`bottom` below.
  const preferredLeft = anchor.x + (content.anchorOffsetX ?? 0)
  const horizontal =
    preferredLeft + maxWidth <= columns - EDGE_X
      ? { left: Math.max(EDGE_X, preferredLeft) }
      : columns - EDGE_X - maxWidth >= EDGE_X
        ? { right: EDGE_X }
        : { left: EDGE_X }

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
      {...horizontal}
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
