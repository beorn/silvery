/**
 * withTerminalChain — apply-chain plugin for terminal observer + lifecycle.
 *
 * This is the substrate counterpart to `@silvery/ag-term/plugins/with-terminal`
 * (which wraps the test-harness `App`). Where that plugin cares about the
 * test-facing handle, this one plugs into the runtime apply chain that
 * `create-app.tsx`'s processEventBatch drives.
 *
 * ## Responsibilities
 *
 *   - Observer lane: always update modifier state on `input:key` ops
 *     (never consumes; always passes through to the next plugin).
 *   - Resize handling: `term:resize` updates the stored dimensions
 *     and schedules a `render` effect.
 *   - Focus lifecycle: `term:focus` updates `focused` and clears
 *     sticky modifiers on blur (a very common source of "Ctrl stuck
 *     down" bugs after Alt-Tab).
 *
 * ## What this plugin does NOT do
 *
 *   - It does NOT intercept key events (observer only).
 *   - It does NOT implement raw-mode / alternate-screen / mouse /
 *     kitty-keyboard setup — those belong to the terminal provider
 *     (`createTermProvider`) that feeds ops *into* the chain.
 *   - It does NOT handle Ctrl+C / Ctrl+Z — see
 *     `runtime/lifecycle-effects.ts` for those.
 *
 * The separation matters: lifecycle-effects deals with keys that
 * *terminate* the app, while this plugin is a steady-state observer.
 */

import type { ApplyResult, Effect, Op } from "../types"
import type { BaseApp } from "./base-app"

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

/** Snapshot of the modifier state the terminal thinks is currently held. */
export interface ModifierState {
  readonly ctrl: boolean
  readonly shift: boolean
  readonly alt: boolean
  readonly meta: boolean
  readonly super: boolean
  readonly hyper: boolean
}

/** Store slice installed by {@link withTerminalChain}. */
export interface TerminalStore {
  /** Columns (from last resize or initial). */
  cols: number
  /** Rows. */
  rows: number
  /** Is the terminal focused right now (OSC 1004 focus reporting)? */
  focused: boolean
  /** Current modifier key state. */
  modifiers: ModifierState
}

// ---------------------------------------------------------------------------
// Op payload types (shared with the runner and with other plugins)
// ---------------------------------------------------------------------------

/**
 * Minimal key shape that withTerminalChain inspects on `input:key` ops.
 *
 * Deliberately structural (not imported from ag-term's `Key`) so this
 * package stays free of terminal imports. Any compatible shape works.
 */
export interface KeyShape {
  ctrl?: boolean
  shift?: boolean
  meta?: boolean
  super?: boolean
  hyper?: boolean
  alt?: boolean
  eventType?: "press" | "repeat" | "release" | undefined
}

/** Options accepted by {@link withTerminalChain}. */
export interface WithTerminalChainOptions {
  /** Initial columns. Default: 80. */
  cols?: number
  /** Initial rows. Default: 24. */
  rows?: number
  /** Initial focused state. Default: true. */
  focused?: boolean
}

// ---------------------------------------------------------------------------
// Plugin factory
// ---------------------------------------------------------------------------

/**
 * Install the terminal observer + lifecycle plugin.
 *
 * The returned app exposes the terminal slice at `app.terminal`.
 * Plugins upstream (last in `pipe()`) see ops first; this plugin
 * should go near the BASE of the chain so focused/useInput plugins
 * handle actual key content before the terminal observer peeks at
 * modifier state.
 */
export function withTerminalChain(
  options: WithTerminalChainOptions = {},
): <A extends BaseApp>(app: A) => A & { terminal: TerminalStore } {
  return <A extends BaseApp>(app: A): A & { terminal: TerminalStore } => {
    const store: TerminalStore = {
      cols: options.cols ?? 80,
      rows: options.rows ?? 24,
      focused: options.focused ?? true,
      modifiers: {
        ctrl: false,
        shift: false,
        alt: false,
        meta: false,
        super: false,
        hyper: false,
      },
    }
    const prev = app.apply
    app.apply = (op: Op): ApplyResult => {
      if (op.type === "input:key") {
        // Observer lane: peek the modifiers, never consume.
        const key = (op as { key?: KeyShape }).key
        if (key) {
          store.modifiers = {
            ctrl: !!key.ctrl,
            shift: !!key.shift,
            alt: !!key.alt || !!key.meta,
            meta: !!key.meta,
            super: !!key.super,
            hyper: !!key.hyper,
          }
        }
        return prev(op)
      }
      if (op.type === "term:resize") {
        const cols = (op as { cols?: number }).cols
        const rows = (op as { rows?: number }).rows
        if (typeof cols === "number") store.cols = cols
        if (typeof rows === "number") store.rows = rows
        const effects: Effect[] = [{ type: "render" }]
        // Chain downstream so anyone else (e.g. layout-aware plugins)
        // can also react.
        const downstream = prev(op)
        if (downstream !== false) effects.push(...downstream)
        return effects
      }
      if (op.type === "term:focus") {
        const focused = !!(op as { focused?: boolean }).focused
        store.focused = focused
        if (!focused) {
          // Clear sticky modifiers on blur so a stuck Ctrl from a
          // previous window doesn't bleed into the next session.
          store.modifiers = {
            ctrl: false,
            shift: false,
            alt: false,
            meta: false,
            super: false,
            hyper: false,
          }
        }
        return []
      }
      return prev(op)
    }
    return Object.assign(app, { terminal: store })
  }
}
