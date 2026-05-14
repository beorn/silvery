/**
 * Integration test — scheduler constructs / does-not-construct the mem
 * monitor based on SILVERY_STRICT. Sibling of
 * scheduler-bytes-out-integration.test.ts.
 *
 * Run: bun vitest run --project vendor vendor/silvery/tests/features/scheduler-mem-integration.test.ts
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { RenderScheduler } from "@silvery/ag-term/scheduler"
import { resetStrictCache } from "@silvery/ag-term/strict-mode"
import type { AgNode } from "@silvery/ag/types"

function makeMockStdout() {
  return {
    columns: 40,
    rows: 10,
    isTTY: false,
    write() {
      return true
    },
    on() {
      return this
    },
    off() {
      return this
    },
  } as unknown as NodeJS.WriteStream
}

describe("scheduler mem gating", () => {
  const originalStrict = process.env.SILVERY_STRICT

  beforeEach(() => {
    resetStrictCache()
  })

  afterEach(() => {
    if (originalStrict === undefined) delete process.env.SILVERY_STRICT
    else process.env.SILVERY_STRICT = originalStrict
    resetStrictCache()
  })

  test("no monitor constructed when SILVERY_STRICT is unset", () => {
    delete process.env.SILVERY_STRICT
    resetStrictCache()
    const scheduler = new RenderScheduler({
      stdout: makeMockStdout(),
      root: {} as AgNode,
    })
    const monitor = (scheduler as unknown as { memMonitor: unknown }).memMonitor
    expect(monitor).toBeNull()
    scheduler.dispose()
  })

  test("monitor constructed at SILVERY_STRICT=1 (tier-1 default)", () => {
    process.env.SILVERY_STRICT = "1"
    resetStrictCache()
    const scheduler = new RenderScheduler({
      stdout: makeMockStdout(),
      root: {} as AgNode,
    })
    const monitor = (scheduler as unknown as { memMonitor: unknown }).memMonitor
    expect(monitor).not.toBeNull()
    scheduler.dispose()
  })

  test("monitor NOT constructed at SILVERY_STRICT=1,!mem (opt-out)", () => {
    process.env.SILVERY_STRICT = "1,!mem"
    resetStrictCache()
    const scheduler = new RenderScheduler({
      stdout: makeMockStdout(),
      root: {} as AgNode,
    })
    const monitor = (scheduler as unknown as { memMonitor: unknown }).memMonitor
    expect(monitor).toBeNull()
    scheduler.dispose()
  })

  test("monitor constructed at SILVERY_STRICT=mem (explicit slug only)", () => {
    process.env.SILVERY_STRICT = "mem"
    resetStrictCache()
    const scheduler = new RenderScheduler({
      stdout: makeMockStdout(),
      root: {} as AgNode,
    })
    const monitor = (scheduler as unknown as { memMonitor: unknown }).memMonitor
    expect(monitor).not.toBeNull()
    scheduler.dispose()
  })

  test("dispose() nulls the monitor", () => {
    process.env.SILVERY_STRICT = "1"
    resetStrictCache()
    const scheduler = new RenderScheduler({
      stdout: makeMockStdout(),
      root: {} as AgNode,
    })
    expect((scheduler as unknown as { memMonitor: unknown }).memMonitor).not.toBeNull()
    scheduler.dispose()
    expect((scheduler as unknown as { memMonitor: unknown }).memMonitor).toBeNull()
  })
})
