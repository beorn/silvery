/**
 * Silvery island host aggregator — derives protocol-mode requests from the
 * focused-subtree `<Island>` ancestors and returns a unified
 * {@link IslandProtocolModes} the host can enable.
 *
 * Replaces the legacy `silveryRun({ input: false, mouse: false,
 * focusReporting: false, selection: false })` flag spaghetti that callers
 * (termless `rec`) used to disable specific protocol modes — that pattern
 * couldn't compose with sub-app needs. The aggregator inverts the model:
 * islands DECLARE which modes they want via {@link IslandModesOwner}; the
 * host enables only what some focused-subtree island asks for.
 *
 * Behavior summary:
 *
 * - Walk from `focusedNode` UP to root.
 * - At each `silvery-island` AgNode, read `handle.modes.modes` (the
 *   IslandModesOwner's current request).
 * - OR-merge boolean modes (altScreen, bracketedPaste, kittyKeyboard,
 *   focusReporting); union-with-precedence mouse tracking; first-island-wins
 *   for cursor (there's only one cursor on screen).
 *
 * Phase 1 has no real consumers: no shipped app mounts an `<Island>`. The
 * aggregator returns `{}` and existing behavior is unchanged. Phase 3 (rec
 * adoption) is the first consumer.
 *
 * See bead `@km/silvery/15646-islands` — the host aggregator is what makes
 * islands compose with the existing app-level protocol-mode flags
 * (the eventual "fully island-driven" world replaces those flags entirely,
 * but Phase 1 ships side-by-side: legacy flags ∪ aggregated modes).
 */

import type { AgNode } from "@silvery/ag/types"
import type { IslandProtocolModes } from "@silvery/ag/island-types"

// ============================================================================
// Public API
// ============================================================================

/**
 * Derive the union of protocol modes requested by any `<Island>` on the
 * focus subtree (ancestor chain from `focusedNode` to root). Returns an
 * empty object when no focused-subtree island requests anything.
 *
 * The walk is intentionally upward-only — focus lives at a leaf; islands
 * that CONTAIN the focus are ancestors. Sibling islands of the focus
 * subtree do not contribute (they're not focused). This matches the v1
 * "synchronous focus severance" decision: only the focused-subtree island
 * has its modes enabled by the host.
 *
 * Cost: O(depth) where depth is the focus-to-root chain length. For typical
 * silvery apps this is <20. Hot path safe.
 */
export function deriveProtocolModesFromFocusSubtree(
  focusedNode: AgNode | null,
): IslandProtocolModes {
  const aggregated: IslandProtocolModes = {}
  if (!focusedNode) return aggregated
  let node: AgNode | null = focusedNode
  while (node !== null) {
    if (node.type === "silvery-island" && node.islandState?.handle?.modes) {
      mergeModes(aggregated, node.islandState.handle.modes.modes)
    }
    node = node.parent
  }
  return aggregated
}

// ============================================================================
// Merge helpers
// ============================================================================

/**
 * OR-merge protocol modes — any focused-subtree island wanting a mode ON
 * causes the host to enable it. Mouse tracking uses precedence (higher
 * granularity wins). Cursor is first-island-wins (only one cursor exists).
 */
function mergeModes(into: IslandProtocolModes, from: IslandProtocolModes): void {
  if (from.altScreen) into.altScreen = true
  if (from.bracketedPaste) into.bracketedPaste = true
  if (from.kittyKeyboard) into.kittyKeyboard = true
  if (from.focusReporting) into.focusReporting = true
  if (from.mouseTracking) {
    const current = into.mouseTracking
    if (
      !current ||
      mouseTrackingPrecedence(from.mouseTracking) > mouseTrackingPrecedence(current)
    ) {
      into.mouseTracking = from.mouseTracking
    }
  }
  if (from.cursor && !into.cursor) {
    // First-island-wins (focus-leaf-island; we walk leaf → root, so the
    // first cursor we see is the deepest = the actually-focused island).
    into.cursor = from.cursor
  }
}

const MOUSE_PRECEDENCE: Record<"off" | "click" | "drag" | "any", number> = {
  off: 0,
  click: 1,
  drag: 2,
  any: 3,
}

function mouseTrackingPrecedence(mode: "off" | "click" | "drag" | "any"): number {
  return MOUSE_PRECEDENCE[mode]
}
