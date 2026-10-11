/**
 * Pre-enrollment security audit (hh 28598): one input sequence must not kill
 * or deafen the application. Bytes are injected on the emulated stdin
 * (`term.sendInput`), exactly as a terminal would send them. Each test asserts
 * the SECURE behaviour; a red test is a confirmed finding.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { Text, useInput } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"

const ESC = "\x1b"
const tick = (ms = 60) => new Promise<void>((r) => setTimeout(r, ms))

type Stdin = { sendInput: (s: string) => void }

function Probe({ seen }: { seen: string[] }) {
  useInput((input) => {
    seen.push(input)
  })
  return <Text>probe</Text>
}

async function start(opts: { mouse?: boolean } = {}) {
  const term = createTermless({ cols: 40, rows: 6 })
  const seen: string[] = []
  const handle = await run(<Probe seen={seen} />, term, opts)
  const send = (s: string) => (term as unknown as Stdin).sendInput(s)
  return { term, handle, seen, send }
}

describe("input stays alive after a malformed sequence", () => {
  test("control: a plain key reaches useInput", async () => {
    const { term, handle, seen, send } = await start()
    try {
      send("q")
      await tick()
      expect(seen).toContain("q")
    } finally {
      handle.unmount()
      term[Symbol.dispose]()
    }
  })

  test("a Kitty key with an out-of-range shifted codepoint does not stop later keys", async () => {
    const { term, handle, seen, send } = await start()
    try {
      send(`${ESC}[97:1114112u`)
      await tick()
      send("q")
      await tick()
      expect(seen).toContain("q")
    } finally {
      handle.unmount()
      term[Symbol.dispose]()
    }
  })

  test("an unterminated OSC 99 reply prefix does not swallow later keys", async () => {
    const { term, handle, seen, send } = await start()
    try {
      send(`${ESC}]99;`)
      await tick(300)
      send("q")
      await tick(300)
      expect(seen).toContain("q")
    } finally {
      handle.unmount()
      term[Symbol.dispose]()
    }
  })

  test("a bracketed-paste start with no end does not swallow later keys for good", async () => {
    const { term, handle, seen, send } = await start()
    try {
      send(`${ESC}[200~`)
      await tick(500)
      send("q")
      await tick(500)
      expect(seen).toContain("q")
    } finally {
      handle.unmount()
      term[Symbol.dispose]()
    }
  })

  test("control: Ctrl+C exits", async () => {
    const { term, handle, send } = await start()
    try {
      send("\x03")
      const exited = await Promise.race([handle.waitUntilExit().then(() => true), tick(1500).then(() => false)])
      expect(exited).toBe(true)
    } finally {
      handle.unmount()
      term[Symbol.dispose]()
    }
  })

  test("an unterminated CSI prefix does not swallow Ctrl+C", async () => {
    const { term, handle, send } = await start()
    try {
      send(`${ESC}[1;`)
      await tick(300)
      send("\x03")
      const exited = await Promise.race([handle.waitUntilExit().then(() => true), tick(1500).then(() => false)])
      expect(exited).toBe(true)
    } finally {
      handle.unmount()
      term[Symbol.dispose]()
    }
  })
})

describe("mouse reports with very large coordinates", () => {
  async function dragTo(y: number): Promise<number> {
    const { term, handle, send } = await start({ mouse: true })
    try {
      const t0 = performance.now()
      send(`${ESC}[<4;2;1M`) // shift + left press: raw screen-rectangle selection
      await tick(20)
      send(`${ESC}[<36;2;${y}M`) // shift + motion to row y
      await tick(20)
      send(`${ESC}[<4;2;${y}m`) // release at row y (copy on select)
      await tick(20)
      return performance.now() - t0
    } finally {
      handle.unmount()
      term[Symbol.dispose]()
    }
  }

  test("row 20,000 (off a 6-row screen) is clamped or cheap", async () => {
    const ms = await dragTo(20_000)
    console.log(`drag to row 20000: ${ms.toFixed(0)} ms`)
    expect(ms).toBeLessThan(1_000)
  }, 60_000)

  test("row 2,000,000 costs no more than row 20,000 (clamped to the screen)", async () => {
    const ms = await dragTo(2_000_000)
    console.log(`drag to row 2000000: ${ms.toFixed(0)} ms`)
    expect(ms).toBeLessThan(1_000)
  }, 120_000)

  test("row 50,000,000 costs no more than row 20,000 (a per-row loop would take seconds; a 400-digit row parses to Infinity and never ends)", async () => {
    const ms = await dragTo(50_000_000)
    console.log(`drag to row 50000000: ${ms.toFixed(0)} ms`)
    expect(ms).toBeLessThan(1_000)
  }, 120_000)

  async function dragAcross(x: number): Promise<number> {
    const { term, handle, send } = await start({ mouse: true })
    try {
      const t0 = performance.now()
      send(`${ESC}[<4;2;1M`)
      await tick(20)
      send(`${ESC}[<36;${x};1M`) // shift + motion to column x on the same row
      await tick(20)
      send(`${ESC}[<4;${x};1m`)
      await tick(20)
      return performance.now() - t0
    } finally {
      handle.unmount()
      term[Symbol.dispose]()
    }
  }

  test("column 50,000,000 on one row is clamped or cheap", async () => {
    const ms = await dragAcross(50_000_000)
    console.log(`drag to column 50000000: ${ms.toFixed(0)} ms`)
    expect(ms).toBeLessThan(1_000)
  }, 120_000)
})
