/**
 * Profiling counters for measure function performance analysis (dev only).
 *
 * Shared between @silvery/react/reconciler/nodes (where measure happens)
 * and @silvery/term/pipeline/layout-phase (where stats are logged).
 *
 * Lives in @silvery/term to keep the @silvery/term barrel React-free.
 */

export const measureStats = {
  calls: 0,
  cacheHits: 0,
  textCollects: 0,
  displayWidthCalls: 0,
  reset() {
    this.calls = 0;
    this.cacheHits = 0;
    this.textCollects = 0;
    this.displayWidthCalls = 0;
  },
};
