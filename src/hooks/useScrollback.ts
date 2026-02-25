/**
 * useScrollback - Push frozen items to terminal scrollback.
 *
 * Tracks a contiguous frozen prefix of items. When the frozen count
 * increases, renders newly frozen items and writes them to stdout.
 * Pair with VirtualList's `frozen` prop for the complete experience.
 *
 * In inline mode, notifies the scheduler about lines written to stdout
 * so that cursor positioning accounts for the displacement.
 *
 * Supports optional OSC 133 semantic markers for terminal prompt navigation
 * (Cmd+Up/Cmd+Down in iTerm2, Kitty, WezTerm, Ghostty).
 */

import { useContext, useEffect, useRef } from "react"
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
  const { frozen, render, stdout = process.stdout, markers } = options
  const stdoutCtx = useContext(StdoutContext)

  // Compute contiguous frozen prefix
  let frozenCount = 0
  for (let i = 0; i < items.length; i++) {
    if (!frozen(items[i]!, i)) break
    frozenCount++
  }

  const prevFrozenCountRef = useRef(0)

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
        stdout.write(text.replace(/\n/g, "\r\n"))
        linesWritten += countNewlines(text)

        // Emit marker after the item
        if (after) stdout.write(after)
      }
      // Notify the scheduler so inline mode cursor positioning is correct
      stdoutCtx?.notifyScrollback?.(linesWritten)
    }
    prevFrozenCountRef.current = frozenCount
  }, [frozenCount, items, render, stdout, stdoutCtx, markers])

  return frozenCount
}
