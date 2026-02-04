import type { ConsoleEntry, PatchedConsole } from "chalkx"
import type { ReactElement, ReactNode } from "react"
import { useConsole } from "../hooks/useConsole.js"
import { Box } from "./Box.js"
import { Text } from "./Text.js"

interface ConsoleProps {
  /** The patched console to render entries from */
  console: PatchedConsole

  /** Optional render function for custom entry rendering */
  children?: (entry: ConsoleEntry, index: number) => ReactNode
}

/**
 * Format console entry args into a string.
 * Joins args with spaces, handling objects via JSON.stringify.
 */
function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg
      if (typeof arg === "number" || typeof arg === "boolean")
        return String(arg)
      if (arg === null) return "null"
      if (arg === undefined) return "undefined"
      try {
        return JSON.stringify(arg)
      } catch {
        return String(arg)
      }
    })
    .join(" ")
}

/**
 * Renders captured console output from a PatchedConsole.
 *
 * Uses useConsole hook to subscribe to entries and re-renders when new
 * entries arrive. Supports custom rendering via children render prop.
 *
 * @example Default rendering
 * ```tsx
 * import { Console } from 'inkx'
 * import { patchConsole } from 'chalkx'
 *
 * using patched = patchConsole(console)
 * <Console console={patched} />
 * ```
 *
 * @example Custom rendering
 * ```tsx
 * <Console console={patched}>
 *   {(entry, i) => (
 *     <Text key={i} color={entry.stream === 'stderr' ? 'yellow' : 'green'}>
 *       [{entry.method}] {entry.args.join(' ')}
 *     </Text>
 *   )}
 * </Console>
 * ```
 */
export function Console({
  console: patched,
  children,
}: ConsoleProps): ReactElement {
  const entries = useConsole(patched)

  return (
    <Box flexDirection="column">
      {entries.map((entry, i) =>
        children ? (
          children(entry, i)
        ) : (
          <Text key={i} color={entry.stream === "stderr" ? "red" : undefined}>
            {formatArgs(entry.args)}
          </Text>
        ),
      )}
    </Box>
  )
}
