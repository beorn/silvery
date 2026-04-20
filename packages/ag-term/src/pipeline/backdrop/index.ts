/**
 * Backdrop fade pass — mask → realize two-stage model.
 *
 * Runs AFTER the content + decoration phases, BEFORE the output phase. The
 * pipeline orchestrator (`ag.ts`) invokes `applyBackdrop(root, buffer,
 * options)`, which performs two independent stages:
 *
 *   1. `buildPlan(root, options)` — PURE, capability-independent tree
 *      walk. Collects `data-backdrop-fade` / `data-backdrop-fade-excluded`
 *      markers, enforces the single-amount invariant, resolves the scrim +
 *      default colors, and derives `plan.kittyEnabled` from
 *      `options.kittyGraphics` + scrim availability. See `./plan.ts`.
 *   2a. `realizeToBuffer(plan, buffer)` — cell-level transform over the
 *       plan's include/exclude rects. Mutates the buffer in place. Reads
 *       `plan.kittyEnabled` to decide the emoji branch. See
 *       `./realize-buffer.ts`.
 *   2b. `realizeToKitty(plan, buffer)` — emits the Kitty graphics escape
 *       sequence for emoji cells in the faded region. See
 *       `./realize-kitty.ts`.
 *
 * The split exists so each stage is independently testable and so
 * STRICT-mode diagnostics can compare plans + overlays across
 * fresh/incremental paths without re-walking the buffer.
 *
 * ## Incremental correctness
 *
 * The pass mutates the final buffer in place after the decoration phase. The
 * PRE-transform buffer is snapshotted and stored as `_prevBuffer` (see
 * `ag.ts`), so the next frame's incremental render clones pre-fade pixels
 * and re-fades them freshly. Because `buildPlan` is pure and the realizers
 * trust the plan, fresh and incremental paths produce identical
 * post-transform buffers — `SILVERY_STRICT=1` stays green.
 *
 * **STRICT overlay invariant**: `realizeToKitty` is a pure function of
 * `(plan, buffer)`. When the same tree is rendered via the fresh path and
 * the incremental path within a single frame, both produce byte-identical
 * Kitty overlay strings. STRICT mode compares these overlays alongside the
 * buffer (see `scheduler.ts`) — any drift signals a latent determinism bug
 * in marker collection or the emoji walk.
 *
 * ## Emoji vs wide-text cells
 *
 * Wide ≠ emoji. CJK / Hangul / Japanese fullwidth text occupies two columns
 * but responds to `fg` color normally — it goes through the standard mix
 * path. Only EMOJI (bitmap glyphs that ignore `fg`) need special handling,
 * detected via `isLikelyEmoji(cell.char)`. See `./realize-buffer.ts` for
 * the full text-vs-emoji decision table.
 *
 * ## Module layout
 *
 *   ./plan.ts          — stage 1: buildPlan, Plan / PlanRect shapes,
 *                         marker collection, single-amount invariant
 *   ./realize-buffer.ts — stage 2a: cell-level buffer transform
 *   ./realize-kitty.ts  — stage 2b: Kitty overlay emission
 *   ./region.ts        — shared include/exclude region walker (Uint8Array
 *                         dedup, deterministic iteration order)
 *   ./color.ts         — hex↔rgb adapter, normalizeHex, HexColor brand type
 *   ./color-compat.ts  — upstream-with-fallback shim for mixSrgb /
 *                         deemphasizeOklch[Toward]; prefers @silvery/color
 *                         exports, falls back to local copies during
 *                         publish-cycle lag
 *   ./index.ts         — this file: applyBackdrop orchestrator + barrel
 */

import {
  CURSOR_RESTORE,
  CURSOR_SAVE,
  kittyDeleteAllScrimPlacements,
} from "@silvery/ansi"
import type { AgNode } from "@silvery/ag/types"
import type { TerminalBuffer } from "../../buffer"
import { buildPlan, type BackdropOptions } from "./plan"
import { realizeToBuffer } from "./realize-buffer"
import { realizeToKitty } from "./realize-kitty"

// Public re-exports — callers import from `./pipeline/backdrop` (the barrel
// below) or from `./pipeline` (which re-re-exports).
export {
  buildPlan,
  DEFAULT_AMOUNT,
  hasBackdropMarkers,
  INACTIVE_PLAN,
  type BackdropOptions,
  type ColorLevel,
  type Plan,
  type PlanRect,
} from "./plan"
export { type HexColor, normalizeHex } from "./color"
export { deemphasizeOklch, deemphasizeOklchToward, mixSrgb } from "./color-compat"
export { forEachFadeRegionCell } from "./region"
export { realizeToBuffer } from "./realize-buffer"
export { realizeToKitty } from "./realize-kitty"

