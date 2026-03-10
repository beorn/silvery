/**
 * InputBoundary - Input Isolation for Embedded Components
 *
 * Creates an isolated input scope where child components' useInput and
 * useInputLayer handlers only fire when the boundary is active (focused).
 * When active, the boundary consumes all input from the parent's layer stack
 * and forwards it into the isolated scope.
 *
 * This solves the problem where embedding interactive components (e.g., in
 * a storybook viewer) causes both parent and child input handlers to fire
 * simultaneously.
 *
 * @example
 * ```tsx
 * function StoryViewer() {
 *   const [focused, setFocused] = useState(false)
 *
 *   // Parent navigation (j/k) only works when boundary is NOT focused
 *   useInputLayer('viewer', (input, key) => {
 *     if (input === 'j') { nextStory(); return true }
 *     if (input === 'k') { prevStory(); return true }
 *     return false
 *   })
 *
 *   return (
 *     <Box>
 *       <InputBoundary active={focused} onEscape={() => setFocused(false)}>
 *         <EmbeddedInteractiveComponent />
 *       </InputBoundary>
 *     </Box>
 *   )
 * }
 * ```
 */

import type React from "react"
import { useCallback, useId, useLayoutEffect, useMemo, useRef } from "react"
import { RuntimeContext, type RuntimeContextValue } from "../context"
import type { Key } from "../hooks/useInput"
import { keyToAnsi, keyToName, parseKey } from "@silvery/tea/keys"
import { InputLayerProvider, useInputLayer } from "./InputLayerContext"

// =============================================================================
// Types
// =============================================================================

export interface InputBoundaryProps {
  /** Whether the boundary is active (focused). When true, input flows to children. */
  active: boolean
  /** Called when the escape key is pressed while the boundary is active. */
  onEscape?: () => void
  /** Key to exit the boundary (default: Escape). Set to null to disable. */
  exitKey?: string | null
  /** Children to render inside the isolated input scope. */
  children: React.ReactNode
}

// =============================================================================
// Subscriber list — lightweight replacement for EventEmitter
// =============================================================================

type InputHandler = (input: string, key: Key) => void
type PasteHandler = (text: string) => void

interface SubscriberList {
  input: Set<InputHandler>
  paste: Set<PasteHandler>
}

function createSubscriberList(): SubscriberList {
  return { input: new Set(), paste: new Set() }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Reconstruct raw terminal data from parsed (input, key) pair.
 * This allows forwarding input from the parent layer stack to the
 * isolated child's RuntimeContext subscriber list.
 */
function toRawData(input: string, key: Key): string {
  const name = keyToName(key)
  if (name) {
    const mods: string[] = []
    if (key.ctrl) mods.push("Control")
    if (key.shift) mods.push("Shift")
    if (key.meta) mods.push("Meta")
    if (key.super) mods.push("Super")
    if (key.hyper) mods.push("Hyper")
    mods.push(name)
    return keyToAnsi(mods.join("+"))
  }
  // Regular character with ctrl modifier
  if (key.ctrl) return keyToAnsi(`Control+${input}`)
  return input
}

// =============================================================================
// Component
// =============================================================================

/**
 * Creates an isolated input scope for embedded interactive components.
 *
 * When `active` is true:
 * - Registers a consuming layer in the parent's input layer stack
 * - Forwards all input into the isolated child scope
 * - Parent useInputLayer handlers do NOT fire (consumed by boundary)
 * - Parent useInput handlers still fire (useInput bypasses the layer stack)
 *
 * When `active` is false:
 * - Children's useInput/useInputLayer handlers do NOT fire
 * - Parent input flows normally
 *
 * The `onEscape` callback (or custom `exitKey`) is intercepted BEFORE
 * forwarding, allowing the parent to deactivate the boundary.
 */
export function InputBoundary({
  active,
  onEscape,
  exitKey = "Escape",
  children,
}: InputBoundaryProps): React.JSX.Element {
  // Create an isolated subscriber list for children (replaces EventEmitter)
  const subscribersRef = useRef<SubscriberList | null>(null)
  if (!subscribersRef.current) {
    subscribersRef.current = createSubscriberList()
  }
  const subscribers = subscribersRef.current

  // Register a consuming layer in the parent when active.
  // This layer intercepts ALL input and forwards to the isolated subscriber list.
  const activeRef = useRef(active)
  activeRef.current = active

  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape

  const exitKeyRef = useRef(exitKey)
  exitKeyRef.current = exitKey

  const handler = useCallback(
    (input: string, key: Key): boolean => {
      if (!activeRef.current) return false

      // Check exit key before forwarding
      const currentExitKey = exitKeyRef.current
      if (currentExitKey !== null) {
        const name = keyToName(key)
        if (name === currentExitKey || (!name && input === currentExitKey)) {
          onEscapeRef.current?.()
          return true
        }
      }

      // Forward to isolated scope — parse from raw data so subscribers
      // get the same (input, key) format as the parent RuntimeContext
      const raw = toRawData(input, key)
      const [parsedInput, parsedKey] = parseKey(raw)
      for (const h of subscribers.input) {
        h(parsedInput, parsedKey)
      }
      return true
    },
    [subscribers],
  )

  const layerId = useId()
  useInputLayer(`input-boundary-${layerId}`, handler)

  // RuntimeContext — direct subscriber list for the isolated scope
  const runtimeContextValue = useMemo<RuntimeContextValue>(
    () => ({
      on(event, handler) {
        if (event === "input") {
          const typed = handler as InputHandler
          subscribers.input.add(typed)
          return () => {
            subscribers.input.delete(typed)
          }
        }
        if (event === "paste") {
          const typed = handler as unknown as PasteHandler
          subscribers.paste.add(typed)
          return () => {
            subscribers.paste.delete(typed)
          }
        }
        return () => {} // Unknown event — no-op cleanup
      },
      emit() {
        // InputBoundary doesn't support view → runtime events
      },
      exit: () => {}, // InputBoundary doesn't control app exit
    }),
    [subscribers],
  )

  // Clean up subscriber lists on unmount
  useLayoutEffect(() => {
    return () => {
      subscribers.input.clear()
      subscribers.paste.clear()
    }
  }, [subscribers])

  return (
    <RuntimeContext.Provider value={runtimeContextValue}>
      <InputLayerProvider>{children}</InputLayerProvider>
    </RuntimeContext.Provider>
  )
}
