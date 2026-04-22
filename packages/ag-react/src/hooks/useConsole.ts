import type { Console, ConsoleEntry } from "@silvery/ag-term/ansi"
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
  const [entries, setEntries] = useState<readonly ConsoleEntry[]>(console.getSnapshot)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsub = console.subscribe(() => {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        setEntries(console.getSnapshot())
      }, debounceMs)
    })
    // Pick up entries that arrived before subscribe
    setEntries(console.getSnapshot())
    return () => {
      unsub()
      if (timer) clearTimeout(timer)
    }
  }, [console, debounceMs])

  return entries
}
