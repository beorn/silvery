/**
 * Silvery Islands — cell-grid mount primitive (`<Island>` + `IslandGuest`).
 *
 * An island is a rectangular region in the silvery render tree whose CONTENT
 * is produced by a runtime-agnostic {@link IslandGuest} — a PTY child, a
 * snapshot, a replay stream, an embedded silvery sub-instance, an Ink legacy
 * app, a Vue cellgrid, anything satisfying the contract. Silvery is host-only;
 * content is anything.
 *
 * Layer 1 (this file) defines the AgNode-side primitive types: how an island
 * is represented on the render tree (`silvery-island` AgNode + {@link
 * IslandNodeState}), and the guest contract the host calls into. Layer 2 (the
 * `createIsland()` factory + `<Island>` React binding) wires guest lifecycle,
 * focus routing, and ErrorBoundary integration on top of these types.
 *
 * Supersedes the v1 `<Viewport>` + `ForeignSource` + `ViewportContext`
 * primitive from epic `@km/silvery/15513-surface-nested-composition-primitive`
 * and the 3-axis H1+H4+H5 plan in `@km/termless/15589`. See
 * `@km/silvery/15646-islands` for the full epic body, /pro-resolved decisions,
 * and acceptance gates.
 *
 * Sub-owner pattern recursively mirrors the 2026-04 `term.*` migration
 * (`@km/silvery/14991-input-structured-events`): one `IslandHandle` carries
 * `size | output | input? | modes? | signals? | palette?` — same shape as
 * `Term.size | output | input | modes | signals | console`. One pattern
 * applied at every level.
 */

import type { CellBuffer, ViewportPalette, ViewportRect } from "./viewport-types"

// ============================================================================
// Lifecycle signals
// ============================================================================

/**
 * Lifecycle signals emitted by an {@link IslandGuest} via `ctx.emit()`.
 *
 * The host subscribes via `createIsland({ onSignal })`. Always serializable
 * — replay guests reconstruct sessions by replaying these.
 */
export type IslandSignal =
  | { type: "ready" }
  | { type: "exit"; code?: number; reason?: string }
  | { type: "error"; error: Error }

// ============================================================================
// Capabilities, hydration, palette policy
// ============================================================================

/**
 * Capabilities a guest declares to the host. Drives whether the host renders
 * input routing, resize negotiation, and palette ownership for this island.
 *
 * Per-island prop capability overrides (set on `<Island capabilities={...}>`)
 * intersect with per-guest capability declarations — intersection wins
 * (host never offers a capability the guest can't fulfill).
 */
export interface IslandCapabilities {
  /** Guest accepts input events from the host (key / mouse / paste). */
  input?: boolean
  /** Guest manages cursor-shape / alt-screen / bracketed-paste / mouse-tracking modes. */
  modes?: boolean
  /** Guest can resize dynamically (host calls {@link IslandSizeOwner.requestResize}). */
  resize?: boolean
  /** Guest owns its palette (OSC 4 / 10 / 11). Default: host freezes palette. */
  palette?: boolean
}

/**
 * Per-island hydration policy — Astro-borrowed. Default: `"load"`.
 *
 * - `"load"`: guest.init() fires synchronously at mount.
 * - `"idle"`: defer until `requestIdleCallback` (or microtask fallback).
 * - `"visible"`: defer until the island's rect intersects the viewport.
 * - `"only-on-focus"`: defer until the island first receives focus; tear
 *   down on blur. Cheapest for multi-pane hosts (silvercode panes).
 */
export type IslandHydrate = "load" | "idle" | "visible" | "only-on-focus"

/**
 * Palette ownership policy per island.
 *
 * - `"freeze"` — host snapshots the current theme palette at mount; guest
 *   sees a frozen view. Default for PTY / snapshot guests (compositing
 *   isolation; theme drift cannot leak into recorded content).
 * - `"inherit"` — guest inherits the host theme palette; theme changes
 *   cascade live. Default for sub-silvery / Vue / Solid guests (semantic
 *   theme coherence is the point).
 * - `{ custom }` — explicit {@link ViewportPalette}. Overrides both.
 */
export type IslandPalettePolicy = "freeze" | "inherit" | { custom: ViewportPalette }

// ============================================================================
// Sub-owners (same shape as Term sub-owners from 14991 migration)
// ============================================================================

