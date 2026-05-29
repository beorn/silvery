# CLS — Cumulative Layout Shift

_Catch flickering and snap-after-paint bugs deterministically_

Terminal UIs are not visually-static. A code fence resizes mid-stream. A status bar bounces when the model's name comes in late. A chat block renders flush-left then snaps to its real position. These bugs are reported as "flicker" or "jump" — but until now there was no machine-readable signal that distinguished _legitimate_ reflow (user scrolled, content arrived) from _unexpected_ reflow (a layout race, a wrong cascade, a settle-on-second-frame bug).

CLS instrumentation gives you that signal. It's the terminal counterpart to [Web Vitals CLS](https://web.dev/articles/cls): every layout shift is recorded with its rect transition, classified by reason, and aggregated into a `CLSReport`. The `unexpected` subset is the actionable one — and `SILVERY_STRICT=cls` flips the assertion into the umbrella env var, so close-gate tests don't have to hand-roll the check.

## When to reach for CLS

| You're debugging…                                              | Use CLS                                                                                                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| A visual bug reported as "flicker" / "jumps" / "shifts"        | Yes — capture across the reproducing interaction, look at `report.unexpectedShifts`                                                              |
| A test snapshot that passes but users still see a visible jump | Yes — snapshots compare _final_ state; CLS exposes the intermediate frames                                                                       |
| A streaming view where content arrives mid-render              | Yes — but classify the arrival as `content-arrival` so it doesn't fail close-gates                                                               |
| A static layout that paints incorrectly on first frame         | No — that's a single-frame bug, not a shift. Reach for `SILVERY_STRICT=1` (incremental≡fresh) or a snapshot diff instead                         |
| A scroll bug                                                   | Maybe — if the bug is "container scrolled when nothing should have moved", yes. If it's "scroll content rendered wrong inside the container", no |

## Quick start

```tsx
import { createRenderer } from "@silvery/test"
import { Chat } from "./Chat"

const r = createRenderer({ cols: 80, rows: 24 })
const app = r(<Chat conversation={emptyConversation} />)

app.beginCLSCapture()
app.rerender(<Chat conversation={withFirstMessage} />)
await app.waitForLayoutStable()
const report = app.endCLSCapture()

expect(report.unexpectedShifts).toEqual([])
```

That's the canonical close-gate shape for a visual-bug bead: capture across the interaction, assert no unexpected shifts. If shifts appear, `report.shifts` carries the offending blocks (`blockId`, `fromRect` → `toRect`) so the failure points at the bug.

## Capture API

The capture API lives on `App` (returned from `createRenderer`, `createTermless`, or `render`). It is process-wide: a single recorder is active at any time, set when `beginCLSCapture()` runs and cleared when `endCLSCapture()` or `cancelCLSCapture()` runs.

| Method                           | Purpose                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `app.beginCLSCapture(reasoner?)` | Start a capture window. Optional `ReasonClassifier` overrides the default labeling (every shift `"unexpected"`). |
| `app.endCLSCapture()`            | Stop capture, return a `CLSReport`. Throws under `SILVERY_STRICT=cls` if any `unexpected` shifts were recorded.  |
| `app.cancelCLSCapture()`         | Discard the in-flight capture without producing a report. Idempotent — safe to call when no capture is active.   |

```ts
app.beginCLSCapture()
// ... interact, rerender, wait, etc.
const report: CLSReport = app.endCLSCapture()
```

`waitForLayoutStable()` is your friend — drain pending layout passes before reading the report so you don't miss the convergence-frame shift:

```ts
app.beginCLSCapture()
await app.type("hello world")
await app.waitForLayoutStable()
const report = app.endCLSCapture()
```

## The `CLSReport` shape

```ts
interface CLSReport {
  shifts: readonly LayoutShift[] // every shift in the window
  cumulativeScore: number // sum of (area × distance) — every reason
  unexpectedShifts: readonly LayoutShift[] // subset labeled "unexpected"
}

interface LayoutShift {
  blockId: string // stable id (testid > id > name > nodeId > type)
  fromRect: Rect // previous frame's rect
  toRect: Rect // current frame's rect
  frameTimestamp: number // ms since epoch when the frame ended
  reflowReason: "user-action" | "unexpected" | "animation" | "content-arrival"
}
```

The scoring formula is `max(prevArea, currArea) × euclideanDistance` — raw cells, not viewport-fraction. Score is comparable across runs in the **same terminal size + content envelope**; not directly comparable across different terminal sizes (a 5×5 block moving 10 cells in an 80×24 terminal scores the same as the same block moving 10 cells in an 160×48 terminal — the bigger terminal has more cells to move through, but CLS still says "the block moved 10 cells").

