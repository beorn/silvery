import type { ConsoleEntry, PatchedConsole } from "@silvery/ag-term/ansi"
import type { ReactElement, ReactNode } from "react"
import { useConsole } from "@silvery/ag-react/hooks/useConsole"
import { Text } from "@silvery/ag-react/components/Text"
import { ListView } from "./ListView"

export interface ConsoleProps {
  /** The patched console to render entries from */
  console: PatchedConsole

  /** Optional render function for custom entry rendering */
  children?: (entry: ConsoleEntry, index: number) => ReactNode

  /** Viewport height in rows. Default: 20 */
  height?: number

  /** Enable caching of entries scrolled out of view. Default: true */
  cache?: boolean

  /** Enable search (registers with SearchProvider). Default: true */
  search?: boolean

  /** Surface identity for search/selection routing */
  surfaceId?: string
}

/**
 * Format console entry args into a string.
 * Joins args with spaces, handling objects via JSON.stringify.
 */
function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg
      if (typeof arg === "number" || typeof arg === "boolean") {
        return String(arg)
      }
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
 * Thin composition over ListView — gets caching, search, and virtualization
 * for free. Follows output by default (scrollTo = last item).
 *
 * @example Default rendering
 * ```tsx
 * import { Console } from '@silvery/ag-react'
 * import { patchConsole } from '@silvery/chalk'
 *
 * using patched = patchConsole(console)
 * <Console console={patched} height={20} />
 * ```
 *
 * @example Custom rendering
 * ```tsx
 * <Console console={patched} height={20}>
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
  height = 20,
  cache = true,
  search = true,
  surfaceId,
}: ConsoleProps): ReactElement {
  const entries = useConsole(patched)

  return (
    <ListView<ConsoleEntry>
      items={entries as ConsoleEntry[]}
      height={height}
      scrollTo={entries.length - 1}
      cache={cache}
      search={search ? { getText: (entry) => formatArgs(entry.args) } : false}
      surfaceId={surfaceId}
      renderItem={(entry, index) =>
        children ? (
          children(entry, index)
        ) : (
          <Text key={index} color={entry.stream === "stderr" ? "red" : undefined}>
            {formatArgs(entry.args)}
          </Text>
        )
      }
    />
  )
}
