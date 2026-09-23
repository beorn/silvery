/**
 * @failure When the STANDALONE convergence drain
 *   (`drainStandaloneCommitRerenders` in create-app.tsx) hits
 *   `MAX_CONVERGENCE_PASSES` with a React-requested rerender STILL pending,
 *   the historical behaviour was `pendingRerender = false; return` — it
 *   SILENTLY DROPPED the pending rerender. Under a steadily-growing stream (a
 *   ListView re-measuring a growing assistant block — the boxSize feedback
 *   edge in @km/silvercode/19383) that drop strands `currentBuffer` one pass
 *   behind committed React state: layout allocated rows whose paint was
 *   dropped, so the user sees a blank hole / a frozen, under-rendered frame
 *   that only heals on the next unrelated input.
 * @level l2
 * @consumer @si/silvercode/19383-turn-stall (wip commit 8e2b8060 non-lossy cap)
 *
 * The fix (create-app.tsx `drainStandaloneCommitRerenders`): at the cap, do
 * NOT drop the rerender. Instead
 *   1. record the exhaustion in the always-on pass ring
 *      (`recordPassRing("unknown", "standalone-flush-exhaustion")`),
 *   2. render ONE final pass so this frame paints the LATEST committed state
 *      (`currentBuffer = doRender()`), which `renderStandaloneFrame` then
 *      paints with all rows dirty (a full, self-consistent repaint), and
 *   3. schedule EXACTLY ONE follow-up standalone frame with a fresh budget
 *      (`scheduleFollowupStandaloneFrame`) to absorb any residual feedback.
 * This is bounded (one extra frame per batch, self-limiting) and non-lossy —
 * a steadily-growing stream converges one frame later instead of stranding
 * the buffer behind committed state.
 *
 * REGRESSION CLASS THIS GUARDS ("at-quota state leak"):
 *   - Reintroduce the silent `pendingRerender = false; return` drop (no final
 *     doRender, no follow-up frame) → the growing stream strands below its
 *     converged size and the last painted frame under-renders. Caught by the
 *     "final content fully converged" assertion (count=TARGET).
 *   - Paint a partial / stale buffer at the cap (drop the `doRender()` or the
 *     `markAllRowsDirty()` full-repaint) → the SILVERY_STRICT incremental
 *     (tier 1) / residue (tier 2) checks that fire inside `runtime.render`
 *     diverge from a fresh render of committed state → an
 *     IncrementalRenderMismatch / residue throw surfaces (as an unhandled
 *     rejection → panic on the async standalone path). Caught by the
 *     "no strict / render error" assertion.
 *   - Drop the ring breadcrumb → the "cap was actually exercised" assertion
 *     stops proving the scenario reaches the cap path (guards the scenario
 *     itself against silently regressing to a sub-cap settle after a refactor;
 *     the sub-cap negative-control test below proves the breadcrumb is
 *     cap-specific, not emitted on every standalone frame).
 *
 * The scenario drives the cap through the REAL run()/createApp standalone
 * render path (the test renderer, `createRenderer`, lacks this recovery). A
 * self-limiting microtask chain grows a column: each committed render up to
 * TARGET schedules the next increment on a microtask, and because those
 * microtasks land inside `drainStandaloneCommitRerenders`'s per-iteration
 * `await Promise.resolve()`, the loop keeps finding `pendingRerender` true and
 * exceeds MAX_CONVERGENCE_PASSES (= 2) within one standalone frame.
 * @reach fs-walk <fixture-only: readdirSync(dir) targets tmpdir()/redirectedDumpDir (mkdtempSync(join(tmpdir(), ...))) — the OS temp dir for panic-dump files, never the repo tree.>
 */

import React, { useEffect, useLayoutEffect, useState } from "react"
import { describe, test, expect, beforeAll, afterAll, vi } from "vitest"
import { mkdtempSync, readdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { Box, Text } from "../../src/index.js"
import { _resetPanicCircuitBreaker, run } from "../../packages/ag-term/src/runtime/run"
import {
  resetPassRing,
  formatPassRingBreakdown,
} from "../../packages/ag-term/src/runtime/pass-cause"

const STANDALONE_EXHAUSTION_EDGE = "standalone-flush-exhaustion"
const CONVERGENCE_PANIC_SIGNATURE = "convergence bound exceeded in standalone-flush"
const settle = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms))

