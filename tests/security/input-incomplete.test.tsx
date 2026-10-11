/**
 * Pre-enrollment security audit (hh 28598 slice e): incomplete input
 * envelopes must not deafen the application.
 *
 * An unterminated OSC 99 reply prefix (F9), a bracketed-paste start with no
 * end (F10), or an unterminated CSI prefix (F12) used to be buffered forever
 * with no byte cap or timer. Later keys, Enter and Ctrl+C never reached a
 * handler. The contract: after a short bound the prefix is flushed and a
 * later key still arrives. F11 (parseBracketedPaste throw at three public
 * callers) is the same slice; its owner is those call sites, not this
 * liveness file.
 *
 * @failure An unterminated OSC 99, paste start, or CSI prefix swallows later
 *   keys or Ctrl+C until the process is killed.
 * @level l2
 * @consumer @silvery/ag-term createInputOwner (hh 28598 F9 F10 F12)
 * @testonly none
 */

import React from "react"
import { describe, expect, test } from "vitest"
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

async function start() {
  const term = createTermless({ cols: 40, rows: 6 })
  const seen: string[] = []
  const handle = await run(<Probe seen={seen} />, term)
  const send = (s: string) => (term as unknown as Stdin).sendInput(s)
  return { term, handle, seen, send }
}

describe("input stays alive after an incomplete envelope", () => {
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
      await tick(1200)
      send("q")
      await tick(300)
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
      const exited = await Promise.race([
        handle.waitUntilExit().then(() => true),
        tick(1500).then(() => false),
      ])
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
      const exited = await Promise.race([
        handle.waitUntilExit().then(() => true),
        tick(1500).then(() => false),
      ])
      expect(exited).toBe(true)
    } finally {
      handle.unmount()
      term[Symbol.dispose]()
    }
  })
})
