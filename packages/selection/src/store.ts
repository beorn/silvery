/**
 * createSelection — Reactive selection store.
 *
 * ONE state atom. All reads are computed signals. All writes go through
 * apply* pure functions from apply.ts. No-op check: if apply returns same
 * ref, skip signal write (no notifications).
 *
 * Drag: during drag, reads show preview (computed from startState + operations).
 * On end, preview becomes committed. On cancel, revert to startState.
 */

import { computed, signal, startBatch, endBatch } from "@silvery/signals"
import {
  applyCollapse,
  applyDeselect,
  applyExtend,
  applyExitSub,
  applyReconcile,
  applyRemove,
  applyRootUp,
  applySelect,
  applySelectAll,
  applySetRoot,
  applyTextEdit,
  applyTextSelect,
  EMPTY_STATE,
} from "./apply.ts"
import { transformSelection } from "./transform.ts"
import type { SelectionTree, TreeOp } from "./transform.ts"
import { createOrderedSet, EMPTY_ORDERED_SET } from "./ordered-set.ts"
import type { OrderedSet } from "./ordered-set.ts"
import { createTextAccessor } from "./sub-text.ts"
import type {
  DefaultSubSelection,
  DragState,
  ID,
  PressHit,
  PointerOrigin,
  SelectionApp,
  SelectionKind,
  SelectionSnapshot,
  SubSelectionBase,
} from "./types.ts"

// --- Internal state ---

type StoreState<Sub> = {
  readonly committed: SelectionSnapshot<Sub>
  readonly drag: DragState<Sub> | null
}

// --- Store interface ---

export type NodeAccessor = {
  /** Computed: current cursor node ID */
  readonly cursor: () => ID | null
  /** Computed: current anchor node ID */
  readonly anchor: () => ID | null
  /** Computed: selected node IDs as an OrderedSet */
  readonly ids: () => OrderedSet<ID>
  /** Replace or toggle selection */
  select(ids: readonly ID[], toggle?: boolean): void
  /** Extend range from anchor to cursor */
  extend(cursor: ID): void
  /** Collapse multi-selection to cursor only */
  collapse(): void
  /** Remove a single ID from selection */
  remove(id: ID): void
  /** Walk up tree from id to find first selectable ancestor in current walkOrder */
  selectableAncestor(id: ID): ID | undefined
}

export type RootAccessor = {
  /** Computed: current root ID */
  readonly id: () => ID | null
  /** Set root to a specific ID */
  set(id: ID | null): void
  /** Pop root to parent */
  up(): void
}

export type DragAccessor<Sub = DefaultSubSelection> = {
  /** Computed: current drag state, or null */
  (): DragState<Sub> | null
  /** Start a drag gesture */
  start(hit: PressHit, origin: PointerOrigin): void
  /** End drag — commit preview to committed state */
  end(): void
  /** Cancel drag — revert to pre-drag state */
  cancel(): void
}

export type SelectionStore<Sub = DefaultSubSelection> = {
  /** Node-level selection accessor */
  readonly node: NodeAccessor
  /** Sub-selection read/write (writable signal) */
  sub: Sub | null
  /** Sub-selection getter (for computed reads) */
  readonly subComputed: () => Sub | null
  /** Text sub-selection accessor */
  readonly text: ReturnType<typeof createTextAccessor>
  /** Drag accessor */
  readonly drag: DragAccessor<Sub>
  /** Root accessor */
  readonly root: RootAccessor
  /** Computed: current selection kind */
  readonly kind: () => SelectionKind
  /** Deselect everything */
  deselect(): void
  /** Select all nodes at a given level */
  selectAll(parent?: ID | null): void
  /** Read the full effective snapshot (committed or drag preview) */
  readonly snapshot: () => SelectionSnapshot<Sub>
  /** Reconcile selection against current valid nodes */
  reconcile(): void
  /**
   * Transform selection inline with a tree mutation (SlateJS pattern).
   *
   * Call this AFTER mutating the tree but with both pre- and post- snapshots
   * available. The selection is repaired atomically: deleted IDs are removed,
   * cursor/anchor are repaired to the nearest surviving node, sub-selection
   * referencing deleted/moved nodes is cleared, and remaining IDs are
   * re-ordered to match the new tree walk order.
   *
   * Usage pattern:
   * ```ts
   * const prevTree = captureTreeSnapshot(repo)
   * repo.deleteNode(id)
   * sel.transform({ type: "deleteNode", id }, prevTree, currentTree)
   * ```
   *
   * Eliminates the need for manual cursor reconciliation in action handlers
   * (e.g. computing "next sibling" before delete). The transform handles
   * cursor repair, multi-selection survivors, and sub-selection cleanup
   * in a single atomic operation.
   *
   * Status: foundation API. Migration from manual reconciliation is
   * incremental — see km-tui.inline-transform-selection.
   */
  transform(op: TreeOp, prevTree: SelectionTree, nextTree: SelectionTree): void
}

