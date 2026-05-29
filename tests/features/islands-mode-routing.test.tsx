/**
 * <Island> protocol-mode routing through createApp.
 *
 * Phase 1 of @km/silvery/15646-islands wires the pure focused-subtree
 * aggregator into the terminal runtime. The observable contract is at the
 * ANSI boundary: focused islands can request host protocol modes, blur
 * disables modes that only the island wanted, and IslandModesOwner changes
 * re-aggregate without remounting.
 */

import React from "react"
import { EventEmitter } from "node:events"
import { closeSync, openSync } from "node:fs"
import { describe, expect, test } from "vitest"
import { Box, Island, Text } from "@silvery/ag-react"
import { createCellBuffer } from "@silvery/ag/viewport-buffer"
import { run } from "../../packages/ag-term/src/runtime/run"
import type {
  IslandGuest,
  IslandHandle,
  IslandModesOwner,
  IslandProtocolModes,
} from "@silvery/ag/island-types"

interface Spy {
  setRawModeCalls: boolean[]
  setEncodingCalls: string[]
  dataListenerCount: number
}

function createFakeTtyStdin(): { stream: NodeJS.ReadStream; spy: Spy } {
  const spy: Spy = {
    setRawModeCalls: [],
    setEncodingCalls: [],
    dataListenerCount: 0,
  }
  const ee = new EventEmitter()
  const overrides = {
    isTTY: true as const,
    isRaw: false,
    fd: 0,
    read(): null {
      return null
    },
    resume(): NodeJS.ReadStream {
      return out
    },
    pause(): NodeJS.ReadStream {
      return out
    },
    ref(): NodeJS.ReadStream {
      return out
    },
    unref(): NodeJS.ReadStream {
      return out
    },
    setRawMode(mode: boolean): NodeJS.ReadStream {
      spy.setRawModeCalls.push(mode)
      overrides.isRaw = mode
      return out
    },
    setEncoding(enc: string): NodeJS.ReadStream {
      spy.setEncodingCalls.push(enc)
      return out
    },
  }
  const out = Object.assign(ee, overrides) as unknown as NodeJS.ReadStream
  ee.on("newListener", (event: string) => {
    if (event === "data") spy.dataListenerCount += 1
  })
  return { stream: out, spy }
}

function createFakeTtyStdout(): NodeJS.WriteStream & { written: string[]; closeFd: () => void } {
  const ee = new EventEmitter()
  const written: string[] = []
  const fd = openSync("/dev/null", "w")
  const stream = Object.assign(ee, {
    isTTY: true as const,
    columns: 80,
    rows: 24,
    fd,
    written,
    closeFd() {
      closeSync(fd)
    },
    write(data?: string | Uint8Array): true {
      if (data != null) {
        written.push(typeof data === "string" ? data : Buffer.from(data).toString("utf8"))
      }
      return true
    },
  })
  return stream as unknown as NodeJS.WriteStream & { written: string[]; closeFd: () => void }
}

