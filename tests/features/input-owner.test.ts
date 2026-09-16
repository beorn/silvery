/**
 * Unit tests for InputOwner — the single-owner stdin mediator.
 *
 * These tests use a mock stdin/stdout pair so we can drive data events and
 * assert termios/listener lifecycle without touching a real TTY. Integration
 * with a silvery session + probeColors is covered separately in
 * `tests/features/input-owner-integration.test.tsx`.
 */

import { describe, it, expect, vi } from "vitest"
import { createInputOwner } from "@silvery/ag-term/runtime"
// Symbol-keyed helpers stay off the runtime barrel on purpose (they exist so
// Term.input's public API does not widen); reach them through the module.
import {
  getInputOwnerMouseInterpretation,
  setInputOwnerMouseOptions,
} from "../../packages/ag-term/src/runtime/input-owner"
import { createMouseUnitVerifier, type ParsedMouse } from "@silvery/ag-term/mouse"

// =============================================================================
// Mock stdin/stdout
// =============================================================================

function createMockIO(opts?: { isTTY?: boolean }) {
  const written: string[] = []
  const dataHandlers = new Set<(chunk: string) => void>()
  const isTTY = opts?.isTTY ?? true

  const rawState = { isRaw: false, paused: false, encoding: null as BufferEncoding | null }

  const stdout = {
    write: (data: string) => {
      written.push(data)
      return true
    },
    isTTY,
    columns: 80,
    rows: 24,
    on: () => {},
    off: () => {},
  } as unknown as NodeJS.WriteStream

  const stdin = {
    get isTTY() {
      return isTTY
    },
    get isRaw() {
      return rawState.isRaw
    },
    setRawMode(raw: boolean) {
      rawState.isRaw = raw
      return stdin
    },
    resume() {
      rawState.paused = false
    },
    pause() {
      rawState.paused = true
    },
    setEncoding(enc: BufferEncoding) {
      rawState.encoding = enc
    },
    on(event: string, handler: (...args: unknown[]) => void) {
      if (event === "data") dataHandlers.add(handler as (chunk: string) => void)
      return stdin
    },
    off(event: string, handler: (...args: unknown[]) => void) {
      if (event === "data") dataHandlers.delete(handler as (chunk: string) => void)
      return stdin
    },
    removeListener(event: string, handler: (...args: unknown[]) => void) {
      return stdin.off(event, handler)
    },
    listenerCount(event: string) {
      if (event === "data") return dataHandlers.size
      return 0
    },
  } as unknown as NodeJS.ReadStream

  function send(chunk: string) {
    // Clone the set so mutations during dispatch don't affect this pass.
    const handlers = Array.from(dataHandlers)
    for (const handler of handlers) handler(chunk)
  }

  return { stdin, stdout, written, send, rawState, dataHandlers }
}

// =============================================================================
// Tests
// =============================================================================

