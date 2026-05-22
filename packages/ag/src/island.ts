/**
 * Silvery Islands — framework-agnostic `createIsland()` factory.
 *
 * Layer 2 of the islands stack (Layer 1 is the contract in
 * {@link ./island-types.ts}). Constructs a `silvery-island` AgNode, attaches
 * an {@link IslandNodeState} carrying the host's view of the guest, and wires
 * lifecycle: hydration policy → `guest.init(ctx)` → handle attach → abort
 * cascade on dispose.
 *
 * Sister of {@link ./viewport-buffer.ts}'s `createCellBuffer` (the v1
 * Viewport's buffer factory). Generalises by accepting any {@link IslandGuest}
 * and exposing the full sub-owner contract. The React binding `<Island>` (in
 * `@silvery/ag-react`) wraps this factory with hooks, ref forwarding, and
 * ErrorBoundary integration.
 *
 * Layering constraint: `@silvery/ag` cannot depend on the React reconciler in
 * `@silvery/ag-react` nor on the layout engine in `@silvery/ag-term`. The
 * canonical `createNode()` helper (in `ag-react/reconciler/nodes.ts`)
 * therefore can't be reused from here without inverting the dependency
 * graph. The AgNode literal below mirrors `createNode("silvery-island", ...)`
 * but leaves the `layoutNode` slot null — the React binding `<Island>` uses
 * the `<silvery-island>` JSX intrinsic which routes through the reconciler's
 * `createInstance` → `createNode` (which DOES attach a layoutNode) and then
 * copies the {@link IslandNodeState} produced here onto that reconciler-owned
 * node. Direct non-React consumers must wire their own layout node by
 * setting `node.layoutNode` themselves before adding the island to a tree.
 *
 * See bead `@km/silvery/15646-islands` for the epic body, P0 landmines, and
 * the deferred Phase-2 hydration scheduler (idle / visible / only-on-focus).
 */

import { ALL_RECONCILER_BITS, getRenderEpoch } from "./epoch.ts"
import type {
  IslandCapabilities,
  IslandContext,
  IslandGuest,
  IslandHandle,
  IslandHydrate,
  IslandNodeState,
  IslandPalettePolicy,
  IslandSignal,
} from "./island-types.ts"
import type { AgNode } from "./types.ts"
import type { ViewportPalette } from "./viewport-types.ts"

// ============================================================================
// Public API
// ============================================================================

/**
 * Options for {@link createIsland}.
 */
export interface CreateIslandOptions {
  /** Guest contract — provides cells, optional input/modes/signals/palette. */
  guest: IslandGuest
  /** Initial island width in cells. */
  cols: number
  /** Initial island height in cells. */
  rows: number
  /** Whether the island can receive focus. Default: `false`. */
  focusable?: boolean
  /**
   * Palette ownership. Default: `"freeze"` when the guest doesn't declare
   * `capabilities.palette`, `"inherit"` when it does. The per-island prop
   * always wins over both.
   */
  palettePolicy?: IslandPalettePolicy
  /**
   * Hydration policy — controls when `guest.init()` fires.
   * Phase 1 ships `"load"` only (synchronous mount-time init); the other
   * three values are accepted for forward-compat but currently behave the
   * same as `"load"`. See `// TODO(Phase 2)` below.
   */
  hydrate?: IslandHydrate
  /**
   * Per-island capability override. Intersected with `guest.capabilities`
   * (host never offers what the guest can't fulfill); use this to *narrow*,
   * not to declare what the guest doesn't have.
   */
  capabilities?: IslandCapabilities
  /** Lifecycle signal callback — fires on `ready` / `exit` / `error`. */
  onSignal?: (sig: IslandSignal) => void
  /**
   * Async-init failure handler. If absent, init errors are thrown (which in
   * the `<Island>` React binding becomes the surrounding ErrorBoundary's
   * problem).
   */
  onError?: (err: Error) => void
  /**
   * Snapshot of the current host palette. Used when `palettePolicy ===
   * "freeze"` to capture the theme at mount. If undefined and the resolved
   * policy is "freeze", the guest sees `frozenPalette: null` and falls
   * back to its own defaults — the React binding supplies this in normal use.
   */
  hostPalette?: ViewportPalette
}

/**
 * Result of {@link createIsland} — the AgNode to splice into the render
 * tree, the guest's imperative handle (null until init resolves), and a
 * teardown function.
 */
