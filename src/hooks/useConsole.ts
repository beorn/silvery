import type { ConsoleEntry, PatchedConsole } from 'chalkx';
import { useSyncExternalStore } from 'react';

/**
 * Hook to subscribe to console entries from a PatchedConsole.
 * Re-renders when new entries arrive.
 *
 * @example
 * ```tsx
 * import { useConsole, Box, Text } from 'inkx'
 * import { patchConsole } from 'chalkx'
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
export function useConsole(patched: PatchedConsole): readonly ConsoleEntry[] {
	return useSyncExternalStore(patched.subscribe, patched.getSnapshot);
}