describe("InputOwner", () => {
  it("sets raw mode + encoding on construction, restores on dispose", () => {
    const { stdin, stdout, rawState } = createMockIO()
    const owner = createInputOwner(stdin, stdout)
    expect(rawState.isRaw).toBe(true)
    expect(rawState.encoding).toBe("utf8")
    expect(owner.active).toBe(true)

    owner.dispose()
    expect(rawState.isRaw).toBe(false)
    expect(rawState.paused).toBe(true)
    expect(owner.active).toBe(false)
  })

  it("is a no-op on non-TTY stdin (probes resolve null)", async () => {
    const { stdin, stdout, rawState } = createMockIO({ isTTY: false })
    using owner = createInputOwner(stdin, stdout)
    expect(rawState.isRaw).toBe(false)

    const result = await owner.probe({
      query: "\x1b]11;?\x07",
      parse: () => ({ result: "should-not-happen", consumed: 0 }),
      timeoutMs: 10,
    })
    expect(result).toBe(null)
  })

  it("resolves a probe when parse returns a result", async () => {
    const { stdin, stdout, send, written } = createMockIO()
    // enableBracketedPaste: false so the protocol bytes don't appear in the
    // written-stream assertion (this test focuses on probe I/O only).
    using owner = createInputOwner(stdin, stdout, { enableBracketedPaste: false })

    const probe = owner.probe<string>({
      query: "\x1b]11;?\x07",
      parse: (acc) => {
        const idx = acc.indexOf("\x07")
        if (idx === -1) return null
        return { result: acc.slice(0, idx + 1), consumed: idx + 1 }
      },
      timeoutMs: 500,
    })

    expect(written).toEqual(["\x1b]11;?\x07"])

    // Simulate terminal response
    send("\x1b]11;rgb:1a1a/1b1b/1c1c\x07")

    const result = await probe
    expect(result).toBe("\x1b]11;rgb:1a1a/1b1b/1c1c\x07")
    expect(owner.resolvedCount).toBe(1)
    expect(owner.timedOutCount).toBe(0)
  })

  it("times out a probe when no response arrives", async () => {
    const { stdin, stdout } = createMockIO()
    using owner = createInputOwner(stdin, stdout)

    const result = await owner.probe({
      query: "\x1b]11;?\x07",
      parse: () => null,
      timeoutMs: 20,
    })

    expect(result).toBe(null)
    expect(owner.timedOutCount).toBe(1)
    expect(owner.resolvedCount).toBe(0)
  })

  it("handles two concurrent probes — each resolves from its own slice", async () => {
    const { stdin, stdout, send } = createMockIO()
    using owner = createInputOwner(stdin, stdout)

    // First probe — matches OSC 10 (foreground)
    const fgProbe = owner.probe<string>({
      query: "\x1b]10;?\x07",
      parse: (acc) => {
        const prefix = "\x1b]10;"
        const start = acc.indexOf(prefix)
        if (start === -1) return null
        const end = acc.indexOf("\x07", start)
        if (end === -1) return null
        // Consume ONLY the matched prefix region (up to and including the BEL)
        return { result: acc.slice(start, end + 1), consumed: end + 1 }
      },
      timeoutMs: 500,
    })

    // Second probe — matches OSC 11 (background)
    const bgProbe = owner.probe<string>({
      query: "\x1b]11;?\x07",
      parse: (acc) => {
        const prefix = "\x1b]11;"
        const start = acc.indexOf(prefix)
        if (start === -1) return null
        const end = acc.indexOf("\x07", start)
        if (end === -1) return null
        return { result: acc.slice(start, end + 1), consumed: end + 1 }
      },
      timeoutMs: 500,
    })

    // Terminal replies to both in one chunk. FG parser runs first and consumes
    // its slice; buffer shrinks; BG parser runs next pass and consumes its slice.
    send("\x1b]10;rgb:aaaa/bbbb/cccc\x07\x1b]11;rgb:1111/2222/3333\x07")

    const [fg, bg] = await Promise.all([fgProbe, bgProbe])
    expect(fg).toBe("\x1b]10;rgb:aaaa/bbbb/cccc\x07")
    expect(bg).toBe("\x1b]11;rgb:1111/2222/3333\x07")
    expect(owner.resolvedCount).toBe(2)
  })

  it("drains on probe registration — previously-buffered bytes resolve new probes", async () => {
    const { stdin, stdout, send } = createMockIO()
    using owner = createInputOwner(stdin, stdout)

    // Bytes arriving before any probe register go straight through the event
    // parser. Use onKey to absorb them so the buffer drains.
    const keys: string[] = []
    owner.onKey((e) => keys.push(e.input))

    send("x")
    expect(keys).toEqual(["x"])

    // Now register a probe that matches a later chunk. The event parser
    // respects probe priority — registered probes drain first, leftover bytes
    // fall through to onKey.
    const p = owner.probe<number>({
      query: "",
      parse: (acc) => {
        if (acc.includes("ready")) return { result: 42, consumed: acc.length }
        return null
      },
      timeoutMs: 500,
    })

    send("ready")
    expect(await p).toBe(42)
  })

  it("fans parsed bytes to onKey subscribers (non-probe data path)", async () => {
    const { stdin, stdout, send } = createMockIO()
    using owner = createInputOwner(stdin, stdout)

    const keys: string[] = []
    const unsubscribe = owner.onKey((e) => keys.push(e.input))

    send("a")
    send("b")
    expect(keys).toEqual(["a", "b"])

    unsubscribe()
    send("c")
    expect(keys).toEqual(["a", "b"])
  })

  it("reassembles SGR mouse packets when ESC arrives in the previous stdin chunk", () => {
    const { stdin, stdout, send } = createMockIO()
    using owner = createInputOwner(stdin, stdout, {
      enableBracketedPaste: false,
      mouse: { coordinateMode: "pixel", cellSize: { width: 8, height: 16 } },
    })

    const keys: string[] = []
    const mouse: unknown[] = []
    owner.onKey((e) => keys.push(e.input))
    owner.onMouse((e) => mouse.push(e))

    send("\x1b")
    send("[<64;672;1488M")

    expect(keys).toEqual([])
    expect(mouse).toHaveLength(1)
    expect(mouse[0]).toMatchObject({
      action: "wheel",
      delta: -1,
      coordinateMode: "pixel",
      clientX: 671,
      clientY: 1487,
    })
  })

  it("buffers bracketed paste content split across stdin chunks", () => {
    const { stdin, stdout, send } = createMockIO()
    using owner = createInputOwner(stdin, stdout, { enableBracketedPaste: false })

    const keys: string[] = []
    const pastes: string[] = []
    owner.onKey((e) => keys.push(e.input))
    owner.onPaste((e) => pastes.push(e.text))

    send("\x1b[200~alpha ")

    expect(keys).toEqual([])
    expect(pastes).toEqual([])

    send("beta\x1b[201~")

    expect(keys).toEqual([])
    expect(pastes).toEqual(["alpha beta"])
  })

  it("buffers bracketed paste when the end marker is split across stdin chunks", () => {
    const { stdin, stdout, send } = createMockIO()
    using owner = createInputOwner(stdin, stdout, { enableBracketedPaste: false })

    const keys: string[] = []
    const pastes: string[] = []
    owner.onKey((e) => keys.push(e.input))
    owner.onPaste((e) => pastes.push(e.text))

    send("\x1b[200~payload\x1b[201")

    expect(keys).toEqual([])
    expect(pastes).toEqual([])

    send("~")

    expect(keys).toEqual([])
    expect(pastes).toEqual(["payload"])
  })

  it("preserves trailing input after complete paste protocols in one stdin chunk", () => {
    const cases = [
      { chunk: "\x1b[200~bracketed\x1b[201~\r", text: "bracketed" },
      {
        chunk: `\x1b]52;c;${Buffer.from("clipboard", "utf8").toString("base64")}\x07\r`,
        text: "clipboard",
      },
    ]

    for (const { chunk, text } of cases) {
      const { stdin, stdout, send } = createMockIO()
      using owner = createInputOwner(stdin, stdout, { enableBracketedPaste: false })
      const events: string[] = []
      owner.onPaste((event) => events.push(`paste:${event.text}`))
      owner.onKey((event) => {
        if (event.key.return) events.push("return")
      })

      send(chunk)

      expect(events).toEqual([`paste:${text}`, "return"])
    }
  })

  it("dispatches standalone Escape after the protocol disambiguation window", async () => {
    const { stdin, stdout, send } = createMockIO()
    using owner = createInputOwner(stdin, stdout, { enableBracketedPaste: false })

    const keys: Array<{ input: string; escape: boolean }> = []
    owner.onKey((e) => keys.push({ input: e.input, escape: e.key.escape }))

    send("\x1b")
    expect(keys).toEqual([])

    await new Promise<void>((resolve) => setTimeout(resolve, 40))
    expect(keys).toEqual([{ input: "", escape: true }])
  })

  it("probe parse gets priority — event parser only sees remainder", async () => {
    const { stdin, stdout, send } = createMockIO()
    using owner = createInputOwner(stdin, stdout)

    const keys: string[] = []
    owner.onKey((e) => keys.push(e.input))

    // Probe consumes "\x1b]11;...\x07" prefix; remainder "xy" falls through
    // to the event parser and arrives as two key events.
    const probe = owner.probe<string>({
      query: "",
      parse: (acc) => {
        const start = acc.indexOf("\x1b]11;")
        if (start !== 0) return null
        const end = acc.indexOf("\x07", start)
        if (end === -1) return null
        return { result: acc.slice(0, end + 1), consumed: end + 1 }
      },
      timeoutMs: 500,
    })

    send("\x1b]11;rgb:1a1a/1b1b/1c1c\x07xy")
    const parsed = await probe
    expect(parsed).toBe("\x1b]11;rgb:1a1a/1b1b/1c1c\x07")
    expect(keys).toEqual(["x", "y"])
  })

  it("dispose resolves pending probes with null", async () => {
    const { stdin, stdout } = createMockIO()
    const owner = createInputOwner(stdin, stdout)

    const probe = owner.probe({
      query: "\x1b]11;?\x07",
      parse: () => null,
      timeoutMs: 10_000, // long — we dispose before it fires
    })

    owner.dispose()
    expect(await probe).toBe(null)
  })

  it("dispose is idempotent", () => {
    const { stdin, stdout, rawState } = createMockIO()
    const owner = createInputOwner(stdin, stdout)

    owner.dispose()
    owner.dispose()
    owner.dispose()

    // Calling dispose repeatedly doesn't flip raw mode back on or throw.
    expect(rawState.isRaw).toBe(false)
    expect(owner.active).toBe(false)
  })

  it("dispose removes the single stdin listener", () => {
    const { stdin, stdout, dataHandlers } = createMockIO()
    const owner = createInputOwner(stdin, stdout)
    expect(dataHandlers.size).toBe(1)

    owner.dispose()
    expect(dataHandlers.size).toBe(0)
  })

  it("retainRawModeOnDispose=true — dispose removes listener but keeps raw=true", () => {
    // The session-handoff pattern: the probe owner disposes, but the
    // upcoming term-provider is about to set raw=true again. Toggling
    // off/on between is wasteful AND surfaces an extra termios transition
    // (breaks tests that assert on teardown event ordering).
    const { stdin, stdout, rawState, dataHandlers } = createMockIO()
    const owner = createInputOwner(stdin, stdout, { retainRawModeOnDispose: true })
    expect(rawState.isRaw).toBe(true)
    expect(dataHandlers.size).toBe(1)

    owner.dispose()
    // Listener released (so the next owner won't multi-dispatch bytes)…
    expect(dataHandlers.size).toBe(0)
    // …but raw mode stays on for the handoff.
    expect(rawState.isRaw).toBe(true)
  })

  it("does not re-enable raw mode on dispose when it started raw", () => {
    const { stdin, stdout, rawState } = createMockIO()
    // Simulate: an outer raw-mode setter (nested session) is already active.
    rawState.isRaw = true
    stdin.setRawMode(true)

    const owner = createInputOwner(stdin, stdout)
    // Owner observed wasRaw=true, so it didn't flip (idempotent).
    expect(rawState.isRaw).toBe(true)

    owner.dispose()
    // Owner didn't set raw, so it doesn't unset raw — respects the outer owner.
    expect(rawState.isRaw).toBe(true)
  })

  it("probe write failures resolve with null (don't hang)", async () => {
    // Expected: owner logs a warn on write failure. Silence it for this test.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const { stdin, stdout } = createMockIO()
      const failing = {
        ...stdout,
        write: () => {
          throw new Error("boom")
        },
      } as unknown as NodeJS.WriteStream
      using owner = createInputOwner(stdin, failing)

      const result = await owner.probe({
        query: "\x1b]11;?\x07",
        parse: () => ({ result: "never", consumed: 0 }),
        timeoutMs: 1000,
      })
      expect(result).toBe(null)
      expect(warnSpy).toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it("uses writeStdout override when provided (Output integration)", async () => {
    const { stdin, stdout } = createMockIO()
    const guarded: string[] = []
    using owner = createInputOwner(stdin, stdout, {
      enableBracketedPaste: false,
      writeStdout: (data) => {
        guarded.push(typeof data === "string" ? data : String(data))
        return true
      },
    })

    void owner.probe({ query: "probe-query", parse: () => null, timeoutMs: 10 })
    // Microtask so the probe's write() runs
    await new Promise((r) => setTimeout(r, 0))
    expect(guarded).toEqual(["probe-query"])
  })

  it("a parser that throws resolves the probe with null and doesn't block siblings", async () => {
    // Expected: owner logs a warn when a parser throws. Silence it for this test.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const { stdin, stdout, send } = createMockIO()
      using owner = createInputOwner(stdin, stdout)

      const bad = owner.probe({
        query: "",
        parse: () => {
          throw new Error("bad parser")
        },
        timeoutMs: 500,
      })
      const good = owner.probe<string>({
        query: "",
        parse: (acc) => (acc.length > 0 ? { result: acc, consumed: acc.length } : null),
        timeoutMs: 500,
      })

      send("hello")
      expect(await bad).toBe(null)
      expect(await good).toBe("hello")
      expect(warnSpy).toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })
})

// =============================================================================
// Mouse coordinate units — verified from the stream (@si/select/24649)
//
// SGR 1006 and SGR-Pixels 1016 events are byte-identical in shape. A
// multiplexer that answers the 14t/18t geometry probes and then forwards
// cell units under 1016 (herdr 0.9, measured 2026-09-16) must still land
// clicks on the right cell, and the interpretation in force must be readable.
// =============================================================================

describe("InputOwner mouse coordinate units", () => {
  const PIXEL = { coordinateMode: "pixel" as const, cellSize: { width: 14, height: 26 } }
  const grid = { cols: 151, rows: 73 }

  function ownerWithPixelOptions() {
    const io = createMockIO()
    const owner = createInputOwner(io.stdin, io.stdout, {
      enableBracketedPaste: false,
      mouse: PIXEL,
      size: () => grid,
    })
    const events: ParsedMouse[] = []
    owner.onMouse((e) => events.push(e))
    return { ...io, owner, events }
  }

  it("reads a negotiated pixel stream as cells until an event exceeds the grid", () => {
    const { owner, send, events } = ownerWithPixelOptions()
    // Exactly what herdr forwarded under 1016 in a 151x73 pane.
    send("\x1b[<35;91;13M")
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ x: 90, y: 12, coordinateMode: "cell", action: "move" })
    expect(events[0]!.clientX).toBeUndefined()
    expect(getInputOwnerMouseInterpretation(owner)).toMatchObject({
      units: "cell",
      negotiated: "pixel",
      pixelVerified: false,
      eventsSeen: 1,
      lastGrid: grid,
    })
    owner.dispose()
  })

  it("latches pixel units once an event is impossible under cell units", () => {
    const { owner, send, events } = ownerWithPixelOptions()
    send("\x1b[<35;91;13M") // fits the grid — cells
    send("\x1b[<0;1275;365M") // 1275 > 151 columns: only pixels can say this
    send("\x1b[<0;91;13m") // the first event's numbers again, now proven pixels
    expect(events.map((e) => [e.x, e.y, e.coordinateMode])).toEqual([
      [90, 12, "cell"],
      [1274 / 14, 364 / 26, "pixel"],
      [90 / 14, 12 / 26, "pixel"],
    ])
    expect(events[1]).toMatchObject({ clientX: 1274, clientY: 364 })
    expect(getInputOwnerMouseInterpretation(owner)).toMatchObject({
      units: "pixel",
      negotiated: "pixel",
      pixelVerified: true,
      verifiedAtEvent: 2,
      eventsSeen: 3,
    })
    owner.dispose()
  })

  it("proves pixel units from the row axis too", () => {
    const { owner, send, events } = ownerWithPixelOptions()
    send("\x1b[<0;10;100M") // y=100 > 73 rows
    expect(events[0]).toMatchObject({ coordinateMode: "pixel" })
    expect(getInputOwnerMouseInterpretation(owner).verifiedAtEvent).toBe(1)
    owner.dispose()
  })

  it("re-arms verification when the negotiated options change", () => {
    const { owner, send, events } = ownerWithPixelOptions()
    send("\x1b[<0;1275;365M")
    expect(getInputOwnerMouseInterpretation(owner).pixelVerified).toBe(true)
    setInputOwnerMouseOptions(owner, PIXEL)
    expect(getInputOwnerMouseInterpretation(owner)).toMatchObject({
      pixelVerified: false,
      eventsSeen: 0,
    })
    send("\x1b[<0;91;13M")
    expect(events.at(-1)).toMatchObject({ x: 90, y: 12, coordinateMode: "cell" })
    owner.dispose()
  })

  it("leaves a cell negotiation alone — nothing to verify", () => {
    const io = createMockIO()
    const owner = createInputOwner(io.stdin, io.stdout, {
      enableBracketedPaste: false,
      size: () => grid,
    })
    const events: ParsedMouse[] = []
    owner.onMouse((e) => events.push(e))
    io.send("\x1b[<0;1275;365M")
    expect(events[0]).toMatchObject({ x: 1274, y: 364, coordinateMode: "cell" })
    expect(getInputOwnerMouseInterpretation(owner)).toMatchObject({
      units: "cell",
      negotiated: "cell",
      pixelVerified: undefined,
    })
    owner.dispose()
  })
})

