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
 * re-emits frozen items that were visible at the new width. Items that
 * have scrolled into terminal scrollback are not re-emitted (they can't
 * be modified — the terminal owns them). This prevents duplicate entries
 * at different widths when resizing multiple times.
 *
 * Supports optional OSC 133 semantic markers for terminal prompt navigation
 * (Cmd+Up/Cmd+Down in iTerm2, Kitty, WezTerm, Ghostty).
 */

import { useContext, useLayoutEffect, useRef } from "react"
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

  // Track cumulative frozen line count for visible-range calculation on resize.
  // This is the total number of terminal lines occupied by all frozen items.
  // Used to determine which items have scrolled into terminal scrollback (and
  // therefore can't be re-emitted — the terminal owns them).
  const totalFrozenLinesRef = useRef(0)

  // Refs for current values — avoid stale closures in useLayoutEffect
  const renderRef = useRef(render)
  renderRef.current = render
  const itemsRef = useRef(items)
  itemsRef.current = items
  const markersRef = useRef(markers)
  markersRef.current = markers
  const frozenCountRef = useRef(frozenCount)
  frozenCountRef.current = frozenCount

  // Normal freeze path: write newly frozen items to scrollback.
  //
  // In inline mode with promoteScrollback (run() runtime), delegates frozen
  // content to the output phase. The output phase writes frozen content + live
  // content in a single target.write() — no screen clearing, no cursor desync,
  // no flicker.
  //
  // Without promoteScrollback (test renderer, static rendering, or older runtimes),
  // falls back to direct stdout writes with notifyScrollback.
  useLayoutEffect(() => {
    const prev = prevFrozenCountRef.current
    if (frozenCount > prev) {
      if (stdoutCtx?.promoteScrollback) {
        // Inline mode: build frozen content string and delegate to output phase.
        // No direct stdout writes — the output phase handles everything.
        let frozenContent = ""
        let linesWritten = 0
        for (let i = prev; i < frozenCount; i++) {
          const { before, after } = resolveMarkers(markers, items[i]!, i)
          if (before) frozenContent += before
          const text = render(items[i]!, i) + "\n"
          frozenContent += text.replace(/\n/g, "\x1b[K\r\n")
          linesWritten += countNewlines(text)
          renderedStringsRef.current.set(i, text)
          if (after) frozenContent += after
        }
        totalFrozenLinesRef.current += linesWritten
        stdoutCtx.promoteScrollback(frozenContent, linesWritten)
      } else {
        // Non-inline / legacy: write only newly frozen items directly
        let linesWritten = 0
        for (let i = prev; i < frozenCount; i++) {
          const { before, after } = resolveMarkers(markers, items[i]!, i)
          if (before) stdout.write(before)
          const text = render(items[i]!, i) + "\n"
          stdout.write(text.replace(/\n/g, "\r\n"))
          linesWritten += countNewlines(text)
          renderedStringsRef.current.set(i, text)
          if (after) stdout.write(after)
        }
        totalFrozenLinesRef.current += linesWritten
        stdoutCtx?.notifyScrollback?.(linesWritten)
      }
    }
    prevFrozenCountRef.current = frozenCount
  }, [frozenCount, items, render, stdout, stdoutCtx, markers])

  // Resize path: re-emit VISIBLE frozen items when width changes.
  //
  // On resize, the visible screen is cleared and live items are re-rendered by
  // the output phase. Frozen items on the visible screen are wiped and must be
  // re-emitted at the new width. Items that have scrolled into terminal scrollback
  // (above the visible area) CANNOT be modified — the terminal owns them. We must
  // not re-emit those items, otherwise duplicates appear at different widths each
  // time the user resizes.
  //
  // Strategy:
  // 1. Use totalFrozenLinesRef to know how many total frozen lines exist
  // 2. Read the output phase's cursor row to estimate live content height
  // 3. Compute which frozen items are on the visible screen
  // 4. Only re-emit those items at the new width
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

    // Determine which frozen items are on the visible screen (not in scrollback).
    // Items in terminal scrollback can't be modified — re-emitting them creates duplicates.
    const termRows = (stdout as { rows?: number }).rows ?? 24

    // Read live content height BEFORE resetting inline cursor state
    const liveCursorRow = stdoutCtx?.getInlineCursorRow?.() ?? -1
    const liveEstimate = liveCursorRow >= 0 ? liveCursorRow + 1 : 1

    // Frozen lines that have scrolled into terminal scrollback
    const totalFrozen = totalFrozenLinesRef.current
    const frozenLinesInScrollback = Math.max(0, totalFrozen + liveEstimate - termRows)

    // Find the first frozen item that is (at least partially) on the visible screen
    let firstVisibleItem = 0
    if (frozenLinesInScrollback > 0) {
      let cumLines = 0
      for (let i = 0; i < currentFrozenCount; i++) {
        const prevText = renderedStringsRef.current.get(i)
        cumLines += prevText ? countNewlines(prevText) : 1
        if (cumLines > frozenLinesInScrollback) {
          firstVisibleItem = i
          break
        }
      }
      // If ALL frozen items are in scrollback, nothing to re-emit
      if (cumLines <= frozenLinesInScrollback) {
        // Still need to update stored strings for future renders
        for (let i = 0; i < currentFrozenCount; i++) {
          renderedStringsRef.current.set(i, currentRender(currentItems[i]!, i) + "\n")
        }
        // Recompute totalFrozenLines at new width
        let newTotal = 0
        for (let i = 0; i < currentFrozenCount; i++) {
          newTotal += countNewlines(renderedStringsRef.current.get(i)!)
        }
        totalFrozenLinesRef.current = newTotal
        prevFrozenCountRef.current = currentFrozenCount
        return
      }
    }

    // Re-render visible frozen items at the new width
    const newStrings: Map<number, string> = new Map()
    for (let i = firstVisibleItem; i < currentFrozenCount; i++) {
      newStrings.set(i, currentRender(currentItems[i]!, i) + "\n")
    }

    // 1. Reset output phase cursor tracking
    stdoutCtx?.resetInlineCursor?.()

    // 2. Clear visible screen: move cursor to top of visible area, then erase down
    //    \x1b[9999A moves cursor up (clamped at row 0 of visible screen)
    //    \r moves to column 0
    //    \x1b[J erases from cursor to end of screen
    stdout.write("\x1b[9999A\r\x1b[J")

    // 3. Re-emit only VISIBLE frozen items at new width
    let linesWritten = 0
    for (let i = firstVisibleItem; i < currentFrozenCount; i++) {
      const { before, after } = resolveMarkers(currentMarkers, currentItems[i]!, i)

      if (before) stdout.write(before)

      const text = newStrings.get(i)!
      stdout.write(text.replace(/\n/g, "\r\n"))
      linesWritten += countNewlines(text)

      if (after) stdout.write(after)
    }

    // 4. Notify scheduler about scrollback displacement
    stdoutCtx?.notifyScrollback?.(linesWritten)

    // 5. Update stored strings for visible items (keep old strings for scrollback items)
    for (const [i, text] of newStrings) {
      renderedStringsRef.current.set(i, text)
    }
    // Also update scrollback items' strings at new width for future resize calculations
    for (let i = 0; i < firstVisibleItem; i++) {
      renderedStringsRef.current.set(i, currentRender(currentItems[i]!, i) + "\n")
    }

    // 6. Recompute total frozen lines (mix of old-width scrollback + new-width visible)
    let newTotal = 0
    for (let i = 0; i < currentFrozenCount; i++) {
      newTotal += countNewlines(renderedStringsRef.current.get(i)!)
    }
    totalFrozenLinesRef.current = newTotal

    // 7. Sync prevFrozenCountRef so the freeze useLayoutEffect doesn't
    //    re-write items we just emitted.
    //    This prevents double-writes when resize + compact happen in the same frame.
    prevFrozenCountRef.current = currentFrozenCount
  }, [width, stdout, stdoutCtx])

  return frozenCount
}