/**
 * Size owner — exposes guest dimensions; host requests resize via
 * `requestResize()`; guest acknowledges by emitting on its next paint.
 *
 * Two-phase resize protocol (the P0 landmine /pro caught):
 *   1. Host calls `requestResize(cols, rows)` (advisory).
 *   2. Guest decides; if accepted, writes content at new dims on its next
 *      `output.writeCells()`.
 *   3. Host reads new `cols` / `rows` after the guest acknowledges via
 *      `output` — never assumes resize was accepted synchronously.
 *
 * `island-resize-race` STRICT slug catches violations of this protocol.
 */
export interface IslandSizeOwner {
  readonly cols: number
  readonly rows: number
  /** Subscribe to size changes (alien-signals compatible). */
  subscribe(listener: (size: { cols: number; rows: number }) => void): () => void
  /** Host-side: ask the guest to resize. Guest acknowledges via next paint. */
  requestResize(cols: number, rows: number): void
}

/**
 * Output owner — guest writes cells / cursor / mode hints to the host.
 * Host renders via the pipeline render phase.
 *
 * The buffer is read-only from the host's perspective (upcast to
 * {@link CellBuffer}). Guests own the underlying mutable buffer.
 *
 * `island-paint-oob` STRICT slug catches guest writes outside the island's
 * declared rect; `island-paint-budget` STRICT slug catches runaway paint
 * cadence (per-frame byte budget).
 */
export interface IslandOutputOwner {
  /** Current cell buffer (read-only upcast for host blit). */
  readonly buffer: CellBuffer
  /**
   * Last-known guest cursor position + style; null when hidden.
   * Host renders this WITHIN the island's rect; the host cursor is
   * suppressed inside an island (cursor un-apply on blur — see Modes owner).
   */
  readonly cursor: IslandCursorState | null
  /** True if guest wants its cursor painted in the host frame. */
  readonly cursorVisible: boolean
  /**
   * Subscribe to output-relevant changes (new cells, cursor move, mode
   * change). Host marks the island's rect dirty on each callback.
   */
  subscribe(listener: () => void): () => void
  /**
   * Guest-side: write cells at the given island-local dirty rects. The
   * supplied buffer is the guest's source; cells outside the dirty rects
   * are unchanged.
   *
   * Origin `(0, 0)` = top-left of island content area (NOT absolute
   * terminal). Host translates at blit time.
   */
  writeCells(dirtyRects: readonly ViewportRect[], buffer: CellBuffer): void
  /** Guest-side: force a full island repaint on the next frame. */
  invalidateAll(): void
}

/**
 * Guest-internal cursor descriptor (style + position).
 * Style values match {@link import("./viewport-types").ViewportCursorStyle}.
 */
export interface IslandCursorState {
  row: number
  col: number
  style: "block" | "underline" | "bar"
}

/**
 * Input owner — host routes input events to the guest when the island is
 * focused. Exposes typed `on*` callbacks (canonical) AND an `events()`
 * AsyncIterable (restored ergonomic wrapper from pre-14991; zero behavioral
 * cost — see `@km/silvery/15646` decision row "Restore input.events()").
 *
 * The host translates host-coordinate mouse events to island-local
 * `(row, col)` before delivery — the P0 landmine /pro caught.
 *
 * Synchronous focus severance: when focus moves to a different island, the
 * host stops delivering events to the previous island AT the focus-change
 * tick. No queue / drop / forward-after-blur surprise modes.
 *
 * `input.sendEof()` / `signals.sendSigint()` / `signals.sendSigtstp()` are
 * DISTINCT: Ctrl-D ≠ Ctrl-C ≠ Ctrl-Z. The 15645 sketch wrongly mapped
 * Ctrl-D → "interrupt"; islands gets it right.
 */
export interface IslandInputOwner {
  /** Key event (mapped through host's Kitty / mouse / focus protocol layers). */
  onKey?(handler: (event: IslandKeyEvent) => void): () => void
  /** Mouse event with island-local coordinates (host-translated). */
  onMouse?(handler: (event: IslandMouseEvent) => void): () => void
  /** Bracketed-paste content (host-decoded; no \x1b[200~ sequences). */
  onPaste?(handler: (text: string) => void): () => void
  /**
   * Raw byte feed for guests that speak ANSI directly (PTY pipe). Most
   * guests should prefer typed `on*` events; `feed()` is the escape hatch
   * for "I have an xterm.js process and want every byte."
   */
  feed?(bytes: Uint8Array): void
  /**
   * AsyncIterable view over all input events. Restored ergonomic wrapper
   * for the `for await (const ev of island.input.events()) {...}` idiom.
   * Yields the same event objects as the typed `on*` callbacks.
   */
  events?(): AsyncIterable<IslandInputEvent>
  /**
   * Send EOT (Ctrl-D, U+0004) to the guest. Distinct from `signals.sendSigint()`.
   * EOT closes the guest's stdin (or signals end-of-stream); signal verbs
   * deliver actual POSIX signals.
   */
  sendEof?(): void
}

