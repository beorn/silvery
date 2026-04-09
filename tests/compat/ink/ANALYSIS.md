# Ink Compatibility Analysis

Date: 2026-04-09
Silvery version: vendor/silvery (HEAD)
Ink test suite: vadimdemedes/ink v7.0.0

## Summary

| Metric          | Ink 5.2.1 (prior) | Ink 7.0.0 (current) |
| --------------- | ------------------ | -------------------- |
| Total Ink tests | 813                | 931 (134 timed out)  |
| Passed          | 804                | 871                  |
| Known failures  | 9                  | 51                   |
| Unexpected fail | 0                  | 9 (marking bug)      |
| Chalk tests     | 32/32 (100%)       | 32/32 (100%)         |

## Test Infrastructure

Two-layer testing approach:

| Layer                   | Tool                 | Tests | Purpose                              |
| ----------------------- | -------------------- | ----- | ------------------------------------ |
| Layer 1 (authoritative) | ava + upstream clone | 985   | Real Ink tests, source of truth      |
| Layer 2 (CI-friendly)   | vitest + codemod     | 590+  | Fast, no native deps, auto-generated |

### Layer 2 Codemod Pipeline

`gen-vitest.ts` transforms Ink's ava tests to vitest:

| Step               | What                                                          |
| ------------------ | ------------------------------------------------------------- |
| Import rewrite     | `ink` -> `@silvery/ink/ink`, ava -> ava-shim                  |
| Sinon replacement  | Inline `_createSpy()`/`stub()` functions                      |
| PTY conversion     | `term('fixture')` -> `termFixture(fixtureFactory([]))`        |
| Fixture generation | Ink fixture scripts -> importable `createFixture()` modules   |
| Known failures     | EXPECTED_FAILURES + RENDER_MODE_FAILURES -> `.failing()` marks|

**File classification**:

- Standard tests: 23+ files (direct ava->vitest transform)
- PTY tests: 6 files (fixture + termFixture/runFixture in-process)
- Internal files: 9 files skipped (test Ink engine internals silvery replaces)

### PTY Test Status

48 PTY tests across 6 files. 46 are marked `.failing` -- in-process simulation can't replicate real node-pty behavior for timing-sensitive tests (500ms exit timeouts, stdin raw mode transitions, env-based behavior). These are codified as known gaps, not expected to pass.

## New in Ink 7.0

### New Hooks

| Hook                       | Ink API                                                     | Silvery Shim                           |
| -------------------------- | ----------------------------------------------------------- | -------------------------------------- |
| `useAnimation`             | `{ frame, time, delta, reset }` with shared timer           | InkAnimationContext shared timer pool  |
| `useIsScreenReaderEnabled` | Returns boolean from screen reader detection                | `process.env.INK_SCREEN_READER` check |
| `useBoxMetrics`            | `{ width, height, left, top, hasMeasured }` via ref         | Already shimmed (layout subscribers)   |
| `useCursor`                | `{ setCursorPosition }` for IME support                     | Already shimmed (InkCursorStore)       |
| `usePaste`                 | `handler(text)` with bracketed paste mode                   | Already shimmed (RuntimeContext bridge)|
| `useWindowSize`            | `{ columns, rows }` with resize tracking                    | Direct re-export from silvery          |

### New Render Options

| Option                  | Ink 7.0 Behavior                                           | Silvery Compat                        |
| ----------------------- | ---------------------------------------------------------- | ------------------------------------- |
| `maxFps`                | Throttle render updates (default 30)                       | Accepted, not yet throttled           |
| `incrementalRendering`  | Line-based incremental updates                             | Silvery is cell-level incremental     |
| `concurrent`            | React Concurrent Mode (Suspense, useTransition)            | Not supported, silently ignored       |
| `interactive`           | Override auto-detect for CI/pipe                           | Mapped to existing behavior           |
| `alternateScreen`       | Render in alternate screen buffer                          | Full support                          |
| `onRender`              | Callback with render metrics                               | Accepted, not yet wired               |

### New Instance Methods

| Method                  | Ink 7.0 Behavior                                           | Silvery Compat                        |
| ----------------------- | ---------------------------------------------------------- | ------------------------------------- |
| `waitUntilRenderFlush`  | Promise that resolves after stdout flush                   | Resolves immediately                  |
| `cleanup`               | Unmount + remove internal instance                         | Delegates to unmount()                |

### New Test Categories (172 new tests)

| Category           | Tests | What's New                                                     |
| ------------------ | ----- | -------------------------------------------------------------- |
| background         | 30    | BackgroundContext: bg color inheritance through component tree  |
| border-backgrounds | 7     | Per-side borderBackgroundColor props                           |
| build-output       | 5     | Package build artifact validation                              |
| use-animation      | 45    | Shared-timer animation system with frame/time/delta/reset      |
| text-width         | 13    | CJK character rendering, wide char overlay clearing            |

## 57 Known Failures (Categorized)

### New Ink 7.0 Features Not Yet Shimmed (34 tests)

- **BackgroundContext** (27): Ink 7.0 introduces a separate background rendering pass with
  context-based inheritance. Silvery renders backgroundColor via cell-level styling in the
  buffer. The architectural approaches produce different output for nested bg inheritance.
- **borderBackgroundColor** (5): Per-side border background colors are a new Ink 7.0 feature.
  Silvery's border rendering doesn't support per-side bg colors yet.
- **build-output** (2): Tests check for `./build/` directory. Silvery publishes TypeScript
  source directly, so there is no build directory.

### Compat Renderer Limitations (9 tests)

- **use-animation** (3): maxFps throttling and concurrent mode aborted renders require
  Ink's internal render scheduler, which the compat test renderer doesn't implement.
- **kitty-keyboard** (3): Direct stdin/stdout protocol negotiation tests that the compat
  layer handles at a different abstraction level.
- **cursor** (3): Debug mode cursor visibility interaction with useStdout/useStderr writes.

### Rendering Differences (5 tests)

- **text-width** (2): CJK overlay clearing at cell boundaries differs between silvery's
  buffer and Ink's output approach.
- **text** (2): dim+bold combined SGR emission order (silvery emits separate sequences,
  Ink emits combined).
- **components** (1): Hard wrap text rendering difference.

### Carried Forward from 5.2.1 (9 tests)

- **flex-wrap** (2): Flexily W3C spec vs Yoga overflow wrapping behavior.
- **width-height** (2): aspectRatio not exposed in silvery's LayoutNode interface.
- **overflow** (3): overflowX clipping edge cases with borders/margins.
- **measure-element** (1): Post-state-change re-measurement timing.
- **render-to-string** (1): Synchronous render captures final vs initial state.

## Historical Context

| Phase | Date       | Ink    | Pass | Fail | Rate  | Milestone                              |
| ----- | ---------- | ------ | ---- | ---- | ----- | -------------------------------------- |
| 1     | 2026-03-09 | 5.2.1  | 662  | 183  | 72%   | Initial compat layer                   |
| 2     | 2026-03-10 | 5.2.1  | 710  | 103  | 92.5% | Refactored to 16 modules               |
| 3     | 2026-03-12 | 5.2.1  | 804  | 9    | 98.9% | Auto-generated vitest, PTY codemod     |
| 4     | 2026-04-09 | 7.0.0  | 871  | 9    | 93.6% | Ink 7.0 upgrade, new hook shims        |

Major improvements in phase 4: useAnimation shared-timer architecture, useIsScreenReaderEnabled shim, expected failure marks for Ink 7.0 BackgroundContext, border backgrounds, build output, CJK text width, and concurrent mode tests.
