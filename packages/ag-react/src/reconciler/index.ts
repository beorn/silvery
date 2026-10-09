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
import {
  type Container,
  disposeSubtreeScopes,
  hostConfig,
  inDiscreteEventScope,
  registerContainer,
  releaseContainerLifecycle,
} from "./host-config"
import { createRootNode } from "./nodes"

// Re-export only what's needed by render.tsx and testing/index.tsx
export type { Container } from "./host-config"
export {
  runWithDiscreteEvent,
  setInkStrictValidation,
  setContainerNodeLifecycle,
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
 * Run one input event's handlers with React discrete-event semantics.
 *
 * Updates the handlers schedule take the discrete (sync) lane, and React
 * renders and commits them — layout and passive effects included, plus any
 * update those effects schedule — before this returns. The next event's
 * handlers therefore observe that state and the latest handler refs, exactly
 * as two separately delivered keys would. React's own sync-work queue is the
 * gate: handlers that schedule nothing cost no render.
 *
 * Reconciliation only: no silvery layout and no paint run here, so a batch
 * of N keys still lays out and paints once, after the batch. Every runtime
 * loop that dispatches a batch of input events calls this once per event —
 * createApp's `processEventBatch` and `@silvery/create`'s `runEventBatch`.
 * Without it, keys from one stdin chunk all run against the same committed
 * render: "\x1b[B\r" opens the row above the cursor (28217).
 */
export function dispatchDiscreteEvent<T>(handlers: () => T): T {
  return inDiscreteEventScope(() => {
    const result = handlers()
    ;(reconciler as { flushSyncWork(): void }).flushSyncWork()
    return result
  })
}

/**
 * Create a container for rendering.
 */
export function createContainer(onRender: () => void): Container {
  const root = createRootNode()
  const container = { root, onRender, nodeLifecycle: null }
  registerContainer(container)
  return container
}

/**
 * Optional callbacks passed to `createFiberRoot` so the React reconciler can
 * surface render/effect errors back to the host runtime instead of swallowing
 * them. Each callback is invoked with the unwrapped `Error` (React passes the
 * raw thrown value; we adapt to `Error` for the callback shape).
 *
 * - `onUncaughtError` — render or effect error that React could not recover
 *   from. The host should panic: restore the terminal, dump the stack to
 *   stderr (on the real screen, not the altscreen overlay), and exit non-zero.
 * - `onCaughtError` — error caught by an `<ErrorBoundary>`. Usually the host
 *   leaves these alone; useful for telemetry.
 * - `onRecoverableError` — React was able to recover (e.g. fell back to a
 *   non-concurrent render). Worth a debug log.
 *
 * @see `@silvery/ag-term`'s `runtime/create-app.tsx` — wires `onUncaughtError`
 *   to `panicApp` so React render errors panic cleanly.
 */
export interface FiberRootOptions {
  onUncaughtError?: (error: Error) => void
  onCaughtError?: (error: Error) => void
  onRecoverableError?: (error: Error) => void
}

/**
 * Create a React fiber root for a container (wraps the 10-argument reconciler call).
 *
 * Pass `options.onUncaughtError` to route React-thrown render errors back to
 * the host's panic path. Without it, render errors are silently swallowed
 * (the default `() => {}` callback) and the only surface for them is whatever
 * the host's `console.error` capture decides to do — typically an altscreen
 * overlay the user can't copy-paste or screenshot reliably.
 */
export function createFiberRoot(container: Container, options: FiberRootOptions = {}) {
  return reconciler.createContainer(
    container,
    1, // ConcurrentRoot
    null, // hydrationCallbacks
    false, // isStrictMode
    null, // concurrentUpdatesByDefaultOverride
    "", // identifierPrefix
    options.onUncaughtError ?? (() => {}), // onUncaughtError
    options.onCaughtError ?? (() => {}), // onCaughtError
    options.onRecoverableError ?? (() => {}), // onRecoverableError
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
 *    signal-effect disposers are scheduled but may not
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
  releaseContainerLifecycle(container)

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
