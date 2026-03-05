import { describe, test, expect } from "vitest"

/**
 * INKX _renderCount Verification Gap Bug Documentation
 *
 * This test documents a critical bug in vendor/hightea/src/runtime/create-app.tsx
 * where INKX_STRICT incremental rendering verification was never triggered for
 * single-doRender events (which is most navigation).
 *
 * === ROOT CAUSE ===
 *
 * In create-app.tsx, the verification flow was:
 *
 *   1. processEventBatch() starts at line ~1118
 *      → Sets: _renderCount = 0
 *
 *   2. For each event, doRender() called once
 *      → Line 744: _renderCount++
 *      → After this: _renderCount = 1
 *
 *   3. After doRender, INKX_STRICT check at line ~805:
 *      → if (INKX_STRICT && _renderCount > 1) { verify incremental rendering }
 *      → Evaluates: 1 > 1 = false
 *      → Check SKIPPED!
 *
 * === IMPACT ===
 *
 * Most user interactions (arrow keys, scrolling, selection) trigger a single
 * doRender per event batch. These events NEVER had their incremental rendering
 * verified, even with INKX_STRICT=1 enabled.
 *
 * Content-phase bugs in incremental rendering (dirty flag misses, delta bugs)
 * went undetected during normal navigation, but WERE caught by:
 * - fold/unfold (Case 3 standalone render, _renderCount wasn't reset)
 * - test renderer (createRenderer uses different verification path)
 *
 * === THE FIX ===
 *
 * Replace the _renderCount check with:
 *   wasIncremental = !_noIncremental && _prevTermBuffer !== null
 *
 * This correctly identifies incremental renders regardless of _renderCount,
 * because incremental rendering is determined by:
 * 1. _noIncremental flag (force full render)
 * 2. Presence of a previous terminal buffer
 *
 * The _renderCount counter is a red herring — it doesn't indicate incremental
 * status, only how many doRender calls happened in the current batch.
 */

describe("_renderCount verification gap (documented bug)", () => {
  test("documents: single-doRender events had _renderCount=1, check required >1", () => {
    // Simulate processEventBatch + single doRender sequence
    let _renderCount = 0

    // Line ~1118: processEventBatch starts
    _renderCount = 0

    // Line 744: doRender called once for the event
    _renderCount++

    // After single doRender:
    expect(_renderCount).toBe(1)

    // Line ~805: INKX_STRICT verification check
    const shouldVerify = _renderCount > 1
    expect(shouldVerify).toBe(false)

    // BUG: verification skipped for 99% of navigation events!
  })

  test("documents: why fold/unfold crashes WERE caught (Case 3 standalone)", () => {
    // Case 3 renders bypass processEventBatch, so _renderCount accumulates
    let _renderCount = 0

    // Initial render
    _renderCount++ // renderCount = 1

    // Case 3 triggered (e.g., fold/unfold) without reset
    // This happens outside processEventBatch, so _renderCount isn't reset
    _renderCount++ // renderCount = 2

    // Now check runs:
    const shouldVerify = _renderCount > 1
    expect(shouldVerify).toBe(true)

    // Case 3 verification DOES run → bugs are caught
    // This is why fold/unfold content-phase bugs crashed
  })

  test("documents: the correct fix using wasIncremental flag", () => {
    // The fix: incremental rendering is about WHAT was rendered, not HOW MANY times

    // Scenario 1: First render in batch (no previous buffer)
    let _noIncremental = false
    let _prevTermBuffer: any = null

    const wasIncremental_first = !_noIncremental && _prevTermBuffer !== null
    expect(wasIncremental_first).toBe(false) // Full render, no incremental check needed

    // Scenario 2: Navigation in batch (previous buffer exists)
    _prevTermBuffer = { data: "previous screen" } // Non-null

    const wasIncremental_nav = !_noIncremental && _prevTermBuffer !== null
    expect(wasIncremental_nav).toBe(true) // Incremental render, VERIFY it!

    // Scenario 3: Force full render flag set
    _noIncremental = true
    _prevTermBuffer = { data: "previous screen" } // Non-null

    const wasIncremental_force = !_noIncremental && _prevTermBuffer !== null
    expect(wasIncremental_force).toBe(false) // Forced full render, no verification

    // This approach works for ANY _renderCount value:
    // - Single doRender? Doesn't matter, _prevTermBuffer tells us
    // - Multiple doRenders? Doesn't matter, _prevTermBuffer tells us
  })

  test("documents: why this bug survived testing", () => {
    // The test renderer (createRenderer) doesn't use this code path.
    // It has a different verification mechanism that DOES catch bugs.

    // Therefore:
    // ✗ TUI tests with INKX_STRICT=1: missed single-doRender content bugs
    // ✓ Fold/unfold: caught (Case 3 standalone render)
    // ✓ createRenderer: caught (different path)

    // A content-phase bug would:
    // 1. Pass TUI tests silently
    // 2. Cause visual glitches in real usage
    // 3. Be caught only by Case 3 or createRenderer

    const scenarioThatSlippedThrough = {
      testEnv: "skipped check (bug went undetected)",
      foldUnfold: "caught check (bug detected, crash)",
      createRenderer: "caught check (bug detected, crash)",
    }

    expect(scenarioThatSlippedThrough).toBeDefined()
  })
})
