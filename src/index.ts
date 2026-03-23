// silvery — multi-target rendering framework for React
// Re-exports from @silvery/* packages

export const VERSION = "0.0.1"

// Re-export everything from @silvery/react — local `render` below shadows the re-exported one
export * from "@silvery/react"

import type { ReactElement } from "react"
import { render as reactRender, type RenderOptions, type TermDef } from "@silvery/react"
import type { Term } from "@silvery/react"

/**
 * Render a React element to the terminal.
 *
 * Zero-ceremony entry point — auto-detects the terminal and starts an
 * interactive app when stdin is a TTY. No need to create a Term first.
 *
 * @example Hello World (2 lines)
 * ```tsx
 * import { render, Text } from "silvery"
 * await render(<Text>Hello!</Text>).run()
 * ```
 *
 * @example Interactive counter
 * ```tsx
 * import { useState } from "react"
 * import { render, Box, Text, useInput } from "silvery"
 *
 * function Counter() {
 *   const [count, setCount] = useState(0)
 *   useInput((input) => {
 *     if (input === "j") setCount((c) => c + 1)
 *   })
 *   return (
 *     <Box borderStyle="round" padding={1}>
 *       <Text>Count: {count}</Text>
 *     </Box>
 *   )
 * }
 *
 * await render(<Counter />).run()
 * ```
 *
 * @example Static render (explicit)
 * ```tsx
 * import { render, Text } from "silvery"
 * await render(<Text>Report</Text>, { width: 120 })
 * ```
 *
 * When called without a Term or TermDef:
 * - **TTY detected** → interactive mode (stdin + stdout auto-wired)
 * - **No TTY** → static mode (renders once and returns)
 *
 * Pass a Term or TermDef explicitly to override auto-detection.
 */
export function render(
  element: ReactElement,
  termOrDef?: Term | TermDef,
  options?: RenderOptions,
): ReturnType<typeof reactRender> {
  // When no term/def is provided and we're in a TTY, auto-wire stdin/stdout
  // so the app runs interactively (useInput works, app stays alive until exit).
  if (!termOrDef && process.stdin?.isTTY && process.stdout?.isTTY) {
    const ttyDef: TermDef = {
      stdin: process.stdin,
      stdout: process.stdout,
    }
    return reactRender(element, ttyDef, options)
  }
  return reactRender(element, termOrDef, options)
}
