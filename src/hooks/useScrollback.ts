/**
 * useScrollback - Push frozen items to terminal scrollback.
 *
 * Tracks a contiguous frozen prefix of items. When the frozen count
 * increases, renders newly frozen items and writes them to stdout.
 * Pair with VirtualList's `virtualized` prop for the complete experience.
 *
 * In inline mode, notifies the scheduler about lines written to stdout
 * so that cursor positioning accounts for the displacement.
 *
 * On terminal resize (width change), clears the visible screen and
 * re-emits all frozen items at the new width. This is necessary because
 * the output phase clears the visible screen on resize, wiping any
 * frozen items that were visible.
 *
 * Supports optional OSC 133 semantic markers for terminal prompt navigation
 * (Cmd+Up/Cmd+Down in iTerm2, Kitty, WezTerm, Ghostty).
 */

import { useContext, useEffect, useLayoutEffect, useRef } from "react"
import { StdoutContext } from "../context.js"
import { OSC133 } from "../osc-markers.js"

/** Custom marker callbacks for per-item control. */
export interface ScrollbackMarkerCallbacks<T> {
  /** Called before each frozen item's output. Return marker string or empty. */
  before?: (item: T, index: number) => string
  /** Called after each frozen item's output. Return marker string or empty. */
  after?: (item: T, index: number) => string
}

export interface UseScrollbackOptions<T> {
  /** Predicate: return true for items that should be frozen */
  frozen: (item: T, index: number) => boolean
  /** Render an item to a string for stdout output */
  render: (item: T, index: number) => string
  /** Output stream (defaults to process.stdout) */
  stdout?: { write(data: string): boolean }
  /**
   * Emit OSC 133 semantic markers around each frozen item for terminal navigation.
   *
   * - `true`: emit `OSC133.promptStart` before and `OSC133.commandEnd(0)` after each item
   * - Object with `before`/`after` callbacks: call for custom marker strings per item
   */
  markers?: boolean | ScrollbackMarkerCallbacks<T>
  /** Terminal width in columns. When this changes, frozen items are re-rendered and
   *  re-emitted if the content changed at the new width. */
  width?: number
}

/**
 * Count the number of newlines in a string.
 */
function countNewlines(s: string): number {
  let count = 0
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) === 10) count++
  }
  return count
}

/**
 * Resolve the before/after marker strings for a given item.
 */
function resolveMarkers<T>(
  markers: boolean | ScrollbackMarkerCallbacks<T> | undefined,
  item: T,
  index: number,
): { before: string; after: string } {
  if (!markers) return { before: "", after: "" }
  if (markers === true) {
    return { before: OSC133.promptStart, after: OSC133.commandEnd(0) }
  }
  return {
    before: markers.before?.(item, index) ?? "",
    after: markers.after?.(item, index) ?? "",
  }
}

/**
 * Track frozen items and write newly frozen ones to stdout.
 *
 * @returns The current frozen count (contiguous prefix length).
 */