function createModeGuest(initialModes: IslandProtocolModes) {
  let modes = initialModes
  const listeners = new Set<(next: IslandProtocolModes) => void>()
  const buffer = createCellBuffer(1, 1)

  const modesOwner: IslandModesOwner = {
    get modes() {
      return modes
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }

  const guest: IslandGuest = {
    capabilities: { input: true, modes: true },
    init(ctx) {
      const handle: IslandHandle = {
        size: {
          get cols() {
            return ctx.cols
          },
          get rows() {
            return ctx.rows
          },
          subscribe: () => () => {},
          requestResize: () => {},
        },
        output: {
          buffer,
          cursor: null,
          cursorVisible: false,
          subscribe: () => () => {},
          writeCells: () => {},
          invalidateAll: () => {},
        },
        modes: modesOwner,
        dispose: () => {},
      }
      ctx.emit({ type: "ready" })
      return Promise.resolve(handle)
    },
  }

  return {
    guest,
    setModes(next: IslandProtocolModes) {
      modes = next
      for (const listener of listeners) listener(next)
    },
  }
}

const KITTY_ENABLE_RE = /\x1b\[>\d*u/
const KITTY_DISABLE_RE = /\x1b\[<u/
const ALT_SCREEN_ENABLE_RE = /\x1b\[\?1049h/
const ALT_SCREEN_DISABLE_RE = /\x1b\[\?1049l/
const BRACKETED_PASTE_ENABLE_RE = /\x1b\[\?2004h/
const BRACKETED_PASTE_DISABLE_RE = /\x1b\[\?2004l/
const MOUSE_ENABLE_RE = /\x1b\[\?(?:1000|1002|1003|1006|1016)h/
const MOUSE_DISABLE_RE = /\x1b\[\?(?:1000|1002|1003|1006|1016)l/
const FOCUS_ENABLE_RE = /\x1b\[\?1004h/
const FOCUS_DISABLE_RE = /\x1b\[\?1004l/

function clearWrites(stdout: { written: string[] }): void {
  stdout.written.length = 0
}

describe("island protocol-mode routing", () => {
  test("focused island requests host input protocols under input:false; blur disables them", async () => {
    const { stream: stdin, spy } = createFakeTtyStdin()
    const stdout = createFakeTtyStdout()
    const modeGuest = createModeGuest({
      altScreen: true,
      bracketedPaste: true,
      kittyKeyboard: true,
      mouseTracking: "any",
      focusReporting: true,
    })

    const handle = await run(
      <Box flexDirection="column">
        <Island guest={modeGuest.guest} cols={1} rows={1} focusable />
        <Box testID="after" focusable>
          <Text>after</Text>
        </Box>
      </Box>,
      {
        stdin,
        stdout,
        cols: 80,
        rows: 24,
        mode: "inline",
        input: false,
        kitty: false,
        mouse: false,
        focusReporting: false,
        selection: false,
      },
    )

    try {
      clearWrites(stdout)
      await handle.press("Tab")
      const focused = stdout.written.join("")
      expect(ALT_SCREEN_ENABLE_RE.test(focused)).toBe(true)
      expect(BRACKETED_PASTE_ENABLE_RE.test(focused)).toBe(true)
      expect(KITTY_ENABLE_RE.test(focused)).toBe(true)
      expect(MOUSE_ENABLE_RE.test(focused)).toBe(true)
      expect(FOCUS_ENABLE_RE.test(focused)).toBe(true)
      expect(spy.setRawModeCalls).toEqual([])
      expect(spy.setEncodingCalls).toEqual([])
      expect(spy.dataListenerCount).toBe(0)

      clearWrites(stdout)
      await handle.press("Tab")
      const blurred = stdout.written.join("")
      expect(ALT_SCREEN_DISABLE_RE.test(blurred)).toBe(true)
      expect(BRACKETED_PASTE_DISABLE_RE.test(blurred)).toBe(true)
      expect(KITTY_DISABLE_RE.test(blurred)).toBe(true)
      expect(MOUSE_DISABLE_RE.test(blurred)).toBe(true)
      expect(FOCUS_DISABLE_RE.test(blurred)).toBe(true)
    } finally {
      handle.unmount()
      stdout.closeFd()
    }
  })

  test("IslandModesOwner.subscribe re-aggregates while focus stays on the island", async () => {
    const { stream: stdin } = createFakeTtyStdin()
    const stdout = createFakeTtyStdout()
    const modeGuest = createModeGuest({})

    const handle = await run(
      <Box flexDirection="column">
        <Island guest={modeGuest.guest} cols={1} rows={1} focusable />
        <Box testID="after" focusable>
          <Text>after</Text>
        </Box>
      </Box>,
      {
        stdin,
        stdout,
        cols: 80,
        rows: 24,
        mode: "inline",
        input: false,
        kitty: false,
        mouse: false,
        focusReporting: false,
        selection: false,
      },
    )

    try {
      await handle.press("Tab")
      clearWrites(stdout)
      modeGuest.setModes({ mouseTracking: "any", focusReporting: true })
      const enabled = stdout.written.join("")
      expect(MOUSE_ENABLE_RE.test(enabled)).toBe(true)
      expect(FOCUS_ENABLE_RE.test(enabled)).toBe(true)

      clearWrites(stdout)
      modeGuest.setModes({})
      const disabled = stdout.written.join("")
      expect(MOUSE_DISABLE_RE.test(disabled)).toBe(true)
      expect(FOCUS_DISABLE_RE.test(disabled)).toBe(true)
    } finally {
      handle.unmount()
      stdout.closeFd()
    }
  })
})
