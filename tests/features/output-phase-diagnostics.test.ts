import { existsSync, statSync } from "node:fs"
import * as loggily from "loggily"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { TerminalBuffer } from "../../packages/ag-term/src/buffer"
import {
  createOutputPhase,
  getLastOutputPhaseDiagnostics,
  outputPhase,
} from "../../packages/ag-term/src/pipeline/output-phase"

describe("output phase diagnostics", () => {
  test("records first-render diagnostics", () => {
    const next = new TerminalBuffer(8, 3)
    next.setCell(0, 0, { char: "A" })

    outputPhase(null, next, "fullscreen")

    expect(getLastOutputPhaseDiagnostics()).toEqual({
      reason: "first-render",
      mode: "fullscreen",
      width: 8,
      height: 3,
      prevWidth: 0,
      prevHeight: 0,
      changedCells: 24,
      rawChangedCells: 24,
      dirtyRows: 3,
    })
  })

  test("records incremental diff diagnostics", () => {
    const prev = new TerminalBuffer(8, 3)
    const next = prev.clone()
    next.setCell(2, 1, { char: "B" })

    outputPhase(prev, next, "fullscreen")

    expect(getLastOutputPhaseDiagnostics()).toMatchObject({
      reason: "diff",
      mode: "fullscreen",
      width: 8,
      height: 3,
      prevWidth: 8,
      prevHeight: 3,
      changedCells: 1,
      rawChangedCells: 1,
      dirtyRows: 1,
    })
  })

  test("records dimension-mismatch diagnostics", () => {
    const prev = new TerminalBuffer(8, 3)
    const next = new TerminalBuffer(10, 4)

    outputPhase(prev, next, "fullscreen")

    expect(getLastOutputPhaseDiagnostics()).toMatchObject({
      reason: "dimension-mismatch",
      mode: "fullscreen",
      width: 10,
      height: 4,
      prevWidth: 8,
      prevHeight: 3,
      changedCells: 40,
      rawChangedCells: 40,
      dirtyRows: 4,
    })
  })
})

// 31167 A: the size line (SILVERY_DEBUG_OUTPUT / SILVERY_STRICT_ACCUMULATE) and
// the capture status (SILVERY_DEBUG_CAPTURE) are human text. @cto's ruling moves
// them off /tmp/silvery-sizes.log and /tmp/silvery-capture.log onto the existing
// silvery:output namespace under the same flags. The raw .ansi replay files the
// capture writes on a mismatch stay where they are.
describe("output phase diagnostic text goes to silvery:output, never a fixed /tmp file", () => {
  const SIZES_FILE = "/tmp/silvery-sizes.log"
  const CAPTURE_FILE = "/tmp/silvery-capture.log"
  const ENV_KEYS = ["SILVERY_STRICT_ACCUMULATE", "SILVERY_DEBUG_CAPTURE", "LOG_LEVEL"] as const
  let saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((name) => [name, process.env[name]]))
    delete process.env.SILVERY_STRICT_ACCUMULATE
    delete process.env.SILVERY_DEBUG_CAPTURE
    // loggily's default level; the suites run at warn to keep output quiet.
    process.env.LOG_LEVEL = "info"
  })

  afterEach(() => {
    for (const name of ENV_KEYS) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
  })

  /** Identity of a retired fixed file: size and mtime, or null while it is absent. */
  function fixedFileIdentity(path: string): string | null {
    if (!existsSync(path)) return null
    const stat = statSync(path)
    return `${stat.size}:${stat.mtimeMs}`
  }

  type Modules = {
    loggily: typeof import("loggily")
    createOutputPhase: typeof createOutputPhase
    TerminalBuffer: typeof TerminalBuffer
  }

  /** A first frame and one incremental frame changing one cell; returns silvery:output messages. */
  function renderTwoFrames(mods: Modules): string[] {
    const messages: string[] = []
    mods.loggily.setSuppressConsole(true)
    const unsubscribe = mods.loggily.addWriter(
      { ns: "silvery:output" },
      (_formatted, _level, _namespace, event) => {
        if (event.kind === "log") messages.push(event.message)
      },
    )
    try {
      const render = mods.createOutputPhase({})
      const prev = new mods.TerminalBuffer(8, 3)
      const next = prev.clone()
      next.setCell(2, 1, { char: "B" })
      render(null, prev, "fullscreen")
      render(prev, next, "fullscreen")
    } finally {
      unsubscribe()
      mods.loggily.setSuppressConsole(false)
    }
    return messages
  }

  /** The statically imported output phase and the loggily instance it binds. */
  const staticModules: Modules = { loggily, createOutputPhase, TerminalBuffer }

  test("SILVERY_STRICT_ACCUMULATE: the size line is a silvery:output record", () => {
    process.env.SILVERY_STRICT_ACCUMULATE = "1"
    const before = fixedFileIdentity(SIZES_FILE)

    const messages = renderTwoFrames(staticModules)

    expect(messages).toContainEqual(expect.stringMatching(/^changesToAnsi: 1 changes, \d+ bytes$/))
    expect(fixedFileIdentity(SIZES_FILE)).toBe(before)
  })

  test("SILVERY_DEBUG_CAPTURE: the per-frame status is a silvery:output record", async () => {
    // Read once at module load, so load a fresh output phase (and the loggily
    // instance it binds) with the flag set.
    process.env.SILVERY_DEBUG_CAPTURE = "1"
    vi.resetModules()
    const mods: Modules = {
      loggily: await import("loggily"),
      createOutputPhase: (await import("../../packages/ag-term/src/pipeline/output-phase"))
        .createOutputPhase,
      TerminalBuffer: (await import("../../packages/ag-term/src/buffer")).TerminalBuffer,
    }
    const before = fixedFileIdentity(CAPTURE_FILE)

    const messages = renderTwoFrames(mods)

    expect(messages).toContain("Frame 1: 1 changes, MATCH")
    expect(fixedFileIdentity(CAPTURE_FILE)).toBe(before)
  })

  test("without the flags the output phase emits no size or capture text", () => {
    const beforeSizes = fixedFileIdentity(SIZES_FILE)
    const beforeCapture = fixedFileIdentity(CAPTURE_FILE)

    const messages = renderTwoFrames(staticModules)

    expect(messages.filter((m) => m.startsWith("changesToAnsi:") || /^Frame \d+:/.test(m))).toEqual(
      [],
    )
    expect(fixedFileIdentity(SIZES_FILE)).toBe(beforeSizes)
    expect(fixedFileIdentity(CAPTURE_FILE)).toBe(beforeCapture)
  })
})