export interface CreateIslandResult {
  /**
   * The `silvery-island` AgNode. Leaf — never has React children.
   * `layoutNode` is null in this factory (see file-level note); the React
   * binding `<Island>` swaps in the reconciler's node so flexily reserves
   * the island's rect.
   */
  readonly node: AgNode
  /**
   * The guest's imperative handle. Null until `guest.init()` resolves; for
   * deferred-hydrate islands, remains null until first focus / visibility.
   */
  handle: IslandHandle | null
  /**
   * Idempotent teardown — aborts the controller, calls `handle.dispose()`
   * if present, sets `lifecycle = "disposed"`.
   */
  dispose(): void | Promise<void>
}

// ============================================================================
// Capability + palette resolution
// ============================================================================

/**
 * Effective capabilities = guest's declarations ∩ per-island overrides.
 *
 * Rule: the host never offers a capability the guest can't fulfill, so the
 * starting set is what the guest declared. Per-island overrides exist to
 * *narrow* — a PTY guest might declare `input: true` globally, but one
 * island wants read-only mirror semantics and passes `input: false`.
 */
function intersectCapabilities(
  guestCaps: IslandCapabilities | undefined,
  overrides: IslandCapabilities | undefined,
): IslandCapabilities {
  const g = guestCaps ?? {}
  if (!overrides) return { ...g }
  const out: IslandCapabilities = {}
  if (g.input === true && overrides.input !== false) out.input = true
  if (g.modes === true && overrides.modes !== false) out.modes = true
  if (g.resize === true && overrides.resize !== false) out.resize = true
  if (g.palette === true && overrides.palette !== false) out.palette = true
  return out
}

function defaultPalettePolicy(caps: IslandCapabilities): IslandPalettePolicy {
  return caps.palette ? "inherit" : "freeze"
}

function resolveFrozenPalette(
  policy: IslandPalettePolicy,
  hostPalette: ViewportPalette | undefined,
): ViewportPalette | null {
  if (policy === "freeze") return hostPalette ?? null
  if (policy === "inherit") return null
  return policy.custom
}

// ============================================================================
// AgNode construction (silvery-island, leaf, no layoutNode)
// ============================================================================

/**
 * Build a bare `silvery-island` AgNode literal. Mirrors `createNode()` in
 * `ag-react/reconciler/nodes.ts` for the silvery-island case but leaves
 * `layoutNode` null (this file lives in `@silvery/ag` and cannot depend on
 * the ag-term-hosted layout engine — see the file-level note).
 *
 * The React binding `<Island>` uses the reconciler-created node via the
 * `<silvery-island>` JSX intrinsic, which DOES attach a layoutNode; the
 * binding then copies `islandState` from here onto that node.
 */
function buildIslandNode(cols: number, rows: number): AgNode {
  const epoch = getRenderEpoch()
  return {
    type: "silvery-island",
    props: { cols, rows },
    children: [],
    parent: null,
    layoutNode: null,
    boxRect: null,
    scrollRect: null,
    screenRect: null,
    prevLayout: null,
    prevScrollRect: null,
    prevScreenRect: null,
    layoutChangedThisFrame: epoch,
    dirtyBits: ALL_RECONCILER_BITS,
    dirtyEpoch: epoch,
  }
}

// ============================================================================
// createIsland — framework-agnostic factory
// ============================================================================

/**
 * Build a `silvery-island` AgNode, attach an {@link IslandNodeState}, and
 * wire the guest's lifecycle. See {@link CreateIslandOptions} for inputs and
 * {@link CreateIslandResult} for the returned shape.
 *
 * Errors during `guest.init()` route to `onError` if provided; otherwise
 * they're thrown to the caller (the React binding's ErrorBoundary catches
 * those). Setting `lifecycle = "errored"` and `lastError` always happens
 * regardless of routing.
 */
