# Ink Compatibility Analysis

Date: 2026-03-12
Silvery version: vendor/silvery (HEAD)
Ink test suite: vadimdemedes/ink (master)

## Summary

| Metric          | Count        |
| --------------- | ------------ |
| Total Ink tests | 813          |
| Passed          | 804          |
| Failed          | 9            |
| Compat rate     | **98.9%**    |
| Chalk tests     | 32/32 (100%) |

## Test Infrastructure

Two-layer testing approach:

| Layer                   | Tool                 | Tests | Purpose                              |
| ----------------------- | -------------------- | ----- | ------------------------------------ |
| Layer 1 (authoritative) | ava + upstream clone | 813   | Real Ink tests, source of truth      |
| Layer 2 (CI-friendly)   | vitest + codemod     | 590+  | Fast, no native deps, auto-generated |

### Layer 2 Codemod Pipeline

`gen-vitest.ts` transforms Ink's ava tests to vitest:

| Step               | What                                                          |
| ------------------ | ------------------------------------------------------------- |
| Import rewrite     | `ink` → `@silvery/ink/ink`, ava → ava-shim                 |
| Sinon replacement  | Inline `_createSpy()`/`stub()` functions                      |
| PTY conversion     | `term('fixture')` → `termFixture(fixtureFactory([]))`         |
| Fixture generation | Ink fixture scripts → importable `createFixture()` modules    |
| Known failures     | EXPECTED_FAILURES + RENDER_MODE_FAILURES → `.failing()` marks |

**File classification**:

- Standard tests: 23 files (direct ava→vitest transform)
- PTY tests: 6 files (fixture + termFixture/runFixture in-process)
- Internal files: 9 files skipped (test Ink engine internals silvery replaces)

### PTY Test Status

48 PTY tests across 6 files. 46 are marked `.failing` — in-process simulation can't replicate real node-pty behavior for timing-sensitive tests (500ms exit timeouts, stdin raw mode transitions, env-based behavior). These are codified as known gaps, not expected to pass.

## 9 Remaining Failures

| #   | Category         | Tests | Root Cause                                                |
| --- | ---------------- | ----- | --------------------------------------------------------- |
| 1   | flex-wrap        | 2     | Flexily W3C spec vs Yoga overflow wrapping behavior       |
| 2   | width-height     | 2     | aspectRatio not exposed in silvery's LayoutNode interface |
| 3   | overflow         | 3     | overflowX clipping edge cases with borders/margins        |
| 4   | measure-element  | 1     | Post-state-change re-measurement timing                   |
| 5   | render-to-string | 1     | Synchronous render captures final vs initial state        |

Items 1-2 would be fixed by using Yoga as the layout engine (silvery supports pluggable engines). Items 3-5 are compat layer edge cases.

## Historical Context

The compat layer progressed through several phases:

- **Phase 1** (2026-03-09): Initial compat layer, ~72% (662/845)
- **Phase 2** (2026-03-10): Refactored from monolithic ink.ts to 16 modules, reached 92.5%
- **Phase 3** (2026-03-12): Auto-generated vitest tests, PTY fixture codemod, reached 98.9%

Major improvements: Flexily layout fixes (alignContent, flexBasis, flexWrap, position offsets, gap), ANSI sanitization, cursor management, border rendering, chalk integration, focus system.
