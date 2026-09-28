/**
 * dump-file.ts — the single writer for every crash/diagnostic dump silvery
 * emits, and the single place that decides WHERE those dumps land.
 *
 * Four sites write incident dumps: the panic recorder and the React
 * render-error boundary (`create-app.tsx`), the event-loop failure handler
 * (`create-app.tsx`), and the SILVERY_STRICT incremental-mismatch reporter
 * (`renderer.ts`). Each used to inline `${tmpdir()}/silvery-<kind>-<ts>.txt`,
 * so the destination was un-overridable and every caller — including a
 * PASSING test that panics on purpose — wrote into the shared system temp
 * directory.
 *
 * ## Why this exists (the test-isolation bug)
 *
 * `tests/pipeline/standalone-convergence-cap-recovery.test.tsx` deliberately
 * drives a perpetual feedback edge to prove the bounded-streak guard fails
 * loud. The guard fires, `recordPanic` writes a dump, and the test passes —
 * leaving one `silvery-panic-*.txt` in the system temp dir on EVERY run. Those
 * files are indistinguishable from production crash evidence: an operator
 * triaging the temp directory reads a green suite's deliberate panic as a live
 * runtime defect. (One did, on 2026-08-19.) The circuit-breaker at
 * `MAX_PANIC_DUMPS_PER_RUN` does not help — test infrastructure resets it
 * between cases, which is correct for the cap and useless for the bleed.
 *
 * ## Why a directory override, and not a disable flag
 *
 * A boolean "don't write dumps in tests" would make the dump untestable: the
 * perpetual-edge test asserts the panic REACHES the operator, and richer
 * assertions want the dump's CONTENT. Redirecting keeps the write path fully
 * exercised — same code, same bytes, different directory — so the test can
 * read the artifact back while the shared temp dir stays clean.
 *
 * Deliberately separate from the exit behaviour: a variable that also stopped
 * writing dumps would silently delete real-panic diagnostics in any
 * environment that sets it. One variable, one meaning.
 *
 * Deliberately NOT a `SILVERY_STRICT` slug either: STRICT's one-knob contract
 * governs which CHECKS run, not where artifacts are written. This is an
 * artifact destination, the same family as `DEBUG_LOG`, `SILVERY_DEV_LOG` and
 * `SILVERY_INSTRUMENT_FILE`.
 *
 * Production is unchanged: with `SILVERY_DUMP_DIR` unset, dumps land in
 * `os.tmpdir()` exactly as before.
 */

import { writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"

/**
 * Dump kinds. The kind is the filename infix, so it is also the glob a
 * diagnostic message shows the operator.
 */
export type DumpKind = "panic" | "render-error" | "strict-failure" | "eventloop-failure"

/**
 * Directory incident dumps are written to. `SILVERY_DUMP_DIR` overrides;
 * default is the system temp dir.
 *
 * Read at CALL time, not module load, so a test can redirect after import
 * (`vi.stubEnv`) and so a long-lived process picks up a changed value.
 */
export function dumpDir(): string {
  const override = process.env.SILVERY_DUMP_DIR?.trim()
  return override && override.length > 0 ? override : tmpdir()
}

/** The glob an operator should look at for a given dump kind. */
export function dumpGlob(kind: DumpKind): string {
  return `${dumpDir()}/silvery-${kind}-*.txt`
}

/**
 * Write one incident dump and return its path, or `undefined` if the write
 * failed.
 *
 * Best-effort by contract: a panic must still restore the terminal and print
 * its summary even when the filesystem refuses. Callers surface the
 * `undefined` (the report carries no `dump:` line) rather than throwing — the
 * dump is diagnostic garnish on a path that is ALREADY reporting a failure
 * loudly through stderr, so a swallowed write cannot hide an incident.
 *
 * The configured directory is created if missing, so pointing
 * `SILVERY_DUMP_DIR` at a not-yet-existing per-run path is not a silent way to
 * lose every dump.
 */
export function writeDumpFile(kind: DumpKind, contents: string): string | undefined {
  try {
    const dir = dumpDir()
    mkdirSync(dir, { recursive: true })
    const path = `${dir}/silvery-${kind}-${Date.now()}.txt`
    writeFileSync(path, contents)
    return path
  } catch {
    return undefined
  }
}
