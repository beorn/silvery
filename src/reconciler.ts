/**
 * Inkx React Reconciler
 *
 * This file re-exports from the reconciler/ directory for backward compatibility.
 * All reconciler functionality has been extracted into:
 * - reconciler/helpers.ts - Utility functions for props comparison
 * - reconciler/nodes.ts - Node creation and layout application
 * - reconciler/host-config.ts - React reconciler host configuration
 * - reconciler/index.ts - Main exports
 */

export {
  // Main exports (used by render.tsx and testing/index.tsx)
  reconciler,
  createContainer,
  getContainerRoot,
  runWithDiscreteEvent,
  // Types
  type Container,
} from "./reconciler/index.js"