export function useScrollback<T>(items: T[], options: UseScrollbackOptions<T>): number {
  const { frozen, render, stdout = process.stdout, markers, width } = options
  const stdoutCtx = useContext(StdoutContext)

  // Compute contiguous frozen prefix
  let frozenCount = 0
  for (let i = 0; i < items.length; i++) {
    if (!frozen(items[i]!, i)) break
    frozenCount++
  }

  const prevFrozenCountRef = useRef(0)

  // Stored rendered strings for content-change detection on resize
  const renderedStringsRef = useRef<Map<number, string>>(new Map())
  const prevWidthRef = useRef(width)

  // Refs for current values — avoid stale closures in useLayoutEffect
  const renderRef = useRef(render)
  renderRef.current = render
  const itemsRef = useRef(items)
  itemsRef.current = items
  const markersRef = useRef(markers)
  markersRef.current = markers
  const frozenCountRef = useRef(frozenCount)
  frozenCountRef.current = frozenCount

  // Normal freeze path: write newly frozen items to scrollback
  useEffect(() => {
    const prev = prevFrozenCountRef.current
    if (frozenCount > prev) {
      // Write newly frozen items to scrollback
      let linesWritten = 0
      for (let i = prev; i < frozenCount; i++) {
        const { before, after } = resolveMarkers(markers, items[i]!, i)

        // Emit marker before the item (markers are control sequences, not visible lines)
        if (before) stdout.write(before)

        const text = render(items[i]!, i) + "\n"
        // Use \r\n instead of bare \n to cancel DECAWM pending-wrap state.
        // When a line fills exactly terminal width, the cursor enters pending-
        // wrap. A bare \n would cause a double line advance in some terminals.
        // \r cancels pending-wrap by moving to column 0 first.
        const normalized = text.replace(/\n/g, "\r\n")
        stdout.write(normalized)
        linesWritten += countNewlines(text)

        // Store the rendered string for content-change detection
        renderedStringsRef.current.set(i, text)

        // Emit marker after the item
        if (after) stdout.write(after)
      }
      // Notify the scheduler so inline mode cursor positioning is correct
      stdoutCtx?.notifyScrollback?.(linesWritten)
    }
    prevFrozenCountRef.current = frozenCount
  }, [frozenCount, items, render, stdout, stdoutCtx, markers])

  // Resize path: re-emit frozen items when width changes.
  // On resize, the output phase clears the entire visible screen before rendering
  // live content. Frozen items visible on screen get wiped. We MUST re-emit them
  // before the output phase runs, regardless of whether content changed at the new width.
  // Uses useLayoutEffect so it fires BEFORE the pipeline generates live content.
  useLayoutEffect(() => {
    // Skip if no width prop (no resize tracking)
    if (width === undefined) return

    const prevWidth = prevWidthRef.current
    prevWidthRef.current = width

    // Skip if width unchanged or no frozen items
    if (prevWidth === undefined || width === prevWidth) return
    const currentFrozenCount = frozenCountRef.current
    if (currentFrozenCount === 0) return

    const currentItems = itemsRef.current
    const currentRender = renderRef.current
    const currentMarkers = markersRef.current

    // Re-render each frozen item at the new width
    const newStrings: Map<number, string> = new Map()
    for (let i = 0; i < currentFrozenCount; i++) {
      newStrings.set(i, currentRender(currentItems[i]!, i) + "\n")
    }

    // Always re-emit: the output phase will clear the visible screen on resize,
    // wiping any frozen items that are visible. We must re-emit them first.
    // (Content-change detection only determines whether to update stored strings.)

    // 1. Reset output phase cursor tracking
    stdoutCtx?.resetInlineCursor?.()

    // 2. Clear visible screen: move cursor to top of visible area, then erase down
    //    \x1b[9999A moves cursor up (clamped at row 0 of visible screen)
    //    \r moves to column 0
    //    \x1b[J erases from cursor to end of screen
    stdout.write("\x1b[9999A\r\x1b[J")

    // 3. Re-emit all frozen items at new width
    let linesWritten = 0
    for (let i = 0; i < currentFrozenCount; i++) {
      const { before, after } = resolveMarkers(currentMarkers, currentItems[i]!, i)

      if (before) stdout.write(before)

      const text = newStrings.get(i)!
      stdout.write(text.replace(/\n/g, "\r\n"))
      linesWritten += countNewlines(text)

      if (after) stdout.write(after)
    }

    // 4. Notify scheduler about scrollback displacement
    stdoutCtx?.notifyScrollback?.(linesWritten)

    // 5. Update stored strings
    renderedStringsRef.current = newStrings

    // 6. Sync prevFrozenCountRef so the freeze useEffect (which runs AFTER
    //    this useLayoutEffect) doesn't re-write items we just emitted.
    //    This prevents double-writes when resize + compact happen in the same frame.
    prevFrozenCountRef.current = currentFrozenCount
  }, [width, stdout, stdoutCtx])

  return frozenCount
}