describe("createMouseUnitVerifier", () => {
  it("announces the unproven read once and the proof once", () => {
    const onChange = vi.fn()
    const verifier = createMouseUnitVerifier(
      { coordinateMode: "pixel", cellSize: { width: 14, height: 26 } },
      { size: () => ({ cols: 151, rows: 73 }), onChange },
    )
    verifier.parse("\x1b[<35;91;13M")
    verifier.parse("\x1b[<35;92;13M")
    verifier.parse("\x1b[<35;93;13M")
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]![1]).toBe("unproven")
    verifier.parse("\x1b[<0;1275;365M")
    verifier.parse("\x1b[<0;1276;365M")
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange.mock.calls[1]![1]).toBe("proven")
    expect(onChange.mock.calls[1]![0]).toMatchObject({ pixelVerified: true, verifiedAtEvent: 4 })
  })

  it("cannot prove anything against a grid the size source does not know", () => {
    const verifier = createMouseUnitVerifier(
      { coordinateMode: "pixel", cellSize: { width: 14, height: 26 } },
      { size: () => ({ cols: Number.NaN, rows: Number.NaN }) },
    )
    expect(verifier.parse("\x1b[<0;1275;365M")).toMatchObject({
      x: 1274,
      y: 364,
      coordinateMode: "cell",
    })
    expect(verifier.interpretation()).toMatchObject({ units: "cell", pixelVerified: false })
  })
})