// --- Factory ---

export type SelectionOptions = {
  /** Initial cursor node ID — set before first reconcile. */
  initialCursor?: ID
  /** Initial root ID — scopes walk order. */
  initialRoot?: ID | null
}

export function createSelection<Sub extends SubSelectionBase = DefaultSubSelection>(
  app: SelectionApp,
  options?: SelectionOptions,
): SelectionStore<Sub> {
  // ONE state atom — seed with initial cursor/root if provided
  const initialState: SelectionSnapshot<Sub> = options?.initialCursor
    ? {
        cursor: options.initialCursor,
        anchor: options.initialCursor,
        ids: [options.initialCursor],
        sub: null,
        root: options?.initialRoot ?? null,
      }
    : options?.initialRoot !== undefined
      ? ({ ...EMPTY_STATE, root: options.initialRoot } as SelectionSnapshot<Sub>)
      : (EMPTY_STATE as SelectionSnapshot<Sub>)

  const $state = signal<StoreState<Sub>>({
    committed: initialState,
    drag: null,
  })

  // --- Helpers ---

  /**
   * Lazy tree-walk order. Only computed for operations that genuinely need
   * it (range extend, reconcile, select-all at root). The hot path —
   * store.node.select() — never calls this.
   */
  function getWalkOrder(): readonly ID[] {
    return app.tree.walkOrder($state().committed.root)
  }

  /** O(1) existence check for validating single IDs. */
  function contains(id: ID): boolean {
    return app.tree.contains(id)
  }

  /** Apply a pure transition, write if changed */
  function apply(fn: (snap: SelectionSnapshot<Sub>) => SelectionSnapshot<Sub>): void {
    const s = $state()
    const next = fn(s.committed)
    if (next !== s.committed) {
      $state({ committed: next, drag: s.drag })
    }
  }

  // --- Computed signals ---

  const $effective = computed<SelectionSnapshot<Sub>>(() => {
    const s = $state()
    // During drag, the committed state IS the preview — drag operations
    // write directly to committed. startState is kept for cancel.
    return s.committed
  })

  const $cursor = computed<ID | null>(() => $effective().cursor)
  const $anchor = computed<ID | null>(() => $effective().anchor)
  const $ids = computed<OrderedSet<ID>>(() => {
    const ids = $effective().ids
    if (ids.length === 0) return EMPTY_ORDERED_SET as OrderedSet<ID>
    return createOrderedSet(ids)
  })
  const $sub = computed<Sub | null>(() => $effective().sub)
  const $root = computed<ID | null>(() => $effective().root)

  const $kind = computed<SelectionKind>(() => {
    const snap = $effective()
    if (snap.cursor === null) return "idle"
    if (snap.sub !== null) return (snap.sub as SubSelectionBase).kind as SelectionKind
    return "node"
  })

  const $drag = computed<DragState<Sub> | null>(() => $state().drag)

  // --- Node accessor ---

  const node: NodeAccessor = {
    cursor: $cursor,
    anchor: $anchor,
    ids: $ids,

    select(ids: readonly ID[], toggle?: boolean): void {
      // O(ids.length) — no tree walk. `contains` is the hot path: on 500k-node
      // vaults the old walkOrder filter blocked the main thread for 3s per
      // keystroke. See km-silvery.selection-contains.
      apply((snap) => applySelect(snap, ids, contains, toggle))
    },

    extend(cursor: ID): void {
      // Range semantics genuinely need walk order. extend() fires once per
      // user action (not per render), so paying O(visible) here is fine.
      const order = getWalkOrder()
      apply((snap) => applyExtend(snap, cursor, order))
    },

    collapse(): void {
      apply((snap) => applyCollapse(snap))
    },

    remove(id: ID): void {
      // Single-id remove doesn't need walk order — applyRemove falls back to
      // "first remaining" when nodeOrder is omitted.
      apply((snap) => applyRemove(snap, id))
    },

    selectableAncestor(id: ID): ID | undefined {
      // O(depth) walk up the parent chain, checking existence with contains.
      // Replaces the old O(visible) walkOrder + Set construction.
      let current: ID | undefined = id
      while (current !== undefined) {
        if (contains(current)) return current
        current = app.tree.parent(current)
      }
      return undefined
    },
  }

  // --- Root accessor ---

  const rootAccessor: RootAccessor = {
    id: $root,

    set(id: ID | null): void {
      apply((snap) => applySetRoot(snap, id))
    },

    up(): void {
      apply((snap) => applyRootUp(snap, (id) => app.tree.parent(id) ?? null))
    },
  }

  // --- Drag accessor ---

  function dragRead(): DragState<Sub> | null {
    return $drag()
  }

  dragRead.start = function start(hit: PressHit, origin: PointerOrigin): void {
    const s = $state()
    $state({
      committed: s.committed,
      drag: { hit, origin, startState: s.committed },
    })
  }

  dragRead.end = function end(): void {
    const s = $state()
    if (s.drag === null) return
    // committed already has the preview state — just clear drag
    $state({ committed: s.committed, drag: null })
  }

  dragRead.cancel = function cancel(): void {
    const s = $state()
    if (s.drag === null) return
    // Revert committed to pre-drag state
    $state({ committed: s.drag.startState, drag: null })
  }

  // --- Sub-selection helpers ---

  function exitSub(): void {
    apply((snap) => applyExitSub(snap))
  }

  // --- Sub-selection r/w ---

  function writeSub(value: Sub | null): void {
    if (value === null) {
      exitSub()
    } else {
      // Write sub directly
      const s = $state()
      const snap = s.committed
      if (snap.sub === value) return
      $state({
        committed: {
          cursor: snap.cursor,
          anchor: snap.anchor,
          ids: snap.ids,
          sub: value,
          root: snap.root,
        },
        drag: s.drag,
      })
    }
  }

  // --- Sub-selection accessors ---

  // Cast $sub for built-in accessors — they filter by kind and are safe with any SubSelectionBase
  const $subAny = $sub as () => DefaultSubSelection | null

  const textAccessor = createTextAccessor(
    $subAny,
    (nodeId, offset) => {
      startBatch()
      try {
        // Ensure the node is selected
        const ancestor = node.selectableAncestor(nodeId)
        if (ancestor !== undefined) {
          const ids = $ids()
          if (!ids.has(ancestor)) {
            node.select([ancestor])
          }
        }
        // Enter text mode
        apply((snap) => applyTextEdit(snap, nodeId, offset))
      } finally {
        endBatch()
      }
    },
    (cursor, anchor) => {
      apply((snap) => applyTextSelect(snap, cursor, anchor))
    },
    () => {
      exitSub()
    },
  )

  // --- Store object ---

  const store: SelectionStore<Sub> = {
    node,

    get sub(): Sub | null {
      return $sub()
    },
    set sub(value: Sub | null) {
      writeSub(value)
    },
    subComputed: $sub,

    text: textAccessor,
    drag: dragRead as DragAccessor<Sub>,
    root: rootAccessor,
    kind: $kind,

    deselect(): void {
      apply((snap) => applyDeselect(snap))
    },

    selectAll(parent?: ID | null): void {
      const parentId = parent ?? $root()
      const children = parentId !== null ? app.tree.children(parentId) : getWalkOrder()
      apply((snap) => applySelectAll(snap, parentId ?? null, children))
    },

    snapshot: $effective,

    reconcile(): void {
      const order = getWalkOrder()
      const validSet = new Set(order)
      // applyReconcile needs Sub extends SubSelectionBase — safe since our constraint guarantees it
      apply((snap) =>
        applyReconcile(snap as SelectionSnapshot<Sub & SubSelectionBase>, validSet, order),
      )
    },

    transform(op: TreeOp, prevTree: SelectionTree, nextTree: SelectionTree): void {
      // Inline atomic transform — repairs cursor/anchor/ids/sub in one apply()
      apply((snap) => transformSelection(snap, op, prevTree, nextTree))
    },
  }

  return store
}
