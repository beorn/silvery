/**
 * Silvery React Reconciler
 *
 * Custom React reconciler that builds a tree of SilveryNodes, each with a Yoga layout node.
 * This is the core of Silvery's architecture - separating structure (React reconciliation)
 * from content (terminal rendering).
 *
 * The reconciler creates SilveryNodes during React's reconciliation phase,
 * but actual terminal content is rendered later after Yoga computes layout.
 */

// @ts-expect-error - react-reconciler has no type declarations
import Reconciler from "react-reconciler"
import type { TeaNode } from "@silvery/tea/types"
import { type Container, hostConfig } from "./host-config"
import { createRootNode } from "./nodes"

// Re-export only what's needed by render.tsx and testing/index.tsx
export type { Container } from "./host-config"
export { runWithDiscreteEvent } from "./host-config"

// ============================================================================
// Reconciler Export
// ============================================================================

/**
 * Create the React reconciler instance.
 */
export const reconciler = Reconciler(hostConfig)

/**
 * Create a container for rendering.
 */
export function createContainer(onRender: () => void): Container {
  const root = createRootNode()
  return { root, onRender }
}

/**
 * Create a React fiber root for a container (wraps the 10-argument reconciler call).
 */
export function createFiberRoot(container: Container) {
  return reconciler.createContainer(
    container,
    1, // ConcurrentRoot
    null, // hydrationCallbacks
    false, // isStrictMode
    null, // concurrentUpdatesByDefaultOverride
    "", // identifierPrefix
    () => {}, // onUncaughtError
    () => {}, // onCaughtError
    () => {}, // onRecoverableError
    null, // onDefaultTransitionIndicator
  )
}

/**
 * Get the root SilveryNode from a container.
 */
export function getContainerRoot(container: Container): TeaNode {
  return container.root
}