/**
 * Result of `applyBackdrop`.
 *
 * - `modified` — true when at least one buffer cell was mutated by the
 *   pass. STRICT mode compares buffers — this is the narrow "did we
 *   mutate the buffer" signal.
 * - `overlay` — out-of-band ANSI escapes appended after the normal output
 *   phase diff. Non-empty whenever Kitty graphics are enabled AND a
 *   backdrop is active (includes a delete-all-placements command so
 *   last-frame scrims get cleared even if this frame has no wide cells),
 *   or when Kitty is enabled and the backdrop is INACTIVE this frame (the
 *   orchestrator emits `CURSOR_SAVE + kittyDeleteAllScrimPlacements() +
 *   CURSOR_RESTORE` so stale placements from a prior active frame are
 *   cleaned up even when stage 2a and 2b short-circuit).
 *
 * Callers gating on "did anything change visually" compute
 * `modified || overlay.length > 0` at the call site — no pre-computed
 * derived field lives on the result.
 */
export interface BackdropResult {
  /** True when at least one buffer cell was mutated by the pass. */
  readonly modified: boolean
  /**
   * Out-of-band ANSI escapes appended after the normal output phase diff.
   * See the interface docblock for when this is non-empty.
   */
  readonly overlay: string
}

const EMPTY_RESULT: BackdropResult = Object.freeze({
  modified: false,
  overlay: "",
})

/**
 * Cached "Kitty inactive-frame cleanup" overlay. Emitted when Kitty
 * graphics are enabled but the backdrop is inactive this frame so any
 * stale scrim placements from the previous frame are cleared. Kept as a
 * module-level constant so repeated inactive frames don't rebuild the
 * same string.
 */
const KITTY_CLEANUP_OVERLAY: string =
  CURSOR_SAVE + kittyDeleteAllScrimPlacements() + CURSOR_RESTORE

/**
 * Apply backdrop-fade to the buffer based on tree markers.
 *
 * Thin orchestrator over the mask → realize stages:
 *
 *   plan = buildPlan(root, options)
 *   modified = realizeToBuffer(plan, buffer)
 *   overlay = plan.kittyEnabled ? realizeToKitty(plan, buffer) : ""
 *
 * Returns a `BackdropResult`:
 * - `modified` — any buffer cells changed.
 * - `overlay` — out-of-band ANSI escapes. Non-empty when Kitty graphics
 *   are enabled (regardless of whether the plan is active):
 *     - Plan active: contains at minimum a scrim-clear command so last-frame
 *       placements get erased even if this frame has no wide cells.
 *     - Plan inactive: contains a cursor-save/delete-all/cursor-restore
 *       sequence so stale placements from a prior active frame are cleaned
 *       up. Without this, leftover scrim rectangles persist on screen when
 *       the backdrop deactivates.
 *
 * Because the overlay self-cleans on deactivation, the higher-level
 * `_kittyActive` tracker in `ag.ts` is redundant for this module. It is
 * intentionally left in place (out of scope for this pass); future cleanup
 * can delete it once the renderer-level tracker is also removed.
 */
export function applyBackdrop(
  root: AgNode,
  buffer: TerminalBuffer,
  options?: BackdropOptions,
): BackdropResult {
  const plan = buildPlan(root, options)

  // Stage 1 diagnostics: surface the mixed-amounts warning at the orchestrator
  // so `buildPlan` can remain a pure function of its inputs. The warning
  // fires in dev/test only — production suppresses via NODE_ENV.
  if (plan.mixedAmounts && process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn(
      `[silvery:backdrop] multiple fade amounts in one frame (using ${plan.amount}); ` +
        `Kitty overlay will use the first observed amount. See plan.ts / assertSingleAmount.`,
    )
  }

  if (!plan.active) {
    // Kitty cleanup path: even when the plan is inactive this frame, if the
    // caller has Kitty graphics enabled we must emit the delete-all so any
    // scrim placements from a prior active frame are cleared. Without this,
    // the orphan rectangles persist on screen after the backdrop turns off.
    if (options?.kittyGraphics === true) {
      return {
        modified: false,
        overlay: KITTY_CLEANUP_OVERLAY,
      }
    }
    return EMPTY_RESULT
  }

  const modified = realizeToBuffer(plan, buffer)

  // Kitty overlay. Always emitted when plan.kittyEnabled (even if no emoji
  // this frame) so last-frame placements get cleared by the delete-all at
  // the head of the overlay string.
  const overlay = plan.kittyEnabled ? realizeToKitty(plan, buffer) : ""

  return { modified, overlay }
}
