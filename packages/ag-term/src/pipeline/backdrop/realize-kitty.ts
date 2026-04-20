/**
 * Backdrop fade — stage 2b: emit the Kitty graphics overlay for the plan.
 *
 * The output always begins with `CURSOR_SAVE + kittyDeleteAllScrimPlacements()
 * + CURSOR_RESTORE` when `plan.active` is true — even when zero emoji cells
 * fall inside the faded region this frame. The unconditional clear is what
 * erases stale placements from a previous frame (e.g., a modal that covered
 * an emoji in frame N, then moved in frame N+1). Without it, orphan scrim
 * rectangles persist on screen.
 *
 * ### STRICT determinism invariant
 *
 * For a given `(plan, buffer)` pair, this function produces a byte-identical
 * string on every invocation. STRICT mode compares the overlay across
 * fresh and incremental paths to catch latent non-determinism in marker
 * collection order, emoji walk ordering, or placement ID derivation. The
 * shared `forEachFadeRegionCell` walker provides the stable row-ascending,
 * col-ascending iteration order.
 *
 * @see ./plan.ts for the FadePlan shape and color model.
 * @see ./realize-buffer.ts for the complementary cell-level transform.
 * @see ./region.ts for the shared include/exclude walker.
 */

import {
  backdropPlacementId,
  buildScrimPixels,
  cupTo,
  CURSOR_RESTORE,
  CURSOR_SAVE,
  kittyDeleteAllScrimPlacements,
  kittyPlaceAt,
  kittyUploadScrimImage,
} from "@silvery/ansi"
import type { TerminalBuffer } from "../../buffer"
import { isLikelyEmoji } from "../../unicode"
import { hexToRgb } from "./color"
import type { FadePlan } from "./plan"
import { forEachFadeRegionCell } from "./region"

/**
 * Stage 2b — emit the Kitty graphics overlay for the plan.
 *
 * The output always begins with `CURSOR_SAVE + kittyDeleteAllScrimPlacements()
 * + CURSOR_RESTORE` when `plan.active` is true — even when zero emoji cells
 * fall inside the faded region this frame. The unconditional clear is what
 * erases stale placements from a previous frame.
 *
 * Returns `""` when `plan.active` is false. Callers that also need to
 * suppress the overlay because Kitty graphics are not available should NOT
 * call this function at all — the ag-term orchestrator guards the call site
 * with its own `kittyEnabled` flag.
 */
export function realizeFadePlanToKittyOverlay(plan: FadePlan, buffer: TerminalBuffer): string {
  if (!plan.active) return ""

  const cells = collectEmojiCellsInFadeRegion(buffer, plan)

  // Tint the scrim with the same color used for cell mixing (pure black /
  // white by theme luminance, or an app-supplied custom scrim). Fallback
  // to pure black.
  const tintHex = plan.scrim ?? plan.defaultBg ?? "#000000"
  const tint = hexToRgb(tintHex) ?? { r: 0, g: 0, b: 0 }
  const scrimAlpha = Math.max(0, Math.min(255, Math.round(plan.amount * 255)))

  const parts: string[] = []
  parts.push(CURSOR_SAVE)

  if (cells.length === 0) {
    // No wide cells to cover this frame, but we must still clear any
    // placements left over from a prior frame where there were some.
    parts.push(kittyDeleteAllScrimPlacements())
    parts.push(CURSOR_RESTORE)
    return parts.join("")
  }

  const pixels = buildScrimPixels(tint, scrimAlpha)
  parts.push(kittyUploadScrimImage(pixels, 2, 2))
  parts.push(kittyDeleteAllScrimPlacements())

  for (const { x, y } of cells) {
    parts.push(cupTo(x, y))
    parts.push(
      kittyPlaceAt({
        placementId: backdropPlacementId(x, y),
        cols: 2,
        rows: 1,
        z: 1,
      }),
    )
  }
  parts.push(CURSOR_RESTORE)
  return parts.join("")
}

/**
 * Collect the coordinates of every EMOJI lead cell inside the plan's faded
 * region. CJK and other wide TEXT cells are excluded — they respond to fg
 * color mixing like normal text and don't need the Kitty overlay. Only
 * bitmap-glyph cells (detected via `isLikelyEmoji(cell.char)`) need an
 * overlay because their rendering ignores the fg color.
 *
 * The iteration order is deterministic (delegated to
 * `forEachFadeRegionCell`), matching the buffer realizer's order. STRICT
 * mode compares the overlay string across fresh and incremental paths —
 * any drift in this order would fail the comparison.
 */
function collectEmojiCellsInFadeRegion(
  buffer: TerminalBuffer,
  plan: FadePlan,
): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = []
  forEachFadeRegionCell(buffer.width, buffer.height, plan.includes, plan.excludes, (x, y) => {
    if (x + 1 >= buffer.width) return // no room for continuation
    if (!buffer.isCellWide(x, y)) return
    if (buffer.isCellContinuation(x, y)) return
    const cell = buffer.getCell(x, y)
    if (!isLikelyEmoji(cell.char ?? "")) return
    out.push({ x, y })
  })
  return out
}
