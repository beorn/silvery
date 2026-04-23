import type { Console, ConsoleEntry } from "@silvery/ag-term/ansi"
import { effect } from "@silvery/signals"
import { useEffect, useState } from "react"

/**
 * Hook to subscribe to console entries from a Term's Console owner.
 * Re-renders at most every {@link debounceMs} ms to prevent infinite
 * render loops when pipeline debug logging is active (e.g. `-vv`).
 *
 * @example
 * ```tsx
 * import { useConsole, Box, Text } from '@silvery/ag-react'
 * import { createTerm } from '@silvery/ag-term'
 *
 * using term = createTerm()
 * term.console?.capture({ suppress: true })
 *
 * function ConsoleViewer({ console }: { console: Console }) {
 *   const entries = useConsole(console)
 *   return (
 *     <Box flexDirection="column">
 *       {entries.map((entry, i) => (
 *         <Text key={i}>{entry.args.join(' ')}</Text>
 *       ))}
 *     </Box>
 *   )
 * }
 * ```
 */
export function useConsole(console: Console, debounceMs = 200): readonly ConsoleEntry[] {
  const [entries, setEntries] = useState<readonly ConsoleEntry[]>(() => console.entries())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const flush = () => {
      timer = null
      // Re-read at flush time — NOT at effect-fire time — so a burst of
      // entries arriving during the debounce window still lands in the
      // committed state. The earlier bug captured the entries array in
      // closure when the timer was scheduled, which dropped the tail.
      setEntries(console.entries())
    }
    const stop = effect(() => {
      // Subscribe by reading. Value is ignored; the flush re-reads.
      console.entries()
      if (timer !== null) return
      timer = setTimeout(flush, debounceMs)
    })
    // Pick up entries captured before the effect's seed read landed.
    setEntries(console.entries())
    return () => {
      stop()
      if (timer !== null) clearTimeout(timer)
    }
  }, [console, debounceMs])

  return entries
}