/** Names of the panic dumps currently sitting in `dir` (missing dir → none). */
function panicDumpsIn(dir: string): string[] {
  try {
    return readdirSync(dir).filter((f) => f.startsWith("silvery-panic-") && f.endsWith(".txt"))
  } catch {
    return []
  }
}

/**
 * Panic dumps in `dir` that carry THIS suite's convergence signature.
 *
 * Keyed to the signature rather than to the raw file count on purpose: the
 * system temp dir is shared, and vitest runs test files in parallel workers,
 * so an unrelated concurrent dump must not turn the no-bleed assertion into a
 * flake. Only a dump whose contents name our own panic can be our leak.
 */
function convergenceDumpsIn(dir: string, exclude: ReadonlySet<string> = new Set()): string[] {
  return panicDumpsIn(dir)
    .filter((f) => !exclude.has(f))
    .filter((f) => {
      try {
        return readFileSync(join(dir, f), "utf8").includes(CONVERGENCE_PANIC_SIGNATURE)
      } catch {
        return false
      }
    })
}

/**
 * Grows `count` 0 → `target` via a self-limiting microtask chain kicked by a
 * standalone (post-mount) setState. With `target` > MAX_CONVERGENCE_PASSES the
 * chain outruns one drain budget and forces the cap-exceed recovery; with
 * `target` <= the cap it settles normally (the negative control).
 */
function GrowingStream({ target }: { target: number }) {
  const [n, setN] = useState(0)

  // Standalone KICK: fire the first increment on a macrotask AFTER the initial
  // mount has settled, so it flows through the standalone render path
  // (store/onRender case 3 → renderStandaloneFrame), NOT the wider
  // initial-render bounded settle.
  useEffect(() => {
    const t = setTimeout(() => setN((v) => (v === 0 ? 1 : v)), 0)
    return () => clearTimeout(t)
  }, [])

  // Self-perpetuating growth: each committed render up to `target` schedules
  // the next increment on a microtask. useLayoutEffect fires synchronously
  // inside the commit the drain drives, so the microtask lands inside the next
  // drain iteration's `await Promise.resolve()` — keeping pendingRerender true
  // and pushing the loop past the cap within a single standalone frame.
  useLayoutEffect(() => {
    if (n >= 1 && n < target) {
      queueMicrotask(() => setN((v) => (v < target ? v + 1 : v)))
    }
  }, [n, target])

  // Render n content rows so the painted frame visibly reflects the converged
  // count. A dropped rerender at the cap strands the visible rows below target.
  return (
    <Box flexDirection="column">
      <Text>{`count=${n}`}</Text>
      {Array.from({ length: n }, (_, i) => (
        <Text key={i}>{`row ${i}`}</Text>
      ))}
    </Box>
  )
}

/**
 * Grows `count` WITHOUT BOUND — every committed render schedules another
 * increment on a microtask, so `drainStandaloneCommitRerenders` never settles:
 * each standalone frame exhausts its fresh budget and hits the cap, so the
 * CONSECUTIVE cap-exceed streak climbs frame after frame. Unlike GrowingStream
 * (self-limiting at `target`, small streak, a legit transient), this models the
 * PERPETUAL feedback edge the non-lossy follow-up-frame recovery would otherwise
 * paper over forever — the case the new STRICT bounded-streak guard fails loud on.
 */
function PerpetualStream() {
  const [n, setN] = useState(0)

  // Standalone KICK (post-mount, macrotask): flows through the standalone render
  // path (store/onRender case 3 → renderStandaloneFrame), not the initial settle.
  useEffect(() => {
    const t = setTimeout(() => setN((v) => (v === 0 ? 1 : v)), 0)
    return () => clearTimeout(t)
  }, [])

  // NEVER self-limits: each commit schedules the next increment unconditionally,
  // so pendingRerender stays true across every drain iteration → the cap is hit
  // every standalone frame → the consecutive streak grows without bound.
  useLayoutEffect(() => {
    if (n >= 1) queueMicrotask(() => setN((v) => v + 1))
  }, [n])

  return (
    <Box flexDirection="column">
      <Text>{`count=${n}`}</Text>
    </Box>
  )
}

