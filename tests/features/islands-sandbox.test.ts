/**
 * sandbox(inner) wrapper — IslandGuest query-neutralization.
 *
 * Phase 2.2 of `@km/silvery/15646-islands`. The sandbox wrapper intercepts
 * 8 OSC / DSR / DA query families the guest's process might emit, returning
 * canned responses without touching the real host terminal. This is what
 * unblocks `<Island guest={sandbox(ptyGuest(...))}>` in Phase 3 — the
 * recorded program's queries can't leak responses into the host frame.
 *
 * Coverage:
 *   1. synthesizeOSCResponse — direct exposure of the 8 query families:
 *      OSC 4 / 10 / 11, DSR 5 / 6, DA1 / DA2, window title.
 *   2. Unknown queries pass through (return undefined).
 *   3. sandbox(inner) preserves inner.capabilities.
 *   4. sandbox(inner) intercepts ctx.execOSC inside the inner.init context.
 *   5. Unknown OSC calls inside inner.init delegate to the outer ctx.execOSC
 *      (verifies pass-through path is connected).
 *   6. Custom SandboxOptions (background/foreground/ansi16/windowTitle)
 *      shape the responses.
 */

import { describe, expect, test, vi } from "vitest"
import { sandbox, snapshotGuest, synthesizeOSCResponse } from "@silvery/ag/island-guests"
import type { IslandContext, IslandGuest, IslandSignal } from "@silvery/ag/island-types"

// ────────────────────────────────────────────────────────────────────────────
// Test helpers
// ────────────────────────────────────────────────────────────────────────────

function fakeContext(execOSCMock?: (cmd: string) => Promise<string | void>): IslandContext & {
  execOSCCalls: string[]
} {
  const calls: string[] = []
  const ctx = {
    cols: 80,
    rows: 24,
    emit(_sig: IslandSignal) {},
    requestResize(_cols: number, _rows: number) {},
    async execOSC(command: string) {
      calls.push(command)
      if (execOSCMock) return execOSCMock(command)
      return undefined
    },
    abortSignal: new AbortController().signal,
    now() {
      return performance.now()
    },
    execOSCCalls: calls,
  }
  return ctx
}

// ────────────────────────────────────────────────────────────────────────────
// synthesizeOSCResponse — query coverage
// ────────────────────────────────────────────────────────────────────────────

describe("synthesizeOSCResponse — 8 query families", () => {
  test("OSC 4 ; idx ; ? → palette color response", () => {
    expect(synthesizeOSCResponse("\x1b]4;1;?\x07")).toMatch(/^\x1b]4;1;rgb:[\w/]+\x07$/)
    // Out-of-range index falls back to options.background (or default).
    expect(synthesizeOSCResponse("\x1b]4;999;?\x07")).toMatch(/^\x1b]4;999;rgb:[\w/]+\x07$/)
  })

  test("OSC 10 ; ? → foreground response", () => {
    const r = synthesizeOSCResponse("\x1b]10;?\x07")
    expect(r).toMatch(/^\x1b]10;rgb:[\w/]+\x07$/)
  })

  test("OSC 11 ; ? → background response", () => {
    const r = synthesizeOSCResponse("\x1b]11;?\x07")
    expect(r).toMatch(/^\x1b]11;rgb:[\w/]+\x07$/)
  })

  test("DSR 5 → device status report", () => {
    expect(synthesizeOSCResponse("\x1b[5n")).toBe("\x1b[0n")
  })

  test("DSR 6 → cursor position report (1;1)", () => {
    expect(synthesizeOSCResponse("\x1b[6n")).toBe("\x1b[1;1R")
  })

  test("DA1 → primary device attributes", () => {
    expect(synthesizeOSCResponse("\x1b[c")).toBe("\x1b[?62;1;6c")
    expect(synthesizeOSCResponse("\x1b[0c")).toBe("\x1b[?62;1;6c")
  })

  test("DA2 → secondary device attributes", () => {
    expect(synthesizeOSCResponse("\x1b[>c")).toBe("\x1b[>0;0;0c")
    expect(synthesizeOSCResponse("\x1b[>0c")).toBe("\x1b[>0;0;0c")
  })

  test("window title — CSI 21t + OSC 2/21", () => {
    expect(synthesizeOSCResponse("\x1b[21t")).toMatch(/^\x1b\]l.*\x1b\\$/)
    expect(synthesizeOSCResponse("\x1b]2;?\x07")).toMatch(/^\x1b\]l.*\x1b\\$/)
    expect(synthesizeOSCResponse("\x1b]21;?\x07")).toMatch(/^\x1b\]l.*\x1b\\$/)
  })

  test("unrecognized queries return undefined (caller passes through)", () => {
    expect(synthesizeOSCResponse("\x1b]52;c;dGVzdA==\x07")).toBeUndefined() // OSC 52 clipboard
    expect(synthesizeOSCResponse("\x1b[2J")).toBeUndefined() // clear screen
    expect(synthesizeOSCResponse("not an escape sequence")).toBeUndefined()
  })

  test("SandboxOptions.background shapes OSC 11 response", () => {
    const r = synthesizeOSCResponse("\x1b]11;?\x07", { background: "#abcdef" })
    expect(r).toContain("abab/cdcd/efef")
  })

  test("SandboxOptions.foreground shapes OSC 10 response", () => {
    const r = synthesizeOSCResponse("\x1b]10;?\x07", { foreground: "#123456" })
    expect(r).toContain("1212/3434/5656")
  })

  test("SandboxOptions.windowTitle shapes title response", () => {
    const r = synthesizeOSCResponse("\x1b[21t", { windowTitle: "my-app" })
    expect(r).toContain("my-app")
  })

  test("SandboxOptions.ansi16 overrides palette for OSC 4", () => {
    const r = synthesizeOSCResponse("\x1b]4;3;?\x07", {
      ansi16: ["#000", "#111", "#222", "#deadbe", "#444"],
    })
    expect(r).toContain("dede/adad/bebe")
  })
})

