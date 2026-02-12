/**
 * useScrollback - Push frozen items to terminal scrollback.
 *
 * Tracks a contiguous frozen prefix of items. When the frozen count
 * increases, renders newly frozen items and writes them to stdout.
 * Pair with VirtualList's `frozen` prop for the complete experience.
 *
 * In inline mode, notifies the scheduler about lines written to stdout
 * so that cursor positioning accounts for the displacement.
 */

import { useContext, useEffect, useRef } from "react"
import { StdoutContext } from "../context.js"

export interface UseScrollbackOptions<T> {
  /** Predicate: return true for items that should be frozen */
  frozen: (item: T, index: number) => boolean
  /** Render an item to a string for stdout output */
  render: (item: T, index: number) => string
  /** Output stream (defaults to process.stdout) */
  stdout?: { write(data: string): boolean }
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
 * Track frozen items and write newly frozen ones to stdout.
 *
 * @returns The current frozen count (contiguous prefix length).
 */
export function useScrollback<T>(items: T[], options: UseScrollbackOptions<T>): number {
  const { frozen, render, stdout = process.stdout } = options
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
        const text = render(items[i]!, i) + "\n"
        stdout.write(text)
        linesWritten += countNewlines(text)
      }
      // Notify the scheduler so inline mode cursor positioning is correct
      stdoutCtx?.notifyScrollback?.(linesWritten)
    }
    prevFrozenCountRef.current = frozenCount
  }, [frozenCount, items, render, stdout, stdoutCtx])

  return frozenCount
}
