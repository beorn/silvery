/**
 * @reach fs-walk vendor/silvery/packages/**\/src/**
 */
import EventEmitter from "node:events"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Text } from "../../src/index.js"
import { createTerminalProfile } from "@silvery/ansi"
import { createTerm } from "../../packages/ag-term/src/ansi/term"
import type { ParsedMouse } from "../../packages/ag-term/src/mouse"
import { getInputOwnerMouseInterpretation } from "../../packages/ag-term/src/runtime/input-owner"
import { run, useInput } from "../../packages/ag-term/src/runtime/run"

function createMockTTY(): {
  stdin: NodeJS.ReadStream
  stdout: NodeJS.WriteStream
  output: () => string
  send: (data: string) => void
  stats: {
    readonly maxDataListeners: number
    readonly listenerlessWhileRaw: boolean
  }
} {
  const stdinEmitter = new EventEmitter()
  const stdoutEmitter = new EventEmitter()
  const chunks: string[] = []
  let raw = false
  let maxDataListeners = 0
  let listenerlessWhileRaw = false

  stdinEmitter.on("newListener", (event) => {
    if (event !== "data") return
    maxDataListeners = Math.max(maxDataListeners, stdinEmitter.listenerCount("data") + 1)
  })
  stdinEmitter.on("removeListener", (event) => {
    if (event !== "data") return
    if (raw && stdinEmitter.listenerCount("data") === 0) listenerlessWhileRaw = true
  })

  const stdin = Object.assign(stdinEmitter, {
    isTTY: true,
    get isRaw() {
      return raw
    },
    setRawMode(next: boolean) {
      raw = next
      return stdin
    },
    resume() {},
    pause() {},
    setEncoding() {},
  }) as unknown as NodeJS.ReadStream

  const stdout = Object.assign(stdoutEmitter, {
    isTTY: true,
    columns: 100,
    rows: 24,
    write(data: string | Uint8Array) {
      const text = typeof data === "string" ? data : new TextDecoder().decode(data)
      chunks.push(text)
      if (text.includes("\x1b[14t")) {
        queueMicrotask(() => stdinEmitter.emit("data", "\x1b[4;384;800t"))
      }
      if (text.includes("\x1b[18t")) {
        queueMicrotask(() => stdinEmitter.emit("data", "\x1b[8;24;100t"))
      }
      if (text.includes("\x1b[?u")) {
        queueMicrotask(() => stdinEmitter.emit("data", "\x1b[?7u"))
      }
      const widthMode = text.match(/\[\?(\d+)\$p/)
      if (widthMode) {
        queueMicrotask(() => stdinEmitter.emit("data", `\x1b[?${widthMode[1]};2$y`))
      }
      return true
    },
  }) as unknown as NodeJS.WriteStream

  return {
    stdin,
    stdout,
    output: () => chunks.join(""),
    send: (data) => stdinEmitter.emit("data", data),
    stats: {
      get maxDataListeners() {
        return maxDataListeners
      },
      get listenerlessWhileRaw() {
        return listenerlessWhileRaw
      },
    },
  }
}

describe("run() SGR-Pixels mouse default", () => {
  test("mouse=true auto-enables SGR-Pixels when cell-size probing succeeds", async () => {
    const { stdin, stdout, output } = createMockTTY()
    const handle = await run(<Text>hello</Text>, {
      stdin,
      stdout,
      profile: createTerminalProfile(),
      mouse: true,
    })

    expect(output()).toContain("\x1b[?1003h\x1b[?1006h\x1b[?1016h")
    handle.unmount()
  })

  test("startup negotiation keeps one uninterrupted stdin owner", async () => {
    const { stdin, stdout, send, stats } = createMockTTY()
    const received: string[] = []

    function App() {
      useInput((input) => {
        received.push(input)
      })
      return <Text>hello</Text>
    }

    using term = createTerm({ stdin, stdout })
    const handle = await run(<App />, term, {
      profile: createTerminalProfile(),
      mouse: true,
    })
    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(stats.maxDataListeners).toBe(1)
    expect(stats.listenerlessWhileRaw).toBe(false)
    expect(received).toEqual([])

    const mouseEvents: Array<{ coordinateMode: string; x: number; y: number }> = []
    const unsubscribe = term.input!.onMouse((event) => mouseEvents.push(event))
    send("\x1b[<64;81;41M")
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(mouseEvents).toHaveLength(1)
    expect(mouseEvents[0]).toMatchObject({ coordinateMode: "pixel", x: 10, y: 2.5 })
    unsubscribe()
    handle.unmount()
  })

  test("Kitty detection shares the canonical stdin owner", async () => {
    const { stdin, stdout, stats } = createMockTTY()
    const received: string[] = []

    function App() {
      useInput((input) => {
        received.push(input)
      })
      return <Text>hello</Text>
    }

    const handle = await run(<App />, {
      stdin,
      stdout,
      profile: createTerminalProfile({ caps: { kittyKeyboard: false } }),
      kitty: true,
      mouse: false,
      textSizing: false,
      widthDetection: false,
    })
    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(stats.maxDataListeners).toBe(1)
    expect(stats.listenerlessWhileRaw).toBe(false)
    expect(received).toEqual([])
    handle.unmount()
  })
})

// ============================================================================
// Coordinate units under 1016 on a real PTY — verified from the stream, never
// attested (@si/select/24649)
//
// The mock TTY above answers 14t/18t (384x800 px over 24x100 cells: an 8x16
// cell), so the runtime negotiates SGR-Pixels. SGR 1006 and 1016 bytes are
// shape-identical, and a multiplexer can answer every probe — DECRQM ?1016
// included — and still forward CELL units (herdr 0.9, measured 2026-09-16).
// Nothing on this side of the tty can tell, so on a real PTY the units are
// proven by the stream: an event whose wire coordinate exceeds the grid is
// impossible under cell units. Only run()'s emulator branch may attest pixel
// units (the terminal is in-process there); the two negative controls below
// pin that no real-PTY path can.
// ============================================================================

const tick = () => new Promise<void>((resolve) => setImmediate(resolve))

/** Reports what a component observes per mouse event, units included. */
function ClickProbe({ onEvent }: { onEvent: (e: ParsedMouse) => void }) {
  const record = (e: { nativeEvent: unknown }) => onEvent(e.nativeEvent as ParsedMouse)
  return (
    <Box width={100} height={24} onMouseDown={record} onMouseMove={record}>
      <Text>target</Text>
    </Box>
  )
}

describe("run() real-PTY branch — pixel units are proven by the stream", () => {
  test("a terminal that answers 14t but forwards cell units (herdr-shaped) still lands the click on its cell", async () => {
    const { stdin, stdout, output, send } = createMockTTY()
    using term = createTerm({ stdin, stdout })
    const handle = await run(<Text>hello</Text>, term, {
      profile: createTerminalProfile(),
      mouse: true,
    })
    await tick()
    expect(output(), "precondition: pixel mode was negotiated").toContain("\x1b[?1016h")

    const events: ParsedMouse[] = []
    const unsubscribe = term.input!.onMouse((event) => events.push(event))
    // Cell (30, 3), 1-indexed on the wire, although 1016 is on: fits 100x24.
    send("\x1b[<0;31;4M")
    await tick()

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ coordinateMode: "cell", x: 30, y: 3, action: "down" })
    expect(events[0]!.clientX).toBeUndefined()
    expect(getInputOwnerMouseInterpretation(term.input!)).toMatchObject({
      negotiated: "pixel",
      units: "cell",
      pixelVerified: false,
      provenBy: undefined,
      lastGrid: { cols: 100, rows: 24 },
    })
    unsubscribe()
    handle.unmount()
  })

  test("the documented residual: a pixel click inside the unproven corner reads as cells, and the next out-of-grid event proves pixels", async () => {
    const { stdin, stdout, send } = createMockTTY()
    using term = createTerm({ stdin, stdout })
    const handle = await run(<Text>hello</Text>, term, {
      profile: createTerminalProfile(),
      mouse: true,
    })
    await tick()

    const events: ParsedMouse[] = []
    const unsubscribe = term.input!.onMouse((event) => events.push(event))
    // A true pixel terminal's hover at cell (2, 0): pixel (16, 0) → wire (17, 1)
    // fits the grid, so it is read as cell (16, 0). Wrong by design here, never
    // silent — the event says which units were applied.
    send("\x1b[<35;17;1M")
    // cell (20, 3) → pixel (160, 48) → wire (161, 49): 161 > 100 columns proves pixels.
    send("\x1b[<35;161;49M")
    await tick()

    expect(events.map((e) => [e.coordinateMode, e.x, e.y, e.clientX])).toEqual([
      ["cell", 16, 0, undefined],
      ["pixel", 20, 3, 160],
    ])
    expect(getInputOwnerMouseInterpretation(term.input!)).toMatchObject({
      pixelVerified: true,
      provenBy: "stream",
      verifiedAtEvent: 2,
    })
    unsubscribe()
    handle.unmount()
  })

  test("negative control: a caller-supplied attestation is stripped on the Term path — the stream still owes the proof", async () => {
    const { stdin, stdout, send } = createMockTTY()
    using term = createTerm({ stdin, stdout })
    const handle = await run(<Text>hello</Text>, term, {
      profile: createTerminalProfile(),
      mouse: {
        coordinateMode: "pixel",
        cellSize: { width: 8, height: 16 },
        pixelUnitsAttested: true,
      },
    })
    await tick()

    expect(getInputOwnerMouseInterpretation(term.input!)).toMatchObject({
      negotiated: "pixel",
      pixelVerified: false,
      provenBy: undefined,
    })
    const events: ParsedMouse[] = []
    const unsubscribe = term.input!.onMouse((event) => events.push(event))
    send("\x1b[<0;31;4M")
    await tick()
    expect(events[0]).toMatchObject({ coordinateMode: "cell", x: 30, y: 3 })
    unsubscribe()
    handle.unmount()
  })

  test("negative control: a caller-supplied attestation is stripped on the options path too", async () => {
    const { stdin, stdout, send } = createMockTTY()
    const seen: ParsedMouse[] = []
    const handle = await run(<ClickProbe onEvent={(e) => seen.push(e)} />, {
      stdin,
      stdout,
      profile: createTerminalProfile(),
      mouse: {
        coordinateMode: "pixel",
        cellSize: { width: 8, height: 16 },
        pixelUnitsAttested: true,
      },
    })
    await tick()

    send("\x1b[<0;31;4M")
    await new Promise<void>((resolve) => setTimeout(resolve, 50))
    expect(seen.at(-1)).toMatchObject({ coordinateMode: "cell", x: 30, y: 3, action: "down" })
    handle.unmount()
  })

  test("negative control: the emulator branch is the only production writer of the attestation", () => {
    // Every package's src/ — a writer in ag or ag-react would be as wrong as one in ag-term.
    const packages = fileURLToPath(new URL("../../packages/", import.meta.url))
    const files: string[] = []
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "dist" || name === "tests") continue
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.tsx?$/.test(name) && path.includes(`${sep}src${sep}`)) files.push(path)
      }
    }
    walk(packages)
    expect(files.length).toBeGreaterThan(50)

    // One pattern for the inventory AND the count, so a writer spelled without
    // the space cannot pass one check and hide from the other.
    const writer = /pixelUnitsAttested\s*:\s*true/
    const writers = files.filter((file) => writer.test(readFileSync(file, "utf8")))
    expect(writers.map((file) => relative(packages, file))).toEqual(["ag-term/src/runtime/run.tsx"])

    // …exactly once, and inside run.tsx it sits in the emulator branch, not the real-PTY one.
    const text = readFileSync(join(packages, "ag-term/src/runtime/run.tsx"), "utf8")
    const sites = [...text.matchAll(new RegExp(writer.source, "g"))]
    expect(sites).toHaveLength(1)
    const at = sites[0]!.index
    expect(at).toBeGreaterThan(text.indexOf("async function resolveEmulatorMouseOption("))
    expect(at).toBeLessThan(text.indexOf("async function probeEmulatorMouseCellSize("))
    expect(at).toBeGreaterThan(text.indexOf("async function resolveMouseOption("))
  })
})
