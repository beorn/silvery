import { useContext } from 'react'
import type { Term } from 'chalkx'
import { TermContext } from '../context.js'

/**
 * Hook to access the Term in components.
 * Must be used within a component rendered via inkx's term-aware render().
 *
 * @example
 * ```tsx
 * import { useTerm, Box, Text } from 'inkx'
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
    throw new Error('useTerm must be used within a render(element, term) context')
  }
  return term
}