/**
 * Drives PerpetualStream until the bounded-streak guard fires, returning the
 * captured "convergence bound exceeded" panic reports.
 *
 * WHERE THE FAIL-LOUD SURFACES. The guard throws out of
 * `drainStandaloneCommitRerenders`, which rejects the standalone frame's
 * promise. `create-app.tsx`'s `startStandaloneFrame` attaches a rejection
 * handler to that promise and routes the error to `panicApp(error, { title:
 * "standalone render" })`, which records a panic report and flushes it to
 * stderr. So the escalation is a PANIC, not an unhandled rejection.
 *
 * This harness used to sandbox `process.on("unhandledRejection")` and assert on
 * what landed there. That channel was correct when the frame promise was
 * genuinely void-ed with no handler, but 5ea15c6c4 ("join app lifecycle
 * teardown") introduced `standaloneFrameTasks` + the panic-routing rejection
 * handler — after which the rejection is HANDLED and no unhandled rejection is
 * ever emitted. The test kept passing its own (empty) capture list to the
 * assertion and went red. Observing stderr tracks the contract the test names:
 * the edge must fail LOUD, and loud means the operator sees it.
 *
 * Swapping `process.stderr.write` is the supported seam — `writeStderrDurably`
 * deliberately declines its `writeSync` fast path when the method has been
 * intercepted, precisely so tests capture panic output instead of leaking it to
 * the real terminal. Mirrors `tests/runtime/auto-panic-circuit-break.test.tsx`.
 */
async function driveStandalonePerpetual(): Promise<string[]> {
  const stderrChunks: string[] = []
  const isConvergencePanic = (s: string) => /convergence bound exceeded/i.test(s)
  const origStderrWrite = process.stderr.write
  const origStdoutWrite = process.stdout.write
  const origExitCode = process.exitCode
  // Snapshot + silence existing unhandledRejection listeners (vitest's worker
  // handler included) for the drive. The panic path is the expected route, but
  // a deliberately-panicking app tearing down mid-frame can still surface a
  // stray rejection, and that must not fail the worker.
  const originalListeners = process.listeners("unhandledRejection")
  process.removeAllListeners("unhandledRejection")
  process.stderr.write = ((chunk: unknown) => {
    stderrChunks.push(typeof chunk === "string" ? chunk : String(chunk))
    return true
  }) as typeof process.stderr.write
  process.stdout.write = ((_chunk: unknown) => true) as typeof process.stdout.write
  // Production exits the process once the per-run dump cap trips; tests opt out
  // so the runner survives a deliberate panic.
  vi.stubEnv("SILVERY_AUTO_PANIC_TEST_NO_EXIT", "1")
  _resetPanicCircuitBreaker()
  try {
    using term = createTermless({ cols: 40, rows: 20 })
    resetPassRing()
    const handle = await run(<PerpetualStream />, term)
    // Poll until the panic lands — terminate on the observed escalation, not a
    // wall-clock timeout. Each standalone frame yields at its setImmediate
    // boundary, so a few settles cover the > STANDALONE_CAP_STREAK_LIMIT (= 5)
    // consecutive cap-exceed frames the guard needs, plus panicApp's 75ms
    // late-stdin drain before cleanup() flushes the report to stderr.
    for (let i = 0; i < 30; i++) {
      // eslint-disable-next-line no-await-in-loop -- serial drive ticks
      await settle(20)
      if (stderrChunks.some(isConvergencePanic)) break
    }
    handle.unmount()
    // Let any in-flight frame's panic flush before we restore the real stderr.
    await settle(20)
    await settle(20)
    return stderrChunks.filter(isConvergencePanic)
  } finally {
    process.stderr.write = origStderrWrite
    process.stdout.write = origStdoutWrite
    process.exitCode = origExitCode
    vi.unstubAllEnvs()
    _resetPanicCircuitBreaker()
    for (const l of originalListeners) process.on("unhandledRejection", l as never)
  }
}

