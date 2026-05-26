/**
 * Silvery Island Component
 *
 * `<Island>` is silvery's runtime-agnostic cell-grid mount primitive — a
 * rectangular region whose content comes from an {@link IslandGuest}: a PTY
 * child, a snapshot, a replay stream, an embedded silvery sub-instance, an
 * Ink legacy app, a Vue cellgrid, anything satisfying the contract.
 *
 * The component is a thin React wrapper around the framework-agnostic
 * `createIsland()` factory in `@silvery/ag/island`. It uses the
 * `<silvery-island>` JSX intrinsic so the reconciler creates a proper AgNode
 * with a layoutNode attached; then `useScopeEffect` runs `guest.init()`,
 * keeps the resulting {@link IslandHandle} on `node.islandState`, and tears
 * the guest down on unmount (or dep change) via the owning scope.
 *
 * The component is a leaf — no React children. Layout dimensions read
 * `cols` × `rows` props; the reconciler's `createNode("silvery-island", …)`
 * branch + `commitUpdate` path call `applyIslandProps` to pin the layout
 * node, so this component carries no manual layout pin.
 *
 * Supersedes the v1 `<Viewport>` + `ForeignSource` + `ViewportContext`
 * primitive (epic `@km/silvery/15513-surface-nested-composition-primitive`).
 * See epic `@km/silvery/15646-islands` for the full design.
 */

