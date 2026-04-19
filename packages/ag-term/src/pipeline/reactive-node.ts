/**
 * Reactive Node State — alien-signals wrappers for cascade derivations.
 *
 * E+ Phase 2: Replace manual cascade formula computation with reactive
 * computeds. The cascade-predicates.ts `computeCascade()` function is the
 * oracle — this module must produce identical outputs.
 *
 * Incremental approach:
 *   1. Writable signals mirror epoch-stamped dirty flags
 *   2. Computeds derive cascade outputs (isDirty, contentAreaAffected, etc.)
 *   3. `syncToSignals()` bridges epoch flags → signals at render-phase entry
 *   4. Dev-mode assertions verify reactive === oracle
 *
 * alien-signals computeds are lazy (pull-based): reading a computed re-evaluates
 * only if a dependency changed. No batching needed for correctness — the
 * reconciler's synchronous commit writes epoch stamps, and the render phase
 * reads computeds after all commits are done.
 */

import { signal, computed } from "@silvery/signals"
import type { AgNode } from "@silvery/ag/types"
import {
  isDirty,
  CONTENT_BIT,
  STYLE_PROPS_BIT,
  BG_BIT,
  CHILDREN_BIT,
  SUBTREE_BIT,
} from "@silvery/ag/epoch"
import { computeCascade, type CascadeInputs, type CascadeOutputs } from "./cascade-predicates.ts"

// ============================================================================
// Types
// ============================================================================

/**
 * Writable signal — call with no args to read, call with value to write.
 * Type alias for clarity (alien-signals returns this shape from `signal()`).
 */
type Signal<T> = {
  (): T
  (value: T): void
}

/** Read-only computed — call with no args to read. */
type Computed<T> = () => T

/**
 * Per-node reactive state that lives alongside an AgNode.
 *
 * Writable signals are synced from epoch-stamped flags before each render pass.
 * Computed derivations automatically recompute when inputs change.
 */
export interface ReactiveNodeState {
  // --- Writable signals (synced from epoch flags) ---
  readonly contentDirty: Signal<boolean>
  readonly stylePropsDirty: Signal<boolean>
  readonly bgDirty: Signal<boolean>
  readonly childrenDirty: Signal<boolean>
  readonly subtreeDirty: Signal<boolean>
  readonly layoutChanged: Signal<boolean>

  // --- Context signals (set per-node during tree traversal) ---
  readonly hasPrevBuffer: Signal<boolean>
  readonly childPositionChanged: Signal<boolean>
  readonly ancestorLayoutChanged: Signal<boolean>
  readonly ancestorCleared: Signal<boolean>
  readonly isTextNode: Signal<boolean>
  readonly hasBgColor: Signal<boolean>
  readonly absoluteChildMutated: Signal<boolean>
  readonly descendantOverflowChanged: Signal<boolean>

