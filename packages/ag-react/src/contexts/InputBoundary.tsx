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
 * ## Architecture (TEA Phase 2)
 *
 * The boundary hosts its own child `BaseApp` built from the same apply-chain
 * plugins as the root runtime (`withTerminalChain`, `withPasteChain`,
 * `withInputChain`, `withFocusChain`). Child hooks (`useInput`,
 * `useModifierKeys`, `useTerminalFocused`, `usePasteEvents`,
 * `usePasteCallback`) subscribe via `ChainAppContext` just like root-level
 * hooks do — no `rt.on` fallback path is required.
 *
 * Forwarded input is dispatched as `input:key` ops on the child app. The
 * boundary exposes its own raw-key observer and focus events store so
 * `useModifierKeys`/`useTerminalFocused` stay functional inside the
 * isolated scope.
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
import { useCallback, useId, useMemo, useRef } from "react"
import { ChainAppContext, RuntimeContext, type RuntimeContextValue } from "../context"
import type { Key } from "../hooks/useInput"
import { keyToName } from "@silvery/ag/keys"
import { createChildApp, toChainAppContextValue, type ChildApp } from "../chain-bridge"
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
// Component
// =============================================================================

/**
 * Creates an isolated input scope for embedded interactive components.
 *
 * When `active` is true:
 * - Registers a consuming layer in the parent's input layer stack
 * - Dispatches every forwarded key as an `input:key` op on the child BaseApp
 * - Parent useInputLayer handlers do NOT fire (consumed by boundary)
 * - Parent useInput handlers still fire (useInput bypasses the layer stack)
 *
 * When `active` is false:
 * - Children's useInput/useInputLayer handlers do NOT fire
 * - Parent input flows normally
 *
 * The `onEscape` callback (or custom `exitKey`) is intercepted BEFORE
 * dispatch, allowing the parent to deactivate the boundary.
 */
export function InputBoundary({
  active,
  onEscape,
  exitKey = "Escape",
  children,
}: InputBoundaryProps): React.JSX.Element {
  // Child BaseApp (stable across renders). Built lazily on first render so
  // we don't pay the cost for inactive boundaries until they matter.
  const childAppRef = useRef<ChildApp | null>(null)
  if (!childAppRef.current) childAppRef.current = createChildApp()
  const childApp = childAppRef.current

  // Register a consuming layer in the parent when active.
  // This layer intercepts ALL input and dispatches to the child chain.
  const activeRef = useRef(active)
  activeRef.current = active

  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape

  const exitKeyRef = useRef(exitKey)
  exitKeyRef.current = exitKey

  const handler = useCallback(
    (input: string, key: Key): boolean => {
      if (!activeRef.current) return false

      // Check exit key before dispatch
      const currentExitKey = exitKeyRef.current
      if (currentExitKey !== null) {
        const name = keyToName(key)
        if (name === currentExitKey || (!name && input === currentExitKey)) {
          onEscapeRef.current?.()
          return true
        }
      }

      // Fire raw-key observers first (useModifierKeys needs unfiltered keys).
      childApp.rawKeys.notify(input, key)

      // Dispatch into the child apply chain. The chain produces effects
      // (exit/render/...) which we drain and discard — the boundary owns
      // neither exit nor render (those belong to the root runner). Handler
      // return value of "exit" is surfaced by withInputChain as an exit
      // effect; we ignore it here since embedded scopes don't terminate.
      childApp.dispatch({ type: "input:key", input, key })
      childApp.drainEffects()
      return true
    },
    [childApp],
  )

  const layerId = useId()
  useInputLayer(`input-boundary-${layerId}`, handler)

  // ChainAppContext value — the canonical subscription surface for child
  // hooks. Identical shape to the root `chainAppContextValue` in create-app.
  const chainAppContextValue = useMemo(() => toChainAppContextValue(childApp), [childApp])

  // RuntimeContext retains a minimal handle — only `exit` (no-op inside
  // the boundary) and `emit` (no-op; custom view-only events do not
  // escape the isolated scope). Child hooks no longer use `rt.on` —
  // they subscribe via ChainAppContext.
  const runtimeContextValue = useMemo<RuntimeContextValue>(
    () => ({
      on() {
        // Inside a boundary, `rt.on` is deprecated — hooks subscribe via
        // ChainAppContext. Return a no-op unsubscribe so any stale caller
        // fails safe.
        return () => {}
      },
      emit() {
        // Boundary doesn't forward custom events to the parent runtime.
      },
      exit: () => {},
    }),
    [],
  )

  return (
    <RuntimeContext.Provider value={runtimeContextValue}>
      <ChainAppContext.Provider value={chainAppContextValue}>
        <InputLayerProvider>{children}</InputLayerProvider>
      </ChainAppContext.Provider>
    </RuntimeContext.Provider>
  )
}
