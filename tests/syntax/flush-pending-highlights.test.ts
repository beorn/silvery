/**
 * @silvery/syntax — flushPendingHighlights() contract tests.
 *
 * The fix for the visual-snapshot Shiki race: test harnesses (silvercode's
 * render-harness, ui-driver) drain in-flight `highlight()` calls before
 * capturing snapshots so the output is deterministic — never the
 * synchronous plain-text fallback that `useSyntaxTokens` seeds with.
 *
 * Bead: @km/infra/15587-visual-snapshot-shiki-race.
 */

import { describe, test, expect, beforeEach } from "vitest"
import {
  highlight,
  flushPendingHighlights,
  _clearCache,
  _resetHighlighter,
  _pendingHighlightCount,
} from "@silvery/syntax"

beforeEach(() => {
  // Pending set is per-module-singleton. Reset between tests for isolation.
  _resetHighlighter()
  _clearCache()
})

describe("flushPendingHighlights — public drain API", () => {
  test("no-op when nothing is in flight", async () => {
    expect(_pendingHighlightCount()).toBe(0)
    await flushPendingHighlights()
    expect(_pendingHighlightCount()).toBe(0)
  })

  test("awaiting drain resolves every in-flight highlight", async () => {
    // Kick off a real shiki highlight WITHOUT awaiting it — simulates
    // the SyntaxHighlighter component's `void highlight(...).then(setLines)`
    // pattern. Without flush, the snapshot races the .then handler.
    const p = highlight("const x = 1", "ts", "github-dark")
    expect(_pendingHighlightCount()).toBeGreaterThan(0)
    await flushPendingHighlights()
    expect(_pendingHighlightCount()).toBe(0)
    // The original promise has also resolved (drain awaited it).
    const lines = await p
    expect(lines.length).toBeGreaterThan(0)
  })

  test("Shiki-resolved tokens contain non-default colors (the race target)", async () => {
    // The race symptom: the synchronous fallback returns one plain token
    // per line with no color. The resolved output has multiple tokens,
    // some with theme-assigned colors. The harness's job is to wait
    // until we're in the resolved state.
    const p = highlight("const greeting = 'hello'", "ts", "github-dark")
    await flushPendingHighlights()
    const lines = await p
    expect(lines).toHaveLength(1)
    // shiki splits a const declaration into several tokens; the fallback
    // ships exactly one. Multi-token output is the resolved-state
    // signature.
    expect(lines[0]!.tokens.length).toBeGreaterThan(1)
    const hasColor = lines[0]!.tokens.some((t) => t.color !== undefined)
    expect(hasColor, "at least one token has a theme color").toBe(true)
  })

  test("multiple concurrent highlights all drained by one flush", async () => {
    const p1 = highlight("const a = 1", "ts")
    const p2 = highlight("def f(): pass", "py")
    const p3 = highlight("fn main() {}", "rs")
    expect(_pendingHighlightCount()).toBe(3)
    await flushPendingHighlights()
    expect(_pendingHighlightCount()).toBe(0)
    await Promise.all([p1, p2, p3])
  })

  test("recursive drain catches cascades (highlight kicked off after first resolves)", async () => {
    // Simulates: first highlight resolves → React re-renders → effect
    // fires a new highlight before the first .then chain completes. The
    // flush must await both.
    let secondResolved = false
    const p1 = highlight("const a = 1", "ts").then(async () => {
      // Spawn a new highlight in the .then chain — this is the cascade.
      const p2 = highlight("const b = 2", "ts").then(() => {
        secondResolved = true
      })
      return p2
    })
    await flushPendingHighlights()
    // Both must have resolved by the time flush returns.
    expect(secondResolved, "cascaded highlight resolved during flush").toBe(true)
    await p1
  })

  test("subsequent cached call resolves synchronously through fast path", async () => {
    // First call populates the cache.
    const p1 = highlight("const x = 1", "ts")
    await flushPendingHighlights()
    await p1
    // Second call hits the cache — still goes through trackHighlight,
    // still drainable. Just very fast.
    const p2 = highlight("const x = 1", "ts")
    expect(_pendingHighlightCount()).toBeGreaterThan(0)
    await flushPendingHighlights()
    expect(_pendingHighlightCount()).toBe(0)
    await p2
  })

  test("rejected highlights still drain", async () => {
    // Errors are caught inside _highlight (plain fallback) — but if the
    // tracking layer ever surfaces a rejection, drain must still
    // complete. Use a plain-lang call so we don't hit shiki at all.
    const p = highlight("anything", "plain")
    await flushPendingHighlights()
    expect(_pendingHighlightCount()).toBe(0)
    await p
  })
})

describe("flushPendingHighlights — protects against the visual-snapshot race", () => {
  test("without flush, a microtask drain alone is insufficient", async () => {
    // This test documents the BUG without the fix in place: shiki's
    // createHighlighter is an async dynamic import + grammar load. A
    // few microtask drains do not synchronize with it. Demonstrates
    // why the bead exists.
    //
    // We DON'T _resetHighlighter() — that would force a fresh shiki
    // instance and shiki warns past 10 of them in a test run. Instead
    // we use a unique source string so the cache can't short-circuit.
    const p = highlight(`const microtask_race = 1`, "ts", "github-dark")
    // Drain microtasks the way render-harness's settle() did before
    // the fix — one task tick + 5 microtask ticks. On a cold start
    // (or after _resetHighlighter) the shiki promise is still pending
    // here: dynamic import + grammar load haven't completed.
    await new Promise<void>((r) => setTimeout(r, 0))
    for (let i = 0; i < 5; i++) await Promise.resolve()
    // We can't reliably assert "still pending" without flakiness — on
    // a hot machine with cached imports the highlight may already
    // have resolved. The robust assertion is that AFTER flush the
    // result is the multi-token resolved state, which is what the
    // harness needs.
    await flushPendingHighlights()
    const lines = await p
    expect(lines[0]!.tokens.length).toBeGreaterThan(1)
  })

  test("with flush, the result is always the resolved (multi-token) state", async () => {
    // Run a few iterations to detect flakiness. Vary the source text
    // so the cache doesn't short-circuit the race we're stressing.
    // Don't _resetHighlighter() per iteration — shiki warns past 10
    // instances; the singleton-with-cache-bust is enough to exercise
    // the drain path on each call.
    for (let iter = 0; iter < 4; iter++) {
      _clearCache()
      const p = highlight(`const v${iter} = ${iter}`, "ts", "github-dark")
      await flushPendingHighlights()
      const lines = await p
      expect(
        lines[0]!.tokens.length,
        `iteration ${iter}: must be resolved state (multi-token), got ${lines[0]!.tokens.length}`,
      ).toBeGreaterThan(1)
    }
  })
})
