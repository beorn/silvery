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
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import { type CreateIslandResult, createIsland } from "@silvery/ag/island"
import type {
  IslandCapabilities,
  IslandArtifactCapabilities,
  IslandCommandPrefix,
  IslandGuest,
  IslandHandle,
  IslandHydrate,
  IslandPalettePolicy,
  IslandSignal,
} from "@silvery/ag/island-types"
import { trackContentDirty } from "@silvery/ag/dirty-tracking"
import { CONTENT_BIT, SUBTREE_BIT, isDirty, markDirty } from "@silvery/ag/epoch"
import type { AgNode, UserSelect } from "@silvery/ag/types"
import type { ViewportPalette } from "@silvery/ag/viewport-types"
import type { IslandLayoutProps } from "../reconciler/nodes"
import { FocusManagerContext, StdoutContext } from "../context"
import { useTerm } from "../hooks/useTerm"
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
  /** Focus this Island's AgNode after mount or when it becomes focusable. */
  autoFocus?: boolean
  /**
   * CSS user-select equivalent for the guest cell grid. Defaults to inherited
   * selectability; islands always clamp an active host selection to their rect.
   */
  userSelect?: UserSelect
  /**
   * Host-designated cursor activation, INDEPENDENT of input focus
   * (@km/silvery/19426). When true the host renders this island's guest cursor
   * as the hardware caret (no input focus, so the host keeps its own key
   * handling). The host owns the one-cursor invariant — set on at most one
   * island at a time. Default: `false`.
   */
  cursorActive?: boolean
  /**
   * Host command prefix (tmux model, @hab/.../20349). When the island is the
   * focused input target, the host reserves a matching key — it falls through to
   * the app's `useInput` instead of feeding the guest. A key is reserved iff it
   * matches `commandPrefix.hotkey` OR `commandPrefix.capturing` is true. Absent
   * ⇒ the focused guest captures every key (default). Use to keep a command
   * prefix (e.g. `Ctrl-G`) while a full-screen guest owns the rest; a deck binds
   * `capturing` to its chord-pending state so chord follow-ups route to the host.
   */
  commandPrefix?: IslandCommandPrefix
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
    autoFocus = false,
    userSelect,
    cursorActive = false,
    commandPrefix,
    palettePolicy,
    hydrate = "load",
    capabilities,
    onSignal,
    onError,
    hostPalette,
    // IslandLayoutProps passthrough (width/height/flex*/etc) — spread into
    // the `<silvery-island>` JSX intrinsic so flexily picks them up via the
    // reconciler's createNode/commitUpdate → applyIslandProps path.
    testID,
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
  const focusManager = useContext(FocusManagerContext)
  const stdoutContext = useContext(StdoutContext)
  const term = useTerm()
  const artifactCapabilities = useMemo<IslandArtifactCapabilities | undefined>(
    () =>
      stdoutContext?.queueFrameArtifact
        ? {
            terminalSequences: {
              kittyGraphics: term.caps.kittyGraphics,
              sixel: term.caps.sixel,
            },
          }
        : undefined,
    [stdoutContext?.queueFrameArtifact, term.caps.kittyGraphics, term.caps.sixel],
  )

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

  // Bumped once when `guest.init()` resolves so the imperative ref below
  // refreshes to the real handle. `useImperativeHandle` captures its factory's
  // return value (it is NOT a live getter), and `guest.init()` is async — so
  // without a dep that changes on handle-ready, a callback-ref consumer
  // (`ref={(h) => …}`, e.g. silvermux pane registration) would be invoked once
  // at mount with `null` and never again. @km/silvery/19426.
  const [handleEpoch, setHandleEpoch] = useState(0)

  // Latest grid dims for the handle-resolve reconcile below. The host-driven
  // resize effect early-returns while `init()` is still in flight (no handle
  // yet), so a cols/rows change landing in that window would otherwise be
  // dropped — the guest would sit at its init-time dims until the NEXT host
  // resize (20992 geometry law; hab reattach "keeps stale dims" symptom).
  const colsRef = useRef(cols)
  colsRef.current = cols
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  useEffect(() => {
    const node = nodeRef.current
    if (!autoFocus || !focusable || !node || !focusManager) return
    focusManager.focus(node, "programmatic")
  }, [autoFocus, focusManager, focusable, handleEpoch])

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

      let resolveHandle!: (handle: IslandHandle) => void
      let rejectHandle!: (err: unknown) => void
      const handleReady = new Promise<IslandHandle>((resolve, reject) => {
        resolveHandle = resolve
        rejectHandle = reject
      })
      const trackedGuest: IslandGuest = {
        ...guest,
        async init(ctx) {
          try {
            const handle = await guest.init(ctx)
            resolveHandle(handle)
            return handle
          } catch (err) {
            rejectHandle(err)
            throw err
          }
        },
      }

      // Set to `subscribeToHandle` right after the factory returns. The
      // factory can only call `onAttach` from a later microtask (init runs
      // through `Promise.resolve().then(...)`), so this forward reference is
      // always resolved by the time it fires.
      let attachHandle: ((handle: IslandHandle) => void) | null = null

      // Build the framework-agnostic factory. Its `node` field is a stub
      // (layoutNode === null); we discard it and copy the islandState onto
      // the reconciler-owned node from the JSX intrinsic.
      const factory = createIsland({
        guest: trackedGuest,
        cols,
        rows,
        focusable,
        palettePolicy,
        hydrate,
        capabilities,
        artifactCapabilities,
        onSignal: (sig) => {
          // Cascade to user callback FIRST, then mark dirty so any
          // ready-driven layout (e.g. spinner → real content) repaints.
          onSignal?.(sig)
          markNodeDirty(node)
        },
        onAttach: (handle) => attachHandle?.(handle),
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
        // resolves, so the factory hands it to us through `onAttach` — in
        // the same microtask that assigns `islandState.handle`. Deferring
        // this by even one microtask reopens @si/render/24649: a frame
        // driven by unrelated state renders the now-attached island while
        // nothing has marked it dirty, the fast path skips it, and the
        // blanks painted before the attach survive in the cloned buffer
        // (incremental ≠ fresh under SILVERY_STRICT; a permanently empty
        // island body on screen without it).
        let subscribed = false
        let paintScheduled = false
        const requestIslandPaint = (): void => {
          if (!slot.alive) return
          markNodeDirty(node)
          if (paintScheduled) return
          paintScheduled = true
          queueMicrotask(() => {
            paintScheduled = false
            if (!slot.alive) return
            markNodeDirty(node)
            setMountTick((t) => t + 1)
          })
        }
        const subscribeToHandle = (handle: IslandHandle): void => {
          if (!slot.alive || subscribed) return
          subscribed = true
          const unsub = handle.output.subscribe(requestIslandPaint)
          scope.defer(unsub)

          const artifactOwner = handle.output.artifacts
          if (artifactOwner) {
            const drainArtifacts = (): void => {
              if (!slot.alive) return
              const rect = node.boxRect
              if (!rect) {
                requestIslandPaint()
                return
              }
              const queueFrameArtifact = stdoutContext?.queueFrameArtifact
              const packets = artifactOwner.drain()
              for (const packet of packets) {
                const protocolSupported =
                  packet.protocol === "kitty"
                    ? artifactCapabilities?.terminalSequences.kittyGraphics === true
                    : artifactCapabilities?.terminalSequences.sixel === true
                const anchorInRect =
                  Number.isInteger(packet.row) &&
                  Number.isInteger(packet.col) &&
                  packet.row >= 0 &&
                  packet.col >= 0 &&
                  packet.row < rect.height &&
                  packet.col < rect.width
                if (!queueFrameArtifact || !protocolSupported || !anchorInRect) {
                  console.error(
                    `[silvery] refused island ${packet.protocol} artifact: ` +
                      (!queueFrameArtifact
                        ? "no frame-artifact consumer"
                        : !protocolSupported
                          ? "outer terminal capability unconfirmed"
                          : "guest anchor outside committed rect"),
                  )
                  continue
                }
                const committedRect = {
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height,
                }
                const row = committedRect.y + packet.row
                const col = committedRect.x + packet.col
                queueFrameArtifact({
                  kind: "terminal-sequence",
                  owner: `island:${packet.protocol}`,
                  sequence: `\x1b[${row + 1};${col + 1}H${packet.sequence}`,
                  zIndex: packet.zIndex,
                  valid: () => {
                    const current = node.boxRect
                    return (
                      slot.alive &&
                      current !== null &&
                      current.x === committedRect.x &&
                      current.y === committedRect.y &&
                      current.width === committedRect.width &&
                      current.height === committedRect.height
                    )
                  },
                })
              }
              if (packets.length > 0) requestIslandPaint()
            }
            const unsubscribeArtifacts = artifactOwner.subscribe(drainArtifacts)
            scope.defer(unsubscribeArtifacts)
            drainArtifacts()
          }

          // The handle may resolve long after the mount commit. Request a
          // paint so its already-populated first buffer can show even if no
          // guest output event fires after the subscription is attached.
          requestIslandPaint()
        }

        // Fires from `nodeState.handle = handle` inside the factory, so the
        // first thing that happens after the island becomes paintable is the
        // host marking it dirty (via `requestIslandPaint` at the end of
        // `subscribeToHandle`). Nothing between the two can render a stale
        // frame.
        attachHandle = subscribeToHandle

        void handleReady.then(
          (handle) => {
            // Refresh the imperative ref now that the handle exists so
            // callback-ref consumers receive it. @km/silvery/19426.
            if (slot.alive) setHandleEpoch((e) => e + 1)
            // Reconcile to the host's LATEST grid. The resize effect below
            // no-ops while the handle is null, so any cols/rows change that
            // landed during init would be dropped without this replay. Two-
            // phase protocol: we only REQUEST; the guest acknowledges on its
            // next paint.
            if (
              slot.alive &&
              (handle.size.cols !== colsRef.current || handle.size.rows !== rowsRef.current)
            ) {
              handle.size.requestResize(colsRef.current, rowsRef.current)
            }
          },
          () => {
            // createIsland routes init failures through onError / ErrorBoundary.
          },
        )
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
    [guest, hydrate, artifactCapabilities],
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
    [guest, hydrate, artifactCapabilities],
  )

  // Host-driven resize: prop/layout owners update cols/rows without
  // re-instantiating the guest. Forward the new grid dimensions through the
  // IslandSizeOwner so PTY guests can resize their child process.
  useEffect(() => {
    const handle = slotRef.current?.factory.handle
    if (!handle) return
    if (handle.size.cols === cols && handle.size.rows === rows) return
    handle.size.requestResize(cols, rows)
  }, [cols, rows, guest, hydrate])

  // Host-designated cursor activation (@km/silvery/19426). Mirror the prop onto
  // the reconciler node's islandState so `findActiveCursorRect` renders this
  // island's guest cursor as the host caret WITHOUT focusing the island (which
  // would route input away from the host's own handler). Mark the node dirty so
  // the active-cursor walk re-evaluates on the next frame. Runs after the
  // factory effect attaches islandState (effect declaration order).
  useEffect(() => {
    const node = nodeRef.current
    if (node?.islandState) {
      node.islandState.cursorActive = cursorActive
      markNodeDirty(node)
    }
  }, [cursorActive, guest, hydrate])

  // Host command prefix (tmux model, @hab/.../20349). Mirror the latest
  // commandPrefix onto the reconciler node's islandState so the runtime's
  // focused-island key router (`routeKeyToFocusedIsland` in event-handlers.ts)
  // can ask "is this a host-reserved key?" before forwarding to the guest.
  // Unlike cursorActive this doesn't affect what is PAINTED — it's read live at
  // event time — so no markNodeDirty. commandPrefix is typically an inline
  // object (fresh identity each render, and `capturing` flips as the host enters
  // / leaves a chord); writing it every render keeps the routed value current.
  // Runs after the factory effect attaches islandState (effect order).
  useEffect(() => {
    const node = nodeRef.current
    if (node?.islandState) {
      node.islandState.commandPrefix = commandPrefix
    }
  }, [commandPrefix, guest, hydrate])

  // ── Imperative ref handle ────────────────────────────────────────────────
  // The user-facing ref resolves to the guest's IslandHandle (null until
  // init resolves). `useImperativeHandle` captures its factory's RETURN VALUE
  // on each deps change — it is NOT a live getter — so `handleEpoch` (bumped
  // when `guest.init()` resolves) must be a dep, otherwise a callback-ref
  // consumer is invoked once at mount with `null` and never refreshed to the
  // real handle. @km/silvery/19426.
  useImperativeHandle<IslandHandle | null, IslandHandle | null>(
    ref,
    () => slotRef.current?.factory.handle ?? null,
    // Handle identity changes when the factory re-instantiates (guest / hydrate
    // change) and becomes non-null when init resolves (handleEpoch).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [guest, hydrate, handleEpoch],
  )

  // Leaf — no React children. The reconciler creates an AgNode with type
  // `silvery-island` and a real layoutNode; we capture it via `nodeRef`.
  // Spread all IslandLayoutProps so flexily picks them up via createNode /
  // commitUpdate → applyIslandProps. cols/rows are the guest cell-grid dims;
  // width/height/flex* override them for the layout slot when present.
  return (
    <silvery-island
      ref={nodeRef}
      testID={testID}
      cols={cols}
      rows={rows}
      focusable={focusable}
      userSelect={userSelect}
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
  const ownBits = CONTENT_BIT | SUBTREE_BIT
  markDirty(node, ownBits)
  trackContentDirty(node)
  let ancestor: AgNode | null = node.parent
  while (ancestor && !isDirty(ancestor, SUBTREE_BIT)) {
    markDirty(ancestor, SUBTREE_BIT)
    ancestor = ancestor.parent
  }
}

// ============================================================================
// Re-exports for ref typing
// ============================================================================

export type { IslandHandle, IslandGuest, IslandNodeState } from "@silvery/ag/island-types"