// ────────────────────────────────────────────────────────────────────────────
// sandbox(inner) wrapper
// ────────────────────────────────────────────────────────────────────────────

describe("sandbox(inner) — wrapper behavior", () => {
  test("preserves inner.capabilities verbatim", () => {
    const inner: IslandGuest = {
      capabilities: { input: true, modes: true, resize: true, palette: false },
      async init() {
        throw new Error("not called")
      },
    }
    const wrapped = sandbox(inner)
    expect(wrapped.capabilities).toEqual({
      input: true,
      modes: true,
      resize: true,
      palette: false,
    })
  })

  test("inner guest's execOSC for known query → sandbox response (no host call)", async () => {
    const ctx = fakeContext()
    let capturedCtx: IslandContext | null = null
    const inner: IslandGuest = {
      async init(innerCtx) {
        capturedCtx = innerCtx
        return await snapshotGuest({ cols: 1, rows: 1 }).init(innerCtx)
      },
    }
    const wrapped = sandbox(inner)
    await wrapped.init(ctx)
    expect(capturedCtx).toBeTruthy()
    const response = await capturedCtx!.execOSC("\x1b[5n")
    expect(response).toBe("\x1b[0n")
    // Host's execOSC was NOT called for the sandboxed query.
    expect(ctx.execOSCCalls).toEqual([])
  })

  test("inner guest's execOSC for unknown query → falls through to host ctx.execOSC", async () => {
    const ctx = fakeContext(async (cmd) => `host-saw:${cmd}`)
    let capturedCtx: IslandContext | null = null
    const inner: IslandGuest = {
      async init(innerCtx) {
        capturedCtx = innerCtx
        return await snapshotGuest({ cols: 1, rows: 1 }).init(innerCtx)
      },
    }
    const wrapped = sandbox(inner)
    await wrapped.init(ctx)
    // OSC 52 (clipboard write) — not in the sandbox's 8 families.
    const r = await capturedCtx!.execOSC("\x1b]52;c;dGVzdA==\x07")
    expect(r).toBe("host-saw:\x1b]52;c;dGVzdA==\x07")
    expect(ctx.execOSCCalls).toEqual(["\x1b]52;c;dGVzdA==\x07"])
  })

  test("SandboxOptions flow through to synthesized responses", async () => {
    const ctx = fakeContext()
    let capturedCtx: IslandContext | null = null
    const inner: IslandGuest = {
      async init(innerCtx) {
        capturedCtx = innerCtx
        return await snapshotGuest({ cols: 1, rows: 1 }).init(innerCtx)
      },
    }
    const wrapped = sandbox(inner, { background: "#abcdef", windowTitle: "wrapped-app" })
    await wrapped.init(ctx)
    expect(await capturedCtx!.execOSC("\x1b]11;?\x07")).toContain("abab/cdcd/efef")
    expect(await capturedCtx!.execOSC("\x1b[21t")).toContain("wrapped-app")
  })

  test("sandbox preserves other IslandContext fields (cols, rows, abortSignal, now)", async () => {
    const ctx = fakeContext()
    let capturedCtx: IslandContext | null = null
    const inner: IslandGuest = {
      async init(innerCtx) {
        capturedCtx = innerCtx
        return await snapshotGuest({ cols: 1, rows: 1 }).init(innerCtx)
      },
    }
    await sandbox(inner).init(ctx)
    expect(capturedCtx!.cols).toBe(80)
    expect(capturedCtx!.rows).toBe(24)
    expect(capturedCtx!.abortSignal).toBe(ctx.abortSignal)
    expect(typeof capturedCtx!.now()).toBe("number")
  })

  test("sandbox(snapshotGuest(...)) — smoke composition", async () => {
    const inner = snapshotGuest({ cells: [["A", "B"]] })
    const wrapped = sandbox(inner)
    const handle = await wrapped.init(fakeContext())
    expect(handle.output.buffer.getCell(0, 0).char).toBe("A")
    expect(handle.output.buffer.getCell(1, 0).char).toBe("B")
    // Capabilities passes through (snapshot declares none).
    expect(wrapped.capabilities).toBeUndefined()
    handle.dispose()
  })

  test("sandbox emit + requestResize delegate to outer ctx", async () => {
    const emit = vi.fn()
    const requestResize = vi.fn()
    const ctx: IslandContext = {
      cols: 40,
      rows: 10,
      emit,
      requestResize,
      async execOSC() {
        return undefined
      },
      abortSignal: new AbortController().signal,
      now() {
        return 0
      },
    }
    let capturedCtx: IslandContext | null = null
    const inner: IslandGuest = {
      async init(innerCtx) {
        capturedCtx = innerCtx
        return await snapshotGuest({ cols: 1, rows: 1 }).init(innerCtx)
      },
    }
    await sandbox(inner).init(ctx)
    capturedCtx!.emit({ type: "ready" })
    capturedCtx!.requestResize(80, 20)
    expect(emit).toHaveBeenCalledWith({ type: "ready" })
    expect(requestResize).toHaveBeenCalledWith(80, 20)
  })
})
