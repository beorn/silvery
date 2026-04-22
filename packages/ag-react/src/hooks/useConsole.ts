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
    const stop = effect(() => {
      const next = console.entries()
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        setEntries(next)
      }, debounceMs)
    })
    // Pick up entries that arrived before effect ran its seed read
    setEntries(console.entries())
    return () => {
      stop()
      if (timer) clearTimeout(timer)
    }
  }, [console, debounceMs])

  return entries
}