Web CLS uses impact-fraction (area moved ÷ viewport area). We use raw because terminal viewports are small, and per-block context matters more than viewport-relative weighting — a 1-cell jump in a status line is meaningful at 80×24, less so at 200×60.

## Reason taxonomy

The classifier decides _why_ a shift happened. The default classifier labels every shift `"unexpected"` — most pessimistic, surfaces the bug class CLS exists to catch.

| Reason            | Meaning                                                 | Action              |
| ----------------- | ------------------------------------------------------- | ------------------- |
| `user-action`     | User did something — typed, scrolled, resized           | Allowed — not a bug |
| `unexpected`      | No triggering event — the actionable bug class          | Fix it              |
| `animation`       | Ongoing animation that's expected to move stuff         | Allowed — not a bug |
| `content-arrival` | New content streamed in — expected for chat / log views | Allowed — not a bug |

Pass a custom classifier to `beginCLSCapture` when you want the consumer to decide:

```ts
import type { ReasonClassifier } from "@silvery/test"

const classifier: ReasonClassifier = (blockId, fromRect, toRect, frameTimestamp) => {
  if (blockId.startsWith("chat-message-")) return "content-arrival"
  if (blockId === "status-line") return "user-action"
  return "unexpected"
}

app.beginCLSCapture(classifier)
```

Only `unexpected` shifts are aggregated into `report.unexpectedShifts` and gate `SILVERY_STRICT=cls`. The other reasons contribute to `report.cumulativeScore` (so you can still see _how much_ the layout moved) but don't fail the assertion.

## SILVERY_STRICT=cls