/** Discriminated union of all input event types. */
export type IslandInputEvent =
  | (IslandKeyEvent & { kind: "key" })
  | (IslandMouseEvent & { kind: "mouse" })
  | { kind: "paste"; text: string }
  | { kind: "feed"; bytes: Uint8Array }

/**
 * Key event delivered to a focused island. Mirrors the host's parsed
 * {@link import("./keys").Key} shape — re-exported here so guests don't
 * have to depend on `@silvery/ag/keys` for its public surface.
 */
export interface IslandKeyEvent {
  /** Plain character (for printable keys), or empty for special keys. */
  input: string
  /** Named key (e.g. "escape", "enter", "tab", "f1"); empty for printable. */
  name?: string
  /** Modifier state. */
  ctrl?: boolean
  meta?: boolean
  alt?: boolean
  shift?: boolean
  super?: boolean
  /** Event type — only "press" / "repeat" delivered; "release" filtered by host. */
  eventType?: "press" | "repeat"
}

/**
 * Mouse event with ISLAND-LOCAL coordinates. Origin `(0, 0)` = top-left of
 * island content area. Host translates from absolute terminal coords before
 * delivery — guests never see host-relative positions.
 */
export interface IslandMouseEvent {
  /** Island-local row (0 = top of island content). */
  row: number
  /** Island-local column (0 = left of island content). */
  col: number
  /** Button: "left" | "middle" | "right" | "wheel-up" | "wheel-down" | "release". */
  button: string
  /** Held modifiers at event time. */
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
}

/**
 * Modes owner — host queries which protocol modes the guest currently wants
 * active (alt-screen, bracketed-paste, mouse-tracking SGR, Kitty keyboard,
 * focus-reporting, cursor shape + visibility).
 *
 * Host AGGREGATES modes from all focused-subtree islands into one global
 * protocol-mode set. When focus moves, the aggregator recomputes; modes
 * the new focus wants are enabled, modes only the previous focus wanted
 * are disabled. THIS is what replaces the 15 `!inputDisabled` gating sites
 * in `create-app.tsx` (Unit C deletion).
 *
 * `island-mode-leak` STRICT slug catches modes that stay enabled after
 * the requesting island unmounts or loses focus.
 */
export interface IslandModesOwner {
  /** Current desired modes (host reads). */
  readonly modes: IslandProtocolModes
  /** Subscribe to mode changes. Host re-aggregates on each callback. */
  subscribe(listener: (modes: IslandProtocolModes) => void): () => void
}

/**
 * Protocol modes a focused island can request the host enable. None are
 * defaults — host enables only modes some focused island asks for.
 */
export interface IslandProtocolModes {
  altScreen?: boolean
  bracketedPaste?: boolean
  mouseTracking?: "off" | "click" | "drag" | "any"
  kittyKeyboard?: boolean
  focusReporting?: boolean
  /** Guest's desired cursor shape + visibility. Un-applied on blur. */
  cursor?: { shape: "block" | "underline" | "bar"; visible: boolean }
}

/**
 * Signals owner — delivers POSIX signals to the guest. PTY-backed guests
 * forward to the child process; snapshot / replay guests typically have
 * no signal handlers and ignore (capabilities.input = false hides this
 * owner from the host).
 *
 * Distinct verbs per signal — explicitly NOT a single `send(signal)`
 * because the call sites have semantic differences the host needs to
 * route correctly (Ctrl-C from `signals.sendSigint()` is different from
 * EOT via `input.sendEof()`).
 */
export interface IslandSignalsOwner {
  /** Send SIGINT (Ctrl-C). */
  sendSigint(): void
  /** Send SIGTSTP (Ctrl-Z, suspend). */
  sendSigtstp(): void
  /** Send SIGTERM (graceful termination). */
  sendSigterm(): void
  /** Send SIGKILL (immediate). Last-resort. */
  sendSigkill(): void
  /** Exit-code stream (resolves when guest reports exit). */
  readonly exit: Promise<{ code?: number; reason?: string }>
}