async function driveStandaloneGrowth(target: number): Promise<{
  screen: string
  ringBreakdown: string
  strictRejections: unknown[]
}> {
  const rejections: unknown[] = []
  const onRejection = (reason: unknown) => rejections.push(reason)
  process.on("unhandledRejection", onRejection)
  try {
    using term = createTermless({ cols: 40, rows: 20 })
    resetPassRing()
    const handle = await run(<GrowingStream target={target} />, term)
    await handle.waitForLayoutStable?.()

    // Let the standalone kick + the microtask growth chain + the scheduled
    // follow-up frame(s) run and paint. Several macrotask ticks cover the
    // setTimeout kick, the per-frame setImmediate coalescing, and the
    // setImmediate-scheduled follow-up frame(s).
    for (let i = 0; i < 8; i++) await settle(20)
    await handle.waitForLayoutStable?.()
    await settle(20)

    const screen = term.screen!.getText()
    const ringBreakdown = formatPassRingBreakdown()
    handle.unmount()
    return {
      screen,
      ringBreakdown,
      strictRejections: rejections.filter((r) =>
        /convergence|incremental|residue|mismatch|strict|render/i.test(String(r)),
      ),
    }
  } finally {
    process.off("unhandledRejection", onRejection)
  }
}

describe("@si/silvercode/19383 — standalone convergence cap recovers non-lossily", () => {
  let prevStrict: string | undefined
  let prevDumpDir: string | undefined
  // Where this file's deliberate panics are allowed to write.
  let redirectedDumpDir = ""
  // Panic dumps already in the DEFAULT location before we start, so the
  // no-bleed assertion below measures only what this run added.
  let preexistingDefaultDumps: ReadonlySet<string> = new Set()

  // tier 2 = incremental (tier 1) + residue (tier 2); both fire inside
  // runtime.render on every painted frame, including the cap-recovery frame.
  beforeAll(() => {
    prevStrict = process.env.SILVERY_STRICT
    process.env.SILVERY_STRICT = "2"

    // Set the dump redirect HERE rather than leaning on the suite-wide
    // default in `tests/vitest.setup.ts`: that setup file is inert under km's
    // monorepo runner, and a test that asserts the no-bleed contract must
    // establish its own precondition under every runner it executes on.
    prevDumpDir = process.env.SILVERY_DUMP_DIR
    redirectedDumpDir = mkdtempSync(join(tmpdir(), "silvery-convergence-dumps-"))
    process.env.SILVERY_DUMP_DIR = redirectedDumpDir
    preexistingDefaultDumps = new Set(panicDumpsIn(tmpdir()))
  })
  afterAll(() => {
    if (prevStrict === undefined) delete process.env.SILVERY_STRICT
    else process.env.SILVERY_STRICT = prevStrict
    if (prevDumpDir === undefined) delete process.env.SILVERY_DUMP_DIR
    else process.env.SILVERY_DUMP_DIR = prevDumpDir
  })

  test("a standalone growing stream that EXCEEDS the cap converges fully under STRICT", async () => {
    const TARGET = 6 // comfortably > MAX_CONVERGENCE_PASSES (= 2)
    const { screen, ringBreakdown, strictRejections } = await driveStandaloneGrowth(TARGET)

    // (1) The cap was actually exercised — the scenario reached the recovery
    // path, not merely a bounded 2-pass settle. Guards the scenario itself.
    expect(
      ringBreakdown,
      `standalone cap-exceed recovery was never triggered — the scenario no longer ` +
        `stresses drainStandaloneCommitRerenders past MAX_CONVERGENCE_PASSES. ring=${ringBreakdown}`,
    ).toContain(STANDALONE_EXHAUSTION_EDGE)

    // (2) STRICT stayed green through the recovery — no incremental/residue
    // mismatch (a partial / stale buffer at the cap would throw here).
    expect(
      strictRejections,
      `SILVERY_STRICT threw during the cap recovery frame — the recovery painted a ` +
        `partial/stale buffer instead of a full repaint of committed state:\n${strictRejections
          .map(String)
          .join("\n")}`,
    ).toHaveLength(0)

    // (3) Non-lossy: the final painted frame is fully converged. The drop
    // regression strands the count below TARGET.
    expect(
      screen,
      `standalone cap recovery stranded the buffer below its converged size — the ` +
        `pending rerender was dropped at the cap (at-quota state leak). screen:\n${screen}`,
    ).toContain(`count=${TARGET}`)
    expect(screen, `converged content row missing:\n${screen}`).toContain(`row ${TARGET - 1}`)
  })

  test("negative control: a sub-cap standalone settle does NOT emit the exhaustion breadcrumb", async () => {
    // TARGET === MAX_CONVERGENCE_PASSES: the chain settles within one drain
    // budget, so the recovery path must NOT fire. This proves assertion (1)
    // above is keyed to the cap-exceed path specifically, not to any standalone
    // render — a breadcrumb emitted on every frame would be a false positive.
    const TARGET = 2
    const { screen, ringBreakdown, strictRejections } = await driveStandaloneGrowth(TARGET)

    expect(strictRejections, strictRejections.map(String).join("\n")).toHaveLength(0)
    expect(
      ringBreakdown,
      `sub-cap standalone settle spuriously emitted the cap-exceed breadcrumb — the ` +
        `recovery path fired without the cap being exceeded. ring=${ringBreakdown}`,
    ).not.toContain(STANDALONE_EXHAUSTION_EDGE)
    // It still converges (no regression to the happy path).
    expect(screen).toContain(`count=${TARGET}`)
  })

  test("a PERPETUAL standalone feedback edge fails loud under STRICT instead of soft-recovering forever", async () => {
    // GrowingStream self-limits at `target`, so its consecutive cap-exceed streak
    // stays small — a legit transient the non-lossy recovery absorbs (the tests
    // above keep streak <= STANDALONE_CAP_STREAK_LIMIT and must NOT throw).
    // PerpetualStream NEVER settles, so the streak climbs past
    // STANDALONE_CAP_STREAK_LIMIT (= 5); at that point the new guard escalates to
    // a hard `assertBoundedConvergence` throw (SILVERY_STRICT=2 from beforeAll →
    // isStrictEnabled("incremental", 2) is true AND strict "2" makes the assert
    // throw) rather than scheduling yet another papering-over follow-up frame.
    // The throw rejects the standalone frame promise, which create-app routes to
    // `panicApp(…, { title: "standalone render" })` — so the "convergence bound
    // exceeded" message reaches the operator on stderr. That panic is what
    // TERMINATES the otherwise-perpetual soft-recovery loop.
    const convergencePanics = await driveStandalonePerpetual()
    expect(
      convergencePanics.length,
      `the perpetual standalone feedback edge never tripped the bounded-streak ` +
        `fail-loud — drainStandaloneCommitRerenders kept soft-recovering forever ` +
        `instead of escalating to assertBoundedConvergence once the consecutive ` +
        `cap-exceed streak exceeded STANDALONE_CAP_STREAK_LIMIT (= 5). captured ` +
        `stderr panics: ${convergencePanics.join(" | ") || "(none)"}`,
    ).toBeGreaterThan(0)
    expect(convergencePanics[0]).toContain(CONVERGENCE_PANIC_SIGNATURE)

    // The dump is still WRITTEN and still READABLE — redirecting the
    // destination must not weaken the diagnostic. This is the half of the
    // contract a "skip dump writes in tests" flag would have destroyed.
    const redirected = convergenceDumpsIn(redirectedDumpDir)
    expect(
      redirected.length,
      `the panic reached stderr but no dump file was written to the redirected ` +
        `dump dir — the incident lost its copy-pasteable artifact. dir=${redirectedDumpDir}`,
    ).toBeGreaterThan(0)
    expect(
      readFileSync(join(redirectedDumpDir, redirected[0]!), "utf8"),
      `the redirected dump exists but does not carry the failing loop's stack — ` +
        `dump content regressed`,
    ).toContain("assertBoundedConvergence")
  })

  test("a deliberate panic leaves NO dump in the default (shared) dump location", () => {
    // Runs last on purpose: the cases above have already panicked, so any
    // bleed into the shared system temp dir has already happened by now.
    //
    // THE BUG THIS PINS: `recordPanic` used to hardcode `${tmpdir()}/...`, so
    // every green run of this file deposited a `silvery-panic-*.txt` in the
    // shared temp dir that was byte-identical to production crash evidence —
    // a passing test manufacturing false crash reports for whoever triaged
    // that directory next, and a live feeder of temp-dir inode exhaustion.
    // `SILVERY_AUTO_PANIC_MAX_DUMPS` never bounded it, because test
    // infrastructure resets the circuit-breaker between cases.
    const leaked = convergenceDumpsIn(tmpdir(), preexistingDefaultDumps)
    expect(
      leaked,
      `a PASSING test wrote ${leaked.length} panic dump(s) carrying this suite's ` +
        `convergence signature into the shared dump location (${tmpdir()}) — ` +
        `deliberate test panics must honour SILVERY_DUMP_DIR and stay in ` +
        `${redirectedDumpDir}. Leaked: ${leaked.join(", ")}`,
    ).toEqual([])
  })
})
