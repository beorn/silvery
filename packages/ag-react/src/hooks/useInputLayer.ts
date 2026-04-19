/**
 * useInputLayer Hook
 *
 * Register an input handler layer with the input layer stack.
 * Layers receive input in child-first order (like DOM event bubbling).
 *
 * @example
 * ```tsx
 * function SearchInput() {
 *   const [value, setValue] = useState('')
 *
 *   useInputLayer('search-input', (input, key) => {
 *     if (key.backspace && value.length > 0) {
 *       setValue(v => v.slice(0, -1))
 *       return true
 *     }
 *     if (input.length === 1 && input >= ' ') {
 *       setValue(v => v + input)
 *       return true
 *     }
 *     return false  // Let escape, enter, etc. bubble
 *   })
 *
 *   return <Text>Search: {value}</Text>
 * }
 * ```
 *
 * @see docs/future/silvery-command-api-research.md
 */

// Re-export from context for convenience
export {
  useInputLayer,
  useInputLayerContext,
  type InputLayerHandler,
} from "../contexts/InputLayerContext"
