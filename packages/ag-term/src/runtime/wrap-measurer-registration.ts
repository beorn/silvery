/**
 * Wrap-measurer registration for `@silvery/ag-term`.
 *
 * `@silvery/ag` exposes a process-level wrap-measurer registry
 * (`setWrapMeasurer` / `getWrapMeasurer`) so geometry helpers like
 * `computeSelectionFragments` can ask the active terminal runtime for
 * grapheme-correct soft-wrap slices. Without registration, the geometry
 * layer falls back to `\n`-only line splitting — fine for pure-framework
 * unit tests, wrong for real apps where a 60-char paragraph at width 20
 * needs to emit 3 fragments.
 *
 * **Registration shape (Option B per `hub/silvery/design/overlay-anchor-system.md`
 * § 8)**: terminal-side `wrapTextWithOffsets` adapts to the registry's
 * `wrapText(text, maxWidth) → readonly WrapSlice[]` contract. The slice
 * shape is structurally identical (`text` + `startOffset` + `endOffset`),
 * so the adapter is a passthrough — no allocation, no reformatting.
 *
 * **Lifecycle**: registration happens at module load — see the side-effect
 * call below. The adapter reads the active scoped measurer (terminal caps,
 * wide-emoji heuristics, text-sizing) at call time, so caps changes during
 * a session (e.g., post-DA1 width-detection toggling `maybeWideEmojis`)
 * are picked up automatically.
 *
 * **Test isolation**: tests that need the `\n`-only fallback (pure-`ag`
 * pathway) call `setWrapMeasurer(null)` in `beforeEach`/`afterEach` and
 * `restoreDefaultWrapMeasurer()` in `afterAll`. Tests that exercise the
 * registered path do nothing — the import-time side effect already wired
 * it up.
 *
 * **Multi-Term**: v1 is module-level singleton — see `@silvery/ag/wrap-measurer.ts`
 * file header for the upgrade path. Single Term-per-process is the
 * production reality; multi-Term scenarios are research / future work.
 *
 * Tracking: bead `km-silvery.softwrap-selection-fragments` (closes Phase
 * 4b deferred wrap-spanning).
 */

import {
  getWrapMeasurer,
  setWrapMeasurer,
  type WrapMeasurer,
  type WrapSlice,
} from "@silvery/ag/wrap-measurer"
import { wrapTextWithOffsets } from "../unicode"

/**
 * The terminal-runtime adapter — a thin passthrough that converts
 * `wrapTextWithOffsets`'s return type to `readonly WrapSlice[]`. The
 * shapes are identical so this is a re-tag, but going through a typed
 * conversion lets us tighten or widen either side without breaking the
 * other.
 */
const terminalWrapMeasurer: WrapMeasurer = {
  wrapText(text, maxWidth): readonly WrapSlice[] {
    return wrapTextWithOffsets(text, maxWidth)
  },
}

/**
 * Install the terminal-runtime wrap measurer into `@silvery/ag`'s registry.
 *
 * Reads the live registry (`getWrapMeasurer()`) — not a local boolean — to
 * decide whether to install. This makes the function safe to call after a
 * `setWrapMeasurer(null)` teardown that bypassed `uninstallTerminalWrapMeasurer`
 * (e.g. tests that drop the registration through `@silvery/ag`'s own API).
 *
 * Idempotent: when our adapter is already the registered measurer, this
 * is a no-op. When a foreign measurer is registered (rare — only seen if
 * a test or alternate runtime registered its own), this overwrites it
 * with our adapter, matching v1's "single Term-per-process" assumption.
 *
 * Called automatically at module load (see side-effect below); exported
 * for tests that want to re-arm after a `setWrapMeasurer(null)` teardown.
 */
export function installTerminalWrapMeasurer(): void {
  if (getWrapMeasurer() === terminalWrapMeasurer) return
  setWrapMeasurer(terminalWrapMeasurer)
}

/**
 * Reset registration when our adapter is the active measurer. After
 * calling this, the `@silvery/ag` registry is empty (`getWrapMeasurer()`
 * returns null) and `computeSelectionFragments` falls back to `\n`-only
 * splitting. Tests use this to exercise the fallback path; runtime
 * teardown uses it on Term dispose.
 *
 * No-op when a foreign measurer is registered — clearing it would surprise
 * whoever installed it. Call `setWrapMeasurer(null)` directly if the goal
 * is to clear unconditionally.
 */
export function uninstallTerminalWrapMeasurer(): void {
  if (getWrapMeasurer() !== terminalWrapMeasurer) return
  setWrapMeasurer(null)
}

/**
 * Test helper: restore the registry to its post-import-time default
 * state. Equivalent to `installTerminalWrapMeasurer()` but reads more
 * naturally in `afterEach` / `afterAll` blocks.
 */
export function restoreDefaultWrapMeasurer(): void {
  installTerminalWrapMeasurer()
}

/**
 * Read whether the terminal measurer is currently the active registration.
 * Sources truth from the live registry so a concurrent test that called
 * `setWrapMeasurer(null)` is observed correctly.
 */
export function isTerminalWrapMeasurerInstalled(): boolean {
  return getWrapMeasurer() === terminalWrapMeasurer
}

// =============================================================================
// Module-load side effect
// =============================================================================
//
// Importing `@silvery/ag-term` (anywhere — directly, transitively via
// `silvery/runtime`, via `@silvery/test`'s `createRenderer`) is the signal
// that the process wants terminal-grade wrap geometry. We register
// immediately so the very first `computeSelectionFragments` call sees the
// adapter — there's no race window where pre-runtime selections produce
// stale `\n`-only fragments and post-runtime selections produce
// soft-wrapped ones.
//
// This mirrors the convention already in place for the layout engine
// (`ensureDefaultLayoutEngine`) and `term.input` (single ownership): set
// the right thing up the moment the module loads, let teardown opt out.

installTerminalWrapMeasurer()