export function createIsland(opts: CreateIslandOptions): CreateIslandResult {
  const {
    guest,
    cols,
    rows,
    focusable = false,
    capabilities: capabilityOverrides,
    palettePolicy: palettePolicyOverride,
    hydrate = "load",
    onSignal,
    onError,
    hostPalette,
  } = opts

  const capabilities = intersectCapabilities(guest.capabilities, capabilityOverrides)
  const palettePolicy = palettePolicyOverride ?? defaultPalettePolicy(capabilities)
  const frozenPalette = resolveFrozenPalette(palettePolicy, hostPalette)

  const node = buildIslandNode(cols, rows)
  const abortController = new AbortController()

  const nodeState: IslandNodeState = {
    handle: null,
    guest,
    capabilities,
    focusable,
    focused: false,
    palettePolicy,
    frozenPalette,
    hydrate,
    lifecycle: "pending",
    lastError: null,
    abortController,
  }
  node.islandState = nodeState

  const result: CreateIslandResult = {
    node,
    handle: null,
    dispose,
  }

  let disposed = false
  let initStarted = false

  function dispose(): void | Promise<void> {
    if (disposed) return
    disposed = true
    nodeState.lifecycle = "disposed"
    // Abort first so any in-flight init() can observe and short-circuit.
    if (!abortController.signal.aborted) abortController.abort()
    const handle = nodeState.handle
    if (handle) {
      // The guest's dispose may be async; surface the promise so callers
      // who `await dispose()` see the full teardown.
      return handle.dispose() ?? undefined
    }
    return undefined
  }

  function reportError(err: Error): void {
    nodeState.lifecycle = "errored"
    nodeState.lastError = err
    if (onError) onError(err)
    else throw err
  }

  function buildContext(): IslandContext {
    return {
      cols,
      rows,
      emit(signal: IslandSignal): void {
        if (disposed) return
        if (signal.type === "ready" && nodeState.lifecycle === "pending") {
          nodeState.lifecycle = "ready"
        }
        if (signal.type === "error") {
          nodeState.lifecycle = "errored"
          nodeState.lastError = signal.error
        }
        onSignal?.(signal)
      },
      requestResize(nextCols: number, nextRows: number): void {
        if (disposed) return
        // Forward via the size owner if the handle is live (two-phase
        // protocol: the guest acknowledges via its next output.writeCells;
        // the host reads new dims via handle.size after the ack).
        nodeState.handle?.size.requestResize(nextCols, nextRows)
      },
      async execOSC(command: string): Promise<string | void> {
        // Phase 1: no OSC routing yet. The host aggregator (Unit C) will
        // wire this into the real terminal probe / response queue. For now
        // we resolve to undefined so PTY guests don't deadlock.
        // TODO(Phase 2): route through host's OSC execution channel.
        void command
        return undefined
      },
      abortSignal: abortController.signal,
      now(): number {
        // Replay guests get a deterministic clock when the host overrides
        // this in a wrapped context; the default factory uses performance.now().
        return performance.now()
      },
    }
  }

  function startInit(): void {
    if (initStarted || disposed) return
    initStarted = true
    const ctx = buildContext()
    // `guest.init()` is contractually a Promise (the /pro-decided shape);
    // sync internals lift via Promise.resolve.
    Promise.resolve()
      .then(() => guest.init(ctx))
      .then((handle) => {
        if (disposed) {
          // Race: dispose() ran before init resolved. Tear the guest's
          // handle down immediately so resources aren't leaked.
          const ret = handle.dispose()
          if (ret instanceof Promise) {
            ret.catch(() => {
              // The dispose-side error has nowhere to surface (we're already
              // disposed and the caller's onError contract is for init-time
              // failures). Swallow; production reporting hooks into scope.
            })
          }
          return
        }
        nodeState.handle = handle
        result.handle = handle
        // `lifecycle` may already be "ready" (guest emitted ready via ctx
        // before its init promise resolved) or "errored" (guest emitted
        // error then init resolved anyway). Don't downgrade from those.
        if (nodeState.lifecycle === "pending") nodeState.lifecycle = "ready"
      })
      .catch((rawErr: unknown) => {
        if (disposed) return
        const err = rawErr instanceof Error ? rawErr : new Error(String(rawErr))
        reportError(err)
      })
  }

  // Hydration scheduling.
  // Phase 1 ships `"load"` only. `"idle"`, `"visible"`, `"only-on-focus"`
  // require host-side signals (visibility intersection, focus tracking) the
  // host aggregator (Unit C) hasn't wired yet. Until then, deferred-hydrate
  // islands behave as `"load"` — guest.init() fires at factory time. Callers
  // that depended on genuine deferral will see `handle: null` momentarily
  // but get the same end-state.
  // TODO(Phase 2): wire idle/visible/only-on-focus hydration via host
  // aggregator (requestIdleCallback + intersection observer equivalent +
  // focus manager).
  void hydrate
  startInit()

  return result
}