Per the [SILVERY_STRICT contract](/guide/debugging#silvery_strict), `cls` is a slug under the umbrella — not a new env var. It enables the unexpected-shifts assertion globally for every active capture.

```bash
SILVERY_STRICT=cls bun vitest run     # only the cls check
SILVERY_STRICT=2 bun vitest run       # tier 2 includes cls (paranoid bundle)
SILVERY_STRICT=2,!cls bun vitest run  # tier 2 minus cls (per-test escape hatch)
```

When the slug is active, `endCLSCapture()` throws `UnexpectedLayoutShiftError` on any report containing `unexpected` shifts. The error carries `.shifts` and `.score` for programmatic inspection:

```ts
try {
  const report = app.endCLSCapture()
} catch (e) {
  if (e instanceof UnexpectedLayoutShiftError) {
    console.error(`CLS: ${e.shifts.length} unexpected, score ${e.score}`)
  }
  throw e
}
```

The error message truncates the offender list at 5 with a tail (`... and N more`), so failing tests point at the worst offenders without re-running.

The slug is **tier 2 by default** (paranoid) — `SILVERY_STRICT=1` does _not_ enable it. The reason: until every pre-existing layout-shift bug is closed, defaulting to tier 1 would fail every `bun run test:fast` invocation. Tier 2 is the opt-in bundle for tests that have been audited.

## Integration with close-gates

The full close-gate contract (per [@km/all/embed-close-gates-in-beads](https://github.com/beorn/km/blob/main/%40km/all/embed-close-gates-in-beads.md)) requires CLS evidence for visual-bug close-reasons. Format:

```
CLS: <termless test path> | unexpectedShifts: 0 | cumulativeScore: <n>
```

Example close-reason for a fixed code-fence-flush-left bug:

```
Fixed: apps/silvercode/src/components/Markdown.tsx:142
Test: apps/silvercode/tests/visual/codeblock-flush-left-not-centered.test.tsx
CLS: apps/silvercode/tests/visual/codeblock-flush-left-not-centered.test.tsx | unexpectedShifts: 0 | cumulativeScore: 0.0
Verified: km view screenshot (/tmp/codeblock-fixed.png) + termless integration test + user confirmed
```

Pairs with [`@km/silvery/termless-realism-parity`](https://github.com/beorn/km/blob/main/%40km/silvery/termless-realism-parity.md): CLS evidence is only valid when the test mounts the production component tree. Mounting `<MarkdownView>` in isolation produces a meaningless CLS report — the bug class CLS catches lives at the composition layer.

## How it works under the hood

CLS is a one-monitor / two-consumer architecture: a single `ClsMonitor` per `App` is the source of truth for shift detection; production-time logging and test-time capture both pull from it.

1. **ClsMonitor** ([`packages/ag-term/src/runtime/cls-monitor.ts`](https://github.com/beorn/silvery/blob/main/packages/ag-term/src/runtime/cls-monitor.ts)): the single per-`App` recorder. Owns the storm-detector path-history, the test-time session-shift buffer, the active classifier, and the `clsEnabled()` gate (true under `DEBUG=silvery:cls` / `SILVERY_INSTRUMENT=cls`, OR while a capture is active). `onCommit(root, cols, rows, scrollOrResize)` walks the tree post-commit reading **`node.screenRect`** (post-scroll, sticky-aware — the only rect domain that catches scroll-induced + sticky-element flicker; the pre-scroll `boxRect` path was the consolidation history's bug).

2. **Renderer commit boundary** ([`packages/ag-term/src/renderer.ts`](https://github.com/beorn/silvery/blob/main/packages/ag-term/src/renderer.ts)): each `render()` instantiates `createClsMonitor()` and passes it via `buildApp({ clsMonitor })`. `doRender` calls `clsMonitor.onCommit(...)` after every pipeline-convergence pass settles — this is the canonical commit-window boundary, the same place where outline-decoration carries cross-frame snapshots.

3. **Test-time capture** (`ClsMonitor.beginCapture` / `endCapture` / `cancelCapture`): the test-facing API. `beginCapture(classifier?)` opens a session-shift buffer and overrides the default `"unexpected"` reason-labeling. Subsequent `onCommit` walks push shifts into the buffer (skipping commits with `scrollOrResize=true` — user-action motion is not unexpected flicker). `endCapture()` aggregates into a `CLSReport`, applies `assertNoUnexpectedShifts` (the `SILVERY_STRICT=cls` umbrella gate), and clears state.

4. **Production-time logging** (`onCommit`'s env-gated path): when `DEBUG=silvery:cls` or `SILVERY_INSTRUMENT=cls` is set, the same walk feeds storm-detection (per-path window thresholds + per-commit count thresholds), size-invariant warnings (negative / overflowing / zero-area-with-content rects), and per-shift `silvery:cls` debug logs. Independent of capture state — production observability and test assertions never interfere.

5. **Pure math** ([`packages/ag/src/cls.ts`](https://github.com/beorn/silvery/blob/main/packages/ag/src/cls.ts)): types (`LayoutShift`, `CLSReport`, `ReflowReason`, `ReasonClassifier`) + `computeShiftScore` (max-area × euclidean-distance) + `aggregateReport` + `aggregateUnexpectedScore` + `defaultClassifier`. No React, no signals, no AgNode dependency — pure rect-diff. Imported by both `ClsMonitor` and consumers building custom classifiers.

6. **Strict gate** ([`packages/ag-term/src/strict-cls.ts`](https://github.com/beorn/silvery/blob/main/packages/ag-term/src/strict-cls.ts)): `assertNoUnexpectedShifts(report)` honors `SILVERY_STRICT=cls` via the umbrella contract. Called from `ClsMonitor.endCapture()` unconditionally — no-op when the slug is off.

The whole stack is ~450 LOC; the test suite is ~600 LOC (19 unit on pure math, 11 on ClsMonitor capture state machine, 8 end-to-end through `createRenderer`, 4 screenRect-domain regression).

## Limitations

- **Single capture per `App`**. `beginCapture` throws on double-begin. Two `App` instances coexisting in one process each have their own `ClsMonitor` — captures are independent.
- **Wall-clock timestamps**. `frameTimestamp` uses `Date.now()` — not monotonic. Use `peekShifts()` if you need to correlate with a monotonic clock.
- **No partial-overlap weighting**. A 5×5 block that moves 10 cells scores the same regardless of how much the from/to rects overlap. Web CLS treats partial overlap differently; we don't.
- **Resize without move is not a shift**. A block that grows in place (`{0,0,2,2}` → `{0,0,4,4}`) scores 0 — same top-left position, zero euclidean distance. Detect resize separately via dimension diffs if you care about that signal.
- **First paint is not a shift**. The very first frame records `prevLayout=null` for every node; `recordRect` skips null transitions. CLS only measures _change_, not initial state.

## Related

- `@silvery/test` — capture API (`beginCLSCapture`, `endCLSCapture`, types); see the "Quick start" + "Capture API" sections above for usage
- [SILVERY_STRICT contract](/guide/debugging#silvery_strict) — umbrella env var, slug taxonomy
- [`@km/silvery/termless-realism-parity`](https://github.com/beorn/km/blob/main/%40km/silvery/termless-realism-parity.md) — sibling bead, mount production tree for CLS evidence to be valid
- Web Vitals CLS — the design inspiration: [web.dev/articles/cls](https://web.dev/articles/cls)