import {
  type ForwardedRef,
  type JSX,
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { type CreateIslandResult, createIsland } from "@silvery/ag/island"
import type {
  IslandCapabilities,
  IslandGuest,
  IslandHandle,
  IslandHydrate,
  IslandNodeState,
  IslandPalettePolicy,
  IslandSignal,
} from "@silvery/ag/island-types"
import { trackContentDirty } from "@silvery/ag/dirty-tracking"
import { CONTENT_BIT, SUBTREE_BIT, getRenderEpoch, isDirty } from "@silvery/ag/epoch"
import type { AgNode } from "@silvery/ag/types"
import type { ViewportPalette } from "@silvery/ag/viewport-types"
import type { IslandLayoutProps } from "../reconciler/nodes"
import { useScopeEffect } from "../hooks/useScopeEffect"

// The `silvery-island` JSX intrinsic is declared in `@silvery/ag-react/jsx.d.ts`
// alongside silvery-box / silvery-text / silvery-viewport, and the reconciler's
// `createNode("silvery-island", { cols, rows })` calls `applyIslandProps` to pin
// the layout node's dimensions — both wired in this same commit. <Island> just
// reads back the reconciler-owned AgNode via the JSX intrinsic's ref.

// ============================================================================
// Props
// ============================================================================

/**
 * <Island> props. Composes:
 *
 * - `IslandLayoutProps` — flex-item layout participation (`width`, `height`,
 *   `flexGrow`, `flexShrink`, `flexBasis`, `alignSelf`, `minWidth` /
 *   `minHeight` / `maxWidth` / `maxHeight`, plus the guest-contract `cols` /
 *   `rows`). See `IslandLayoutProps` for the full decoupling rationale —
 *   `cols` / `rows` drive the **guest's cell grid**; `width` / `height` /
 *   `flex*` drive the **layout slot**. When the two diverge, the host calls
 *   `handle.size.requestResize` and the guest acknowledges via the two-phase
 *   protocol.
 *
 * - Guest contract — `guest`, `focusable`, `palettePolicy`, `hydrate`,
 *   `capabilities`, `onSignal`, `onError`, `hostPalette`.
 *
 * `cols` and `rows` are required at the React surface because every shipped
 * guest needs initial cell-grid dims to spawn (PTY children, snapshot frames,
 * replay first frame). Future guests that can defer-spawn until first layout
 * MAY make them optional — see `@km/silvery/15646-islands` Phase 2 hydration
 * scheduler.
 */
export interface IslandProps extends Omit<IslandLayoutProps, "cols" | "rows"> {
  /** Guest contract — provides cells + optional input/modes/signals/palette. */
  guest: IslandGuest
  /** Initial guest cell-grid width. Required (see {@link IslandLayoutProps}). */
  cols: number
  /** Initial guest cell-grid height. Required (see {@link IslandLayoutProps}). */
  rows: number
  /** Whether the island can receive focus. Default: `false`. */
  focusable?: boolean
  /**
   * Palette ownership. Default: `"freeze"` when the guest doesn't declare
   * `capabilities.palette`, `"inherit"` when it does. The per-island prop
   * always wins. See {@link IslandPalettePolicy}.
   */
  palettePolicy?: IslandPalettePolicy
  /**
   * Hydration policy — when `guest.init()` fires. Phase 1 ships `"load"`;
   * `"idle"` / `"visible"` / `"only-on-focus"` are accepted but currently
   * behave identically to `"load"` (TODO: Phase 2 scheduler).
   */
  hydrate?: IslandHydrate
  /**
   * Per-island capability override — intersected with `guest.capabilities`.
   * Use to *narrow* what the guest declared.
   */
  capabilities?: IslandCapabilities
  /** Lifecycle signal callback — fires on `ready` / `exit` / `error`. */
  onSignal?: (sig: IslandSignal) => void
  /**
   * Async-init failure handler. If absent, init errors propagate to the
   * surrounding silvery ErrorBoundary.
   */
  onError?: (err: Error) => void
  /**
   * Host palette snapshot — fed to the factory when `palettePolicy ===
   * "freeze"`. Typically the host's resolved theme palette at mount.
   */
  hostPalette?: ViewportPalette
}

// ============================================================================
// Component
// ============================================================================

/**
 * Render an island. The component is a leaf — no React children. The
 * forwarded ref resolves to the guest's {@link IslandHandle} once
 * `guest.init()` settles; before that, it's `null`.
 *
 * Lifecycle is owned by the component scope (via `useScopeEffect`): on
 * unmount, the scope disposes and `createIsland()`'s teardown runs — aborts
 * the abort controller, calls `handle.dispose()` if a handle was attached,
 * and clears the `islandState` slot from the reconciler's AgNode.
 *
 * @example
 * ```tsx
 * const ref = useRef<IslandHandle | null>(null)
 * return <Island guest={ptyGuest} cols={80} rows={24} ref={ref} />
 * ```
 */
export const Island = forwardRef(function Island(
  props: IslandProps,
  ref: ForwardedRef<IslandHandle | null>,
): JSX.Element {
  const {
    guest,
    cols,
    rows,
    focusable = false,
    palettePolicy,
    hydrate = "load",
    capabilities,
    onSignal,
    onError,
    hostPalette,
    // IslandLayoutProps passthrough (width/height/flex*/etc) — spread into
    // the `<silvery-island>` JSX intrinsic so flexily picks them up via the
    // reconciler's createNode/commitUpdate → applyIslandProps path.
    width,
    height,
    flexGrow,
    flexShrink,
    flexBasis,
    alignSelf,
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
  } = props

  const nodeRef = useRef<AgNode | null>(null)

  // The factory result — created once per hydrate / guest identity (and on
  // cols/rows change so the guest sees the right initial dims). Kept in a
  // ref so subsequent renders don't re-instantiate; the layout effect below
  // owns the lifecycle.
  const slotRef = useRef<{
    factory: CreateIslandResult
    /** Sentinel — cleared on unmount so we don't write to a torn-down slot. */
    alive: boolean
  } | null>(null)

  // Force a second-pass paint AFTER the factory wires islandState onto the
  // reconciler's node. The pipeline's `resetAfterCommit` fires BEFORE
  // useLayoutEffect runs, so the very first render frame would otherwise
  // paint without `islandState` attached. The state bump below schedules a
  // second commit; `flushSyncWork` re-enters the pipeline with islandState
  // populated. Mirrors the equivalent comment in `Viewport.tsx`.
  const [, setMountTick] = useState(0)

  // ── Lifecycle: build factory + attach state, dispose on unmount ──────────
  // The factory's `node` (hand-rolled in @silvery/ag/island, no layoutNode)
  // is discarded — we use the reconciler-created node from nodeRef. We
  // borrow the factory's IslandNodeState + dispose + lifecycle wiring by
  // copying the state slot onto the reconciler's node.
  //
  // We re-run the effect when guest / hydrate change (the guest contract
  // itself or the policy changed → tear down + reacquire). cols/rows
  // changes do NOT re-init — the guest acknowledges resize via the size
  // owner's two-phase protocol; flexily picks up the new dimensions via
  // the reconciler's commitUpdate → applyIslandProps path (host-config.ts).
  useScopeEffect(
    (scope) => {
      const node = nodeRef.current
      if (!node) return

      // Build the framework-agnostic factory. Its `node` field is a stub
      // (layoutNode === null); we discard it and copy the islandState onto
      // the reconciler-owned node from the JSX intrinsic.
      const factory = createIsland({
        guest,
        cols,
        rows,
        focusable,
        palettePolicy,
        hydrate,
        capabilities,
        onSignal: (sig) => {
          // Cascade to user callback FIRST, then mark dirty so any
          // ready-driven layout (e.g. spinner → real content) repaints.
          onSignal?.(sig)
          markNodeDirty(node)
        },
        onError,
        hostPalette,
      })

      const slot = { factory, alive: true }
      slotRef.current = slot

      // Move the islandState slot to the reconciler's node. The factory's
      // own `node` is unused from here on. See file-level doc on why we
      // can't reuse the factory's node directly (no layoutNode).
      const state = factory.node.islandState
      if (state) {
        node.islandState = state
        // Dimensions are pinned by the reconciler's createNode →
        // applyIslandProps; no manual layoutNode.setWidth/setHeight here.
        // Subscribe to guest output so each paint marks the host AgNode
        // dirty and the pipeline repaints. Symmetric with
        // `createViewportContext`'s blit→markDirty path in `Viewport.tsx`.
        // The subscription is owned by the effect scope — when the
        // component unmounts (or guest changes), the scope's
        // `[Symbol.asyncDispose]` runs the deferred unsubscribe before
        // `factory.dispose()` kicks off.
        //
        // Subscriptions live on the handle, which is null until init
        // resolves. We re-check inside a deferred microtask hook attached
        // via `scope.defer` so a deferred-hydrate flow eventually wires
        // the subscription too.
        const subscribeWhenReady = (): void => {
          const handle = slot.alive ? state.handle : null
          if (!handle) return
          const unsub = handle.output.subscribe(() => {
            if (!slot.alive) return
            markNodeDirty(node)
          })
          scope.defer(unsub)
        }
        // Try synchronously — `init` may have already resolved (rare with
        // the Promise.resolve hop in createIsland, but cheap to attempt).
        subscribeWhenReady()
        // Schedule a microtask retry so async init's first-paint
        // subscription doesn't race the first frame. The factory's
        // `lifecycle = "ready"` transition runs in the same microtask that
        // assigns `state.handle`, so this is the first opportunity to see
        // a non-null handle.
        queueMicrotask(() => {
          if (!slot.alive) return
          if (!state.handle) {
            // Still not ready — re-poll on the next tick. For Phase 1's
            // synchronous `"load"` hydration the second microtask is
            // always sufficient; deferred-hydrate would need a richer
            // signal. Tracked under the Phase 2 TODO in createIsland.
            queueMicrotask(subscribeWhenReady)
          } else {
            subscribeWhenReady()
          }
        })
      }

      // Schedule a second render so the pipeline re-runs with islandState
      // attached. See the comment on setMountTick above.
      setMountTick((t) => t + 1)

      return () => {
        // Synchronous cleanup runs before scope dispose:
        //   1. Mark slot dead so deferred subscription callbacks no-op.
        //   2. Clear the islandState pointer on the reconciler's node
        //      (the factory's own dispose chain will still run via
        //      `scope.defer` below, but the node-side pointer drops first
        //      so any concurrent render doesn't see a torn-down slot).
        slot.alive = false
        if (node.islandState === state) {
          node.islandState = null
        }
      }
    },
    [guest, hydrate],
  )

  // cols/rows changes flow through the reconciler's commitUpdate →
  // applyIslandProps path now (host-config.ts has the silvery-island branch);
  // no parallel pin needed here.

  // Defer the factory's lifecycle dispose to the OUTER scope as well, so
  // that even if the React effect cleanup ran (slot marked dead) the abort
  // controller still fires and any in-flight `init()` is torn down.
  useScopeEffect(
    (scope) => {
      scope.defer(() => {
        const slot = slotRef.current
        if (!slot) return
        const ret = slot.factory.dispose()
        if (ret instanceof Promise) {
          // The disposal is async — surface via the scope's error sink
          // so it doesn't silently swallow. We attach a .catch to keep
          // node/bun from emitting an unhandledRejection in tests.
          ret.catch(() => {
            // Reported by the underlying handle.dispose (which routes
            // through whatever logging the guest set up). Swallow here
            // to avoid double-reporting.
          })
        }
      })
    },
    [guest, hydrate],
  )

  // ── Imperative ref handle ────────────────────────────────────────────────
  // The user-facing ref resolves to the guest's IslandHandle (null until
  // init resolves). We re-read the slot on each access so a late-arriving
  // handle is visible without forcing the component to re-render.
  useImperativeHandle<IslandHandle | null, IslandHandle | null>(
    ref,
    () => slotRef.current?.factory.handle ?? null,
    // The handle identity changes when the factory re-instantiates (guest /
    // hydrate change). Cols/rows changes leave the handle stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [guest, hydrate],
  )

  // Leaf — no React children. The reconciler creates an AgNode with type
  // `silvery-island` and a real layoutNode; we capture it via `nodeRef`.
  // Spread all IslandLayoutProps so flexily picks them up via createNode /
  // commitUpdate → applyIslandProps. cols/rows are the guest cell-grid dims;
  // width/height/flex* override them for the layout slot when present.
  return (
    <silvery-island
      ref={nodeRef}
      cols={cols}
      rows={rows}
      width={width}
      height={height}
      flexGrow={flexGrow}
      flexShrink={flexShrink}
      flexBasis={flexBasis}
      alignSelf={alignSelf}
      minWidth={minWidth}
      minHeight={minHeight}
      maxWidth={maxWidth}
      maxHeight={maxHeight}
    />
  )
})

// ============================================================================
// Dirty propagation helper
// ============================================================================

/**
 * Mark the island's host AgNode dirty so the next pipeline run blits the
 * guest's cell buffer, AND propagate SUBTREE_BIT up the parent chain so
 * `renderPhase`'s no-op-frame-skip (which gates on the root's dirty bits)
 * actually enters the walk. Mirrors `markNodeDirty` in `Viewport.tsx` —
 * inlined here to avoid widening the reconciler's public surface for two
 * consumers.
 */
function markNodeDirty(node: AgNode): void {
  const epoch = getRenderEpoch()
  const ownBits = CONTENT_BIT | SUBTREE_BIT
  if (node.dirtyEpoch !== epoch) {
    node.dirtyBits = ownBits
    node.dirtyEpoch = epoch
  } else {
    node.dirtyBits |= ownBits
  }
  trackContentDirty(node)
  let ancestor: AgNode | null = node.parent
  while (ancestor && !isDirty(ancestor.dirtyBits, ancestor.dirtyEpoch, SUBTREE_BIT)) {
    if (ancestor.dirtyEpoch !== epoch) {
      ancestor.dirtyBits = SUBTREE_BIT
      ancestor.dirtyEpoch = epoch
    } else {
      ancestor.dirtyBits |= SUBTREE_BIT
    }
    ancestor = ancestor.parent
  }
}

// ============================================================================
// Re-exports for ref typing
// ============================================================================

export type { IslandHandle, IslandGuest, IslandNodeState } from "@silvery/ag/island-types"
