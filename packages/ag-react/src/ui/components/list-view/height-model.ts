/**
 * HeightModel — canonical predicted-height source for variable-height lists.
 *
 * Backed by a Fenwick (binary-indexed) tree for O(log n) point updates and
 * O(log n) prefix-sum queries. Replaces the ad-hoc `sumHeights()` callsites
 * + `totalRowsStable` / `totalRowsMeasured` / `rowsAboveViewport` triplets
 * that have grown organically inside `ListView.tsx` and now disagree with
 * each other depending on which scroll-related fix touched them last.
 *
 * Phase 1 (this file) — scaffolding + tests, no consumers wired up.
 *
 * Phase 2 (separate bead `km-silvery.listview-heightmodel-unify` follow-up)
 * replaces `totalRowsStable`, `totalRowsMeasured`, and the `sumHeights()`
 * callsites in `ListView.tsx` with this model. ListView keeps its current
 * behaviour; only the source of truth changes.
 *
 * Phase 3 (separate bead) replaces `rowsAboveViewport`,
 * `indexLeadingSpacer`, and `indexTrailingSpacer` with HeightModel queries
 * (prefixSum + binary search via prefix), unifying scrollbar math with the
 * placeholder math.
 *
 * Why Fenwick (vs. Segment Tree, vs. cumulative array):
 * - Cumulative array — O(1) query, O(n) update on any change. Bad fit:
 *   ListView measures items as they enter the viewport, so updates dominate.
 * - Segment tree — O(log n) both, ~4n storage, more code. Overkill: we
 *   only need point updates + prefix sums (no range updates, no min/max).
 * - Fenwick (BIT) — O(log n) both, n storage, ~30 LoC. Exact fit.
 *
 * Update model:
 * - Each index has an *effective height*: `measured.get(index) ?? estimate(index)`.
 * - The Fenwick tree stores the effective height per index.
 * - `setMeasured(i, h)` queries the current stored value, then applies the
 *   delta — O(log n).
 * - `setEstimate(fn)` triggers a full rebuild (O(n log n)). Estimate changes
 *   are rare (e.g. viewport-width shifts in wrap-aware lists); cost is fine.
 * - `update({ itemCount, gap })` — itemCount changes resize the tree. Gap
 *   is a scalar — stored as-is and folded into `totalRows()`.
 *
 * Gap accounting (per /pro review):
 *   total = sum(effectiveHeights[0..n)) + max(0, n - 1) * gap
 * NOT `n * (estimate + gap)` — that double-counts the trailing gap.
 */

export interface HeightModel {
  /** Record (or update) a measured height for index i. O(log n). */
  setMeasured(index: number, height: number): void
  /** Replace the estimator. Triggers full rebuild. O(n log n). */
  setEstimate(estimate: (index: number) => number): void
  /** Sum of effective heights for indices [0, index). O(log n). */
  prefixSum(index: number): number
  /**
   * Sum of all effective heights + (n-1) * gap. O(log n).
   * For an empty model returns 0.
   */
  totalRows(): number
  /** Update item count and/or gap. Grows or truncates as needed. O(n log n) on resize. */
  update(opts: { itemCount?: number; gap?: number; estimate?: (index: number) => number }): void
  /** Number of items currently tracked. */
  readonly itemCount: number
}

export interface HeightModelOptions {
  itemCount: number
  estimate: (index: number) => number
  gap?: number
}

interface Internals {
  // Fenwick tree, 1-indexed. tree[0] is sentinel.
  tree: number[]
  // Effective per-item height (mirror — needed for O(log n) setMeasured deltas).
  effective: number[]
  // Sparse measured-height map. `measured.get(i)` overrides estimate for i.
  measured: Map<number, number>
  estimate: (index: number) => number
  itemCount: number
  gap: number
}

function fenwickAdd(tree: number[], i: number, delta: number, n: number): void {
  // 1-indexed Fenwick update.
  for (let x = i + 1; x <= n; x += x & -x) {
    tree[x] = (tree[x] ?? 0) + delta
  }
}

function fenwickPrefix(tree: number[], i: number): number {
  // Sum of [0, i) — i is exclusive end (matches sumHeights signature).
  let s = 0
  for (let x = i; x > 0; x -= x & -x) {
    s += tree[x] ?? 0
  }
  return s
}

function rebuild(self: Internals): void {
  const n = self.itemCount
  self.tree = new Array(n + 1).fill(0)
  self.effective = new Array(n)
  for (let i = 0; i < n; i++) {
    const h = self.measured.get(i) ?? self.estimate(i)
    self.effective[i] = h
    fenwickAdd(self.tree, i, h, n)
  }
}

export function createHeightModel(opts: HeightModelOptions): HeightModel {
  const self: Internals = {
    tree: [],
    effective: [],
    measured: new Map(),
    estimate: opts.estimate,
    itemCount: Math.max(0, opts.itemCount),
    gap: opts.gap ?? 0,
  }
  rebuild(self)

  function setMeasured(index: number, height: number): void {
    if (index < 0 || index >= self.itemCount) return
    const current = self.effective[index] ?? 0
    const delta = height - current
    self.effective[index] = height
    self.measured.set(index, height)
    if (delta !== 0) {
      fenwickAdd(self.tree, index, delta, self.itemCount)
    }
  }

  function setEstimate(estimate: (index: number) => number): void {
    self.estimate = estimate
    rebuild(self)
  }

  function prefixSum(index: number): number {
    if (index <= 0) return 0
    if (index > self.itemCount) index = self.itemCount
    return fenwickPrefix(self.tree, index)
  }

  function totalRows(): number {
    if (self.itemCount === 0) return 0
    const heightSum = fenwickPrefix(self.tree, self.itemCount)
    return heightSum + (self.itemCount - 1) * self.gap
  }

  function update(u: {
    itemCount?: number
    gap?: number
    estimate?: (index: number) => number
  }): void {
    const newCount = u.itemCount != null ? Math.max(0, u.itemCount) : self.itemCount
    const newGap = u.gap != null ? u.gap : self.gap
    const newEstimate = u.estimate ?? self.estimate

    const countChanged = newCount !== self.itemCount
    const estimateChanged = newEstimate !== self.estimate

    self.gap = newGap

    if (countChanged && newCount < self.itemCount) {
      // Shrink — drop measurements for removed indices.
      for (const key of [...self.measured.keys()]) {
        if (key >= newCount) self.measured.delete(key)
      }
    }

    if (countChanged || estimateChanged) {
      self.itemCount = newCount
      self.estimate = newEstimate
      rebuild(self)
    }
  }

  return {
    setMeasured,
    setEstimate,
    prefixSum,
    totalRows,
    update,
    get itemCount() {
      return self.itemCount
    },
  }
}