/**
 * Palette owner — OSC 4 / 10 / 11 query + response + snapshot. Present only
 * when `capabilities.palette = true` (guest owns palette) AND the island's
 * `palettePolicy !== "freeze"`.
 *
 * Frozen-palette islands (the default for PTY / snapshot guests) get a
 * read-only snapshot at mount and no palette owner — palette queries
 * inside the guest are responded to from the snapshot, not the live host.
 */
export interface IslandPaletteOwner {
  /** Current palette (live, or the frozen snapshot if `palettePolicy="freeze"`). */
  readonly palette: ViewportPalette
  /** Subscribe to palette changes (only fires when not frozen). */
  subscribe(listener: (palette: ViewportPalette) => void): () => void
  /**
   * Guest-side: respond to an OSC 4 / 10 / 11 query. Host typically routes
   * these to a real terminal probe; islands compose by chaining through
   * the `sandbox` wrapper.
   */
  respondToQuery?(query: string): string | undefined
}

// ============================================================================
// IslandHandle — what `guest.init()` returns; what the host renders against
// ============================================================================

/**
 * Imperative handle returned by an {@link IslandGuest}'s `init()`. The host
 * stores this on the AgNode's {@link IslandNodeState} and reads through it
 * each render frame.
 *
 * Sub-owners are optional per `capabilities`: a snapshot guest with no
 * input may return `{ size, output, dispose }` and nothing else. The
 * `<Island>` React binding propagates the right defaults; the host
 * aggregator (Unit C) treats absent owners as "no requested modes /
 * no input routing."
 */
export interface IslandHandle {
  /** Required — every island has a size. */
  readonly size: IslandSizeOwner
  /** Required — every island has output (even if empty). */
  readonly output: IslandOutputOwner
  /** Present when `capabilities.input = true`. */
  readonly input?: IslandInputOwner
  /** Present when `capabilities.modes = true`. */
  readonly modes?: IslandModesOwner
  /** Present when the guest can deliver signals (PTY-backed). */
  readonly signals?: IslandSignalsOwner
  /**
   * Present when `capabilities.palette = true` AND `palettePolicy !== "freeze"`.
   * Frozen-palette islands respond to OSC queries from the snapshot — no
   * live owner needed.
   */
  readonly palette?: IslandPaletteOwner
  /**
   * Tear down the guest. Called on unmount (`<Island>` cleanup), on focus
   * loss for `hydrate: "only-on-focus"` islands, and on ErrorBoundary
   * catches. MUST be idempotent.
   *
   * `island-dispose-leak` STRICT slug catches guests that retain resources
   * (timers, sockets, FDs) past dispose.
   */
  dispose(): void | Promise<void>
}

// ============================================================================
// IslandContext — passed to `guest.init()`
// ============================================================================

/**
 * Context passed to {@link IslandGuest.init}. The guest captures this for
 * the lifetime of its connection and uses it to push lifecycle signals,
 * request resize, execute host-fulfilled OSC ops, and read monotonic time.
 *
 * One `IslandContext` exists per mounted island. `abortSignal` fires on
 * unmount (or on focus-loss for `hydrate: "only-on-focus"` islands) — the
 * guest MUST release resources tied to this context when it aborts.
 */
export interface IslandContext {
  /** Initial island dimensions in cells. */
  readonly cols: number
  readonly rows: number
  /**
   * Emit a lifecycle signal. Host forwards to the `onSignal` callback set
   * on `createIsland({ onSignal })`.
   */
  emit(signal: IslandSignal): void
  /**
   * Ask the host to resize the island. Host confirms via {@link
   * IslandSizeOwner} on the next layout tick — guest MUST wait for the
   * confirmation before writing content at new dims (two-phase protocol;
   * `island-resize-race` STRICT slug catches violations).
   */
  requestResize(cols: number, rows: number): void
  /**
   * Host-fulfilled OS side-effect: guest sends an OSC string (e.g.
   * `\x1b]52;c;<base64>\x07` for clipboard), host parses + executes +
   * returns the response (if any). Otherwise OSC 52 / 4 / 10 / 11 ops
   * from inside the guest would vanish into the island's cell grid.
   */
  execOSC(command: string): Promise<string | void>
  /**
   * Aborts on unmount (or on focus-loss for `hydrate: "only-on-focus"`).
   * Guests MUST release resources on signal — sockets closed, FDs freed,
   * timers cleared.
   */
  readonly abortSignal: AbortSignal
  /**
   * Monotonic time source. Replay guests use this for deterministic
   * playback; live guests can use `performance.now()` directly.
   */
  now(): number
}

