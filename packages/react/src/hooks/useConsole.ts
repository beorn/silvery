import type { ConsoleEntry, PatchedConsole } from "@silvery/term/ansi";
import { useEffect, useState } from "react";

/**
 * Hook to subscribe to console entries from a PatchedConsole.
 * Re-renders at most every {@link debounceMs} ms to prevent infinite
 * render loops when pipeline debug logging is active (e.g. `-vv`).
 *
 * @example
 * ```tsx
 * import { useConsole, Box, Text } from '@silvery/react'
 * import { patchConsole } from '@silvery/chalk'
 *
 * function ConsoleViewer({ patched }: { patched: PatchedConsole }) {
 *   const entries = useConsole(patched)
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
export function useConsole(patched: PatchedConsole, debounceMs = 200): readonly ConsoleEntry[] {
  const [entries, setEntries] = useState<readonly ConsoleEntry[]>(patched.getSnapshot);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = patched.subscribe(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        setEntries(patched.getSnapshot());
      }, debounceMs);
    });
    // Pick up entries that arrived before subscribe
    setEntries(patched.getSnapshot());
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [patched, debounceMs]);

  return entries;
}
