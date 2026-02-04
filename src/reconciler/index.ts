/**
 * Inkx React Reconciler
 *
 * Custom React reconciler that builds a tree of InkxNodes, each with a Yoga layout node.
 * This is the core of Inkx's architecture - separating structure (React reconciliation)
 * from content (terminal rendering).
 *
 * The reconciler creates InkxNodes during React's reconciliation phase,
 * but actual terminal content is rendered later after Yoga computes layout.
 */

// @ts-expect-error - react-reconciler has no type declarations
import Reconciler from "react-reconciler"
import type { InkxNode } from "../types.js"
import { type Container, hostConfig } from "./host-config.js"
import { createRootNode } from "./nodes.js"

// Re-export only what's needed by render.tsx and testing/index.tsx
export type { Container } from "./host-config.js"

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
 * Get the root InkxNode from a container.
 */
export function getContainerRoot(container: Container): InkxNode {
  return container.root
}
