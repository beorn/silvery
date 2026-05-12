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
import { type Container, disposeSubtreeScopes, hostConfig } from "./host-config"
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
  disposeSubtreeScopes,
} from "./host-config"

// ============================================================================
// Reconciler Export
// ============================================================================

/**
 * Create the React reconciler instance.
 */
export const reconciler = Reconciler(hostConfig)

/**
 * Error-info shape passed to {@link ReconcilerErrorHandlers} hooks. Matches
 * the `errorInfo` argument react-reconciler 0.33 supplies to its
 * `onUncaughtError` / `onCaughtError` / `onRecoverableError` callbacks.
 */
export interface ReconcilerErrorInfo {
  componentStack: string
  // onCaughtError adds this; optional on the others.
  errorBoundary?: unknown
}

/**
 * Required handler set passed to {@link createFiberRoot}. Plumbed through
 * react-reconciler so every host can route render errors into its own panic /
 * test / re-throw path.
 *
 * - `onUncaughtError`: fires when a component throws during render and the
 *   error escapes ALL boundaries (including silvery's internal
 *   `SilveryErrorBoundary`). The canonical panic site.
 * - `onCaughtError`: fires when an error boundary catches a render error.
 *   Useful for diagnostics; not always fatal.
 * - `onRecoverableError`: fires for recoverable cases (aborted transitions,
 *   hydration recoveries). Best-effort logging only.
 *
 * Required (not optional) at this internal level — every caller must pass
 * handlers so silent swallowing is structurally impossible. The high-level
 * public API (`silvery/runtime` `run()` + `createApp().run()`) provides
 * sensible defaults; see `panicOnRenderError` in `AppRunOptions`.
 */
export interface ReconcilerErrorHandlers {
  onUncaughtError(error: unknown, errorInfo: ReconcilerErrorInfo): void
  onCaughtError(error: unknown, errorInfo: ReconcilerErrorInfo): void
  onRecoverableError(error: unknown, errorInfo: ReconcilerErrorInfo): void
}

/**
 * Create a container for rendering.
 */
export function createContainer(onRender: () => void): Container {
  const root = createRootNode()
  return { root, onRender }
}

/**
 * Create a React fiber root for a container (wraps the 10-argument reconciler call).
 *
 * `handlers` is required — the reconciler's three error hooks must always be
 * wired to *something*. Pass no-ops only when re-throwing the error from a
 * non-altscreen renderer is the right behavior; pass a panic-routing handler
 * when running in altscreen (alt-screen overlays would otherwise hide the
 * stack). See `vendor/silvery/packages/ag-term/src/runtime/create-app.tsx`
 * for the canonical wiring.
 */
export function createFiberRoot(container: Container, handlers: ReconcilerErrorHandlers) {
  return reconciler.createContainer(
    container,
    1, // ConcurrentRoot
    null, // hydrationCallbacks
    false, // isStrictMode
    null, // concurrentUpdatesByDefaultOverride
    "", // identifierPrefix
    handlers.onUncaughtError,
    handlers.onCaughtError,
    handlers.onRecoverableError,
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
  // Dispose any fiber-local scopes still attached to nodes in the tree.
  // Required because `updateContainerSync(null, fiberRoot, …)` on a
  // ConcurrentRoot does NOT route the unmount through the host-config
  // `removeChild*` / `clearContainer` paths in current react-reconciler
  // (0.33+) — those fire only for keyed-deletion reconciliations during a
  // mounted re-render, not for full-tree unmount. Without this walk, scopes
  // attached via `useScope()` / `useScopeEffect()` survive the unmount
  // because the per-node WeakMap entry stays reachable from
  // `container.root.children` until the line below clears it. Per the
  // design contract (hub/silvery/design/lifecycle-scope.md): "Disposal is
  // unavoidable — there is no path that swallows the slot without
  // disposing." Bead: km-silvery.scope-phase-1.
  disposeSubtreeScopes(container.root)

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