  // --- Computed derivations ---
  readonly canSkipEntireSubtree: Computed<boolean>
  readonly textPaintDirty: Computed<boolean>
  readonly contentAreaAffected: Computed<boolean>
  readonly bgRefillNeeded: Computed<boolean>
  readonly contentRegionCleared: Computed<boolean>
  readonly skipBgFill: Computed<boolean>
  readonly childrenNeedFreshRender: Computed<boolean>
  readonly bgOnlyChange: Computed<boolean>
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a reactive state wrapper for a node.
 *
 * The computed formulas exactly replicate cascade-predicates.ts `computeCascade()`.
 * They are NOT a replacement — the oracle function remains authoritative.
 * In dev mode, assertions verify equivalence.
 */
export function createReactiveNodeState(): ReactiveNodeState {
  // Writable signals — all start false, synced before each render pass
  const contentDirty = signal(false)
  const stylePropsDirty = signal(false)
  const bgDirty = signal(false)
  const childrenDirty = signal(false)
  const subtreeDirty = signal(false)
  const layoutChanged = signal(false)

  // Context signals — set per-node during tree traversal
  const hasPrevBuffer = signal(false)
  const childPositionChanged = signal(false)
  const ancestorLayoutChanged = signal(false)
  const ancestorCleared = signal(false)
  const isTextNode = signal(false)
  const hasBgColor = signal(false)
  const absoluteChildMutated = signal(false)
  const descendantOverflowChanged = signal(false)

  // --- Computed derivations (formulas from cascade-predicates.ts) ---

  const canSkipEntireSubtree = computed(
    () =>
      hasPrevBuffer() &&
      !contentDirty() &&
      !stylePropsDirty() &&
      !layoutChanged() &&
      !subtreeDirty() &&
      !childrenDirty() &&
      !childPositionChanged() &&
      !ancestorLayoutChanged(),
  )

  const textPaintDirty = computed(() => isTextNode() && stylePropsDirty())

  const contentAreaAffected = computed(
    () =>
      contentDirty() ||
      layoutChanged() ||
      childPositionChanged() ||
      childrenDirty() ||
      bgDirty() ||
      textPaintDirty() ||
      absoluteChildMutated() ||
      descendantOverflowChanged(),
  )

  // DISABLED: bgOnlyChange fast path causes incremental rendering mismatches.
  // Matches cascade-predicates.ts which hardcodes `false`.
  const bgOnlyChange = computed(() => false)

  const bgRefillNeeded = computed(
    () => hasPrevBuffer() && !contentAreaAffected() && subtreeDirty() && hasBgColor(),
  )

  const contentRegionCleared = computed(
    () => (hasPrevBuffer() || ancestorCleared()) && contentAreaAffected() && !hasBgColor(),
  )

  const skipBgFill = computed(
    () => hasPrevBuffer() && !ancestorCleared() && !contentAreaAffected() && !bgRefillNeeded(),
  )

  const childrenNeedFreshRender = computed(
    () =>
      (hasPrevBuffer() || ancestorCleared()) &&
      (contentAreaAffected() || bgRefillNeeded()) &&
      !bgOnlyChange(),
  )

  return {
    contentDirty,
    stylePropsDirty,
    bgDirty,
    childrenDirty,
    subtreeDirty,
    layoutChanged,
    hasPrevBuffer,
    childPositionChanged,
    ancestorLayoutChanged,
    ancestorCleared,
    isTextNode,
    hasBgColor,
    absoluteChildMutated,
    descendantOverflowChanged,
    canSkipEntireSubtree,
    textPaintDirty,
    contentAreaAffected,
    bgRefillNeeded,
    contentRegionCleared,
    skipBgFill,
    childrenNeedFreshRender,
    bgOnlyChange,
  }
}

// ============================================================================
// Sync: Epoch flags → Signals
// ============================================================================

/**
 * Sync a node's epoch-stamped dirty flags into the reactive signals.
 *
 * Called once per node at the start of renderNodeToBuffer, BEFORE reading
 * any computed. Context-dependent inputs (hasPrevBuffer, ancestorCleared, etc.)
 * are also set here since they vary per tree-traversal position.
 */
export function syncToSignals(
  state: ReactiveNodeState,
  node: AgNode,
  ctx: {
    hasPrevBuffer: boolean
    layoutChanged: boolean
    childPositionChanged: boolean
    ancestorLayoutChanged: boolean
    ancestorCleared: boolean
    absoluteChildMutated: boolean
    descendantOverflowChanged: boolean
    hasBgColor: boolean
  },
): void {
  // Sync epoch flags → boolean signals
  state.contentDirty(isDirty(node.dirtyBits, node.dirtyEpoch, CONTENT_BIT))
  state.stylePropsDirty(isDirty(node.dirtyBits, node.dirtyEpoch, STYLE_PROPS_BIT))
  state.bgDirty(isDirty(node.dirtyBits, node.dirtyEpoch, BG_BIT))
  state.childrenDirty(isDirty(node.dirtyBits, node.dirtyEpoch, CHILDREN_BIT))
  state.subtreeDirty(isDirty(node.dirtyBits, node.dirtyEpoch, SUBTREE_BIT))
  state.layoutChanged(ctx.layoutChanged)

  // Sync context-dependent inputs
  state.hasPrevBuffer(ctx.hasPrevBuffer)
  state.childPositionChanged(ctx.childPositionChanged)
  state.ancestorLayoutChanged(ctx.ancestorLayoutChanged)
  state.ancestorCleared(ctx.ancestorCleared)
  state.isTextNode(node.type === "silvery-text")
  state.hasBgColor(ctx.hasBgColor)
  state.absoluteChildMutated(ctx.absoluteChildMutated)
  state.descendantOverflowChanged(ctx.descendantOverflowChanged)
}

// ============================================================================
// Reactive-driven cascade (replaces computeCascade for production)
// ============================================================================

/**
 * Read all cascade outputs from the reactive computeds.
 * Call AFTER `syncToSignals()`. Returns the same CascadeOutputs shape
 * as `computeCascade()` but derived from the signal graph.
 */
export function readReactiveCascade(state: ReactiveNodeState): CascadeOutputs {
  return {
    canSkipEntireSubtree: state.canSkipEntireSubtree(),
    contentAreaAffected: state.contentAreaAffected(),
    bgRefillNeeded: state.bgRefillNeeded(),
    contentRegionCleared: state.contentRegionCleared(),
    skipBgFill: state.skipBgFill(),
    childrenNeedFreshRender: state.childrenNeedFreshRender(),
    bgOnlyChange: state.bgOnlyChange(),
  }
}

// ============================================================================
// Oracle Verification
// ============================================================================

/**
 * Verify that reactive computeds match the cascade oracle.
 *
 * Call in dev mode (SILVERY_STRICT=1) after syncToSignals + computeCascade.
 * Throws on mismatch with a detailed diff.
 */
export function assertReactiveMatchesOracle(
  state: ReactiveNodeState,
  oracle: CascadeOutputs,
  nodeId: string,
): void {
  const fields: (keyof CascadeOutputs)[] = [
    "canSkipEntireSubtree",
    "contentAreaAffected",
    "bgRefillNeeded",
    "contentRegionCleared",
    "skipBgFill",
    "childrenNeedFreshRender",
    "bgOnlyChange",
  ]

  const mismatches: string[] = []
  for (const field of fields) {
    const reactiveValue = state[field]()
    const oracleValue = oracle[field]
    if (reactiveValue !== oracleValue) {
      mismatches.push(`  ${field}: reactive=${reactiveValue}, oracle=${oracleValue}`)
    }
  }

  if (mismatches.length > 0) {
    throw new Error(
      `ReactiveNodeState mismatch for ${nodeId || "(unnamed)"}:\n${mismatches.join("\n")}`,
    )
  }
}

// ============================================================================
// Node State Cache
// ============================================================================

/**
 * WeakMap from AgNode to its reactive state.
 *
 * Lazily created on first access. Automatically garbage-collected when the
 * node is removed from the tree (WeakMap semantics).
 */
const nodeStates = new WeakMap<AgNode, ReactiveNodeState>()

/**
 * Get or create the reactive state for a node.
 *
 * Uses a WeakMap so states are automatically cleaned up when nodes are GC'd.
 */
export function getReactiveState(node: AgNode): ReactiveNodeState {
  let state = nodeStates.get(node)
  if (!state) {
    state = createReactiveNodeState()
    nodeStates.set(node, state)
  }
  return state
}
