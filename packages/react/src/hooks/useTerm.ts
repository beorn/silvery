import type { Term } from "@silvery/ansi"
import { useContext } from "react"
import { TermContext } from "../context"

/**
 * Hook to access the Term in components.
 * Must be used within a component rendered via silvery's term-aware render().
 *
 * @example
 * ```tsx
 * import { useTerm, Box, Text } from '@silvery/react'
 *
 * function ColoredOutput() {
 *   const term = useTerm()
 *   return <Text>{term.green('Success!')}</Text>
 * }
 * ```
 */
export function useTerm(): Term {
  const term = useContext(TermContext)
  if (!term) {
    throw new Error("useTerm must be used within a render(element, term) context")
  }
  return term
}
