/**
 * @silvery/scope/trace — leak-detector tests.
 *
 * Two runtimes here:
 *
 * 1. **In-process (this file)** — verifies the public API in default
 *    (disabled) mode: snapshot is empty, isTraceEnabled() is false,
 *    creating + disposing scopes/disposables is a complete no-op on
 *    the trace registry.
 *
 * 2. **Subprocess (later in this file)** — spawns a Bun process with
 *    `SILVERY_SCOPE_TRACE=1` so the env-gate fires at module-load time;
 *    verifies the at-exit handler reports an unfinalized scope. Module
 *    state is set at load, so this is the only way to exercise the
 *    enabled path without hot-swapping the registry.
 */

import { describe, expect, it } from "vitest"
import { spawnSync } from "node:child_process"

import { createScope, disposable } from "../src/index.js"
import { getTraceSnapshot, isTraceEnabled, reportTraceLeaks } from "../src/trace.js"

// =============================================================================
// In-process: trace disabled by default
// =============================================================================

describe("trace (default — disabled)", () => {
  it("isTraceEnabled() is false when SILVERY_SCOPE_TRACE is unset", () => {
    expect(isTraceEnabled()).toBe(false)
  })

  it("getTraceSnapshot() returns empty array", () => {
    expect(getTraceSnapshot()).toEqual([])
  })

  it("creating + disposing a scope leaves no trace entries", async () => {
    const before = getTraceSnapshot().length
    const scope = createScope("test-1")
    expect(getTraceSnapshot().length).toBe(before)
    await scope[Symbol.asyncDispose]()
    expect(getTraceSnapshot().length).toBe(before)
  })

  it("creating + disposing a disposable() value leaves no trace entries", () => {
    const before = getTraceSnapshot().length
    let disposed = false
    const d = disposable({ x: 1 }, (_) => {
      disposed = true
    })
    expect(getTraceSnapshot().length).toBe(before)
    d[Symbol.dispose]()
    expect(disposed).toBe(true)
    expect(getTraceSnapshot().length).toBe(before)
  })

  it("reportTraceLeaks() returns 0 when registry is dormant", () => {
    expect(reportTraceLeaks()).toBe(0)
  })
})

// =============================================================================
// Subprocess: trace enabled via env
// =============================================================================

describe("trace (subprocess with SILVERY_SCOPE_TRACE=1)", () => {
  // Inline source — kept short and self-contained so it doesn't drift from
  // the import surface. Uses --print so output goes to stdout/stderr.
  const sourceLeak = `
    import { createScope } from "${import.meta.dirname}/../src/index.ts"
    createScope("leaky-scope")
    // intentionally not disposed — should appear in the at-exit report
  `

  const sourceClean = `
    import { createScope } from "${import.meta.dirname}/../src/index.ts"
    const scope = createScope("clean-scope")
    await scope[Symbol.asyncDispose]()
    // properly disposed — should not appear
  `

  it("at-exit hook reports an undisposed scope", () => {
    const result = spawnSync("bun", ["-e", sourceLeak], {
      env: { ...process.env, SILVERY_SCOPE_TRACE: "1" },
      encoding: "utf8",
    })
    const stderr = result.stderr ?? ""
    expect(stderr).toContain("undisposed handle")
    expect(stderr).toContain("leaky-scope")
  })

  it("at-exit hook reports nothing when all handles are disposed", () => {
    const result = spawnSync("bun", ["-e", sourceClean], {
      env: { ...process.env, SILVERY_SCOPE_TRACE: "1" },
      encoding: "utf8",
    })
    const stderr = result.stderr ?? ""
    expect(stderr).toContain("no undisposed handles")
    expect(stderr).not.toContain("clean-scope")
  })
})
