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
import type { AgNode } from "@silvery/ag/types"
import { type Container, hostConfig } from "./host-config"
import { createRootNode } from "./nodes"

// Re-export only what's needed by render.tsx and testing/index.tsx
export type { Container } from "./host-config"
export {
  runWithDiscreteEvent,
  _resetBoxInsideTextWarning,
  setInkStrictValidation,
  setOnNodeRemoved,
  attachNodeScope,
  detachNodeScope,
  getNodeScope,
} from "./host-config"

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
export function getContainerRoot(container: Container): AgNode {
  return container.root
}

/**
 * Synchronously unmount a fiber root and scrub the container so it can't
 * keep its closure-captured RenderInstance alive afterward.
 *
 * Why both steps are needed:
 *
 * 1. `createFiberRoot` uses `ConcurrentRoot` (mode 1). React's async
 *    `updateContainer(null, fiberRoot, ...)` does NOT run layout-effect
 *    cleanups before returning — useLayoutEffect / useBoxRect /
 *    useBoxMetrics / signal-effect disposers are scheduled but may not
 *    fire promptly. That keeps signal subscriptions alive past unmount,
 *    which keeps the React tree reachable, which keeps the host
 *    `RenderInstance` reachable. `updateContainerSync` + `flushSyncWork`
 *    forces all cleanups to run inline.
 *
 * 2. Even after the React tree is detached, the `FiberRoot` keeps a
 *    pointer to its `containerInfo` (our `Container`) for some time, and
 *    `Container.onRender` typically closes over the entire enclosing
 *    `RenderInstance`. Without nulling `onRender` and scrubbing the root
 *    AgNode, the instance graph is still reachable through the FiberRoot's
 *    container pointer.
 *
 * Call this in every unmount path that uses ConcurrentRoot. The previous
 * (async) pattern leaked across mount/unmount cycles in tests and likely
 * in production long-lived host applications too.
 *
 * Safe to call multiple times — `releaseContainer` is idempotent (the
 * scrub fields are nulled and `layoutNode.free()` is best-effort).
 *
 * @param fiberRoot — opaque React FiberRoot returned by `createFiberRoot`
 * @param container — the `Container` paired with that fiberRoot
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- React reconciler internal type
export function unmountFiberRoot(fiberRoot: any, container: Container): void {
  reconciler.updateContainerSync(null, fiberRoot, null, null)
  reconciler.flushSyncWork()
  releaseContainer(container)
}

/**
 * Scrub a Container so it can't retain its enclosing render state after
 * the React tree has been unmounted. See {@link unmountFiberRoot} for the
 * full rationale; call this directly only if you've already run a sync
 * unmount through the reconciler and just need the post-commit scrub.
 */
export function releaseContainer(container: Container): void {
  // Break FiberRoot → containerInfo → onRender → enclosing-instance retention.
  container.onRender = () => {}

  const root = container.root
  root.children = []
  root.parent = null
  root.boxRect = null
  root.scrollRect = null
  root.screenRect = null
  root.prevLayout = null
  root.prevScrollRect = null
  root.prevScreenRect = null

  if (root.layoutNode) {
    try {
      root.layoutNode.free()
    } catch {
      // best-effort; the layout node may already have been released by
      // the host-config clearContainer / removeChild paths during commit.
    }
    root.layoutNode = null
  }
}