// ============================================================================
// IslandGuest — the runtime-agnostic content contract
// ============================================================================

/**
 * The runtime-agnostic guest contract. Implementations: `ptyGuest`,
 * `snapshotGuest`, `replayGuest`, `silveryGuest` (embedded sub-instance),
 * `inkGuest` (legacy adapter), `vueGuest`, `solidGuest`, … any author.
 *
 * Silvery does NOT ship per-framework adapters beyond `ptyGuest` /
 * `snapshotGuest` / a `sandbox(guest)` wrapper. Community frameworks
 * implement the contract directly; the contract is the integration surface.
 *
 * `init()` returns `Promise` externally — backend authors get one clear
 * shape (the /pro decision); sync internals are handled by `Promise.resolve()`
 * at mount.
 */
export interface IslandGuest {
  /**
   * Initialize the guest. Called once at mount (or on first focus for
   * `hydrate: "only-on-focus"`). Returns an {@link IslandHandle} the host
   * uses to render the island.
   *
   * If `init()` rejects, the silvery ErrorBoundary catches; if `onError`
   * is set on the `<Island>`, it receives the error; otherwise it throws
   * up to the parent boundary.
   */
  init(ctx: IslandContext): Promise<IslandHandle>
  /**
   * Capabilities this guest CAN provide. Host intersects with per-island
   * prop overrides — guest never has to fulfill what it didn't declare.
   *
   * Omitted = no capabilities (snapshot-only).
   */
  capabilities?: IslandCapabilities
}

// ============================================================================
// IslandNodeState — the AgNode slot
// ============================================================================

/**
 * Per-instance state attached to a `silvery-island` AgNode. Owned by the
 * `createIsland()` factory (or the `<Island>` React binding); read by the
 * pipeline render phase to blit the guest's cell buffer at the node's
 * `boxRect` and route input/mode aggregation.
 *
 * Lazily created at mount (the host node has no `islandState` until the
 * factory runs its mount effect). After unmount the slot may be cleared,
 * but the AgNode is also torn down at that point.
 *
 * Mirrors {@link import("./viewport-types").ViewportNodeState} structurally
 * — the migration story is: `Viewport` is `Island`'s special-case for
 * "snapshot-only" + "no input"; Island generalizes by exposing the full
 * sub-owner contract.
 *
 * @internal — public callers should use the `<Island>` props + ref handle;
 * direct AgNode access is for the pipeline + STRICT-mode checks only.
 */
export interface IslandNodeState {
  /**
   * The guest's handle, or `null` until `init()` resolves (deferred-hydrate
   * islands hold `null` until first focus / visibility).
   */
  handle: IslandHandle | null
  /**
   * The guest contract — kept on the node so deferred-hydrate islands can
   * re-init on focus / visibility transitions.
   */
  guest: IslandGuest
  /**
   * Effective capabilities (per-island intersection of guest declarations
   * with per-island prop overrides). Computed once at mount; recomputed
   * on capability prop change.
   */
  capabilities: IslandCapabilities
  /** Whether this island can receive focus. Read by host focus manager. */
  focusable: boolean
  /** True iff this island is currently in the focused subtree. */
  focused: boolean
  /**
   * Effective palette policy. Frozen palette: snapshot held in
   * `frozenPalette`. Inherit: `null` (host theme cascades).
   */
  palettePolicy: IslandPalettePolicy
  /** Frozen palette snapshot (set only when policy = "freeze"). */
  frozenPalette: ViewportPalette | null
  /** Hydration policy; drives when `init()` fires. */
  hydrate: IslandHydrate
  /**
   * Lifecycle state — drives the render phase + STRICT mode checks.
   * - `"pending"`: handle not yet created (deferred hydrate, or init in flight).
   * - `"ready"`: handle live, guest producing content.
   * - `"errored"`: init or runtime threw; ErrorBoundary handles display.
   * - `"disposed"`: dispose() called; AgNode awaiting unmount.
   */
  lifecycle: "pending" | "ready" | "errored" | "disposed"
  /** Last error reported by the guest (set in `"errored"` state). */
  lastError: Error | null
  /**
   * Abort controller fed to the guest's `IslandContext.abortSignal`. Host
   * aborts on unmount / focus-loss (for "only-on-focus" hydrate) / dispose.
   */
  abortController: AbortController
}
