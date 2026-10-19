/**
 * Contract: every render entry point's per-key input dispatch uses the one
 * shared discrete-event semantic (28255).
 *
 * `render()` (render.tsx), `renderToXterm()` and `renderToCanvas()` each used
 * to run a key as an inline `runWithDiscreteEvent(...)` plus
 * `reconciler.flushSyncWork()`. That commits the key's own update, but the
 * update its commit's passive effect schedules (TextInput syncing a
 * controlled value) stays on React's default lane, outside the flush. A burst
 * longer than React's 50-commit nested-update limit then throws "Maximum
 * update depth exceeded" and drops onChange calls — measured through
 * createApp for 28217, and the same exposure here.
 *
 * All three paths now call `dispatchDiscreteEvent`, which keeps the discrete
 * scope open through the flush, so each key's whole cascade settles before
 * the next key runs.
 *
 * @failure A burst of 200 keys in one input delivery drops onChange calls or
 *   throws "Maximum update depth exceeded" through render(), renderToXterm()
 *   or renderToCanvas() (28255).
 * @level l4
 * @consumer every app rendered through render(), renderToXterm() or renderToCanvas()
 * @testonly none
 */

import EventEmitter from "node:events"
import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { TextInput } from "../../src/index.js"
import { render } from "../../packages/ag-react/src/render"
import { renderToXterm } from "../../packages/ag-term/src/xterm"
import { renderToCanvas } from "../../packages/ag-react/src/ui/canvas"

const COLS = 40
const ROWS = 10

/** 200 keys — four times React's 50-commit nested-update limit. */
const BURST = "abcdefghij".repeat(20)

const settle = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function waitUntil(condition: () => boolean, what: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}`)
    await settle(10)
  }
}

/** A controlled TextInput whose onChange log is the per-key receipt. */
function createComposer(): { Composer: () => React.ReactElement; changes: string[] } {
  const changes: string[] = []
  function Composer() {
    const [text, setText] = useState("")
    return (
      <TextInput
        value={text}
        onChange={(next) => {
          changes.push(next)
          setText(next)
        }}
        placeholder="type here"
      />
    )
  }
  return { Composer, changes }
}

// ---------------------------------------------------------------------------
// render() — mock stdout + stdin, one stdin chunk per delivery.
// ---------------------------------------------------------------------------

function createMockStdout(cols = COLS, rows = ROWS) {
  const chunks: string[] = []
  const emitter = new EventEmitter()
  const mock = Object.create(emitter)
  mock.columns = cols
  mock.rows = rows
  mock.isTTY = true
  mock.writable = true
  mock.fd = 1
  mock.write = function (data: string | Uint8Array) {
    chunks.push(typeof data === "string" ? data : new TextDecoder().decode(data))
    return true
  }
  mock.end = function () {}
  mock.destroy = function () {}
  mock.on = emitter.on.bind(emitter)
  mock.off = emitter.off.bind(emitter)
  mock.once = emitter.once.bind(emitter)
  mock.emit = emitter.emit.bind(emitter)
  mock.removeListener = emitter.removeListener.bind(emitter)
  mock.addListener = emitter.addListener.bind(emitter)
  return {
    stream: mock as NodeJS.WriteStream,
    get output() {
      return chunks.join("")
    },
  }
}

function createMockStdin() {
  const emitter = new EventEmitter()
  let queue: string[] = []
  let readable = false
  const mock = Object.create(emitter)
  mock.isTTY = true
  mock.isRaw = false
  mock.fd = 0
  mock.setRawMode = function (mode: boolean) {
    mock.isRaw = mode
    return mock
  }
  mock.read = function (): string | null {
    if (queue.length === 0) {
      readable = false
      return null
    }
    return queue.shift() ?? null
  }
  mock.resume = function () {
    return mock
  }
  mock.pause = function () {
    return mock
  }
  mock.ref = function () {
    return mock
  }
  mock.unref = function () {
    return mock
  }
  mock.setEncoding = function () {
    return mock
  }
  mock.on = emitter.on.bind(emitter)
  mock.off = emitter.off.bind(emitter)
  mock.once = emitter.once.bind(emitter)
  mock.emit = emitter.emit.bind(emitter)
  mock.removeListener = emitter.removeListener.bind(emitter)
  mock.addListener = emitter.addListener.bind(emitter)
  mock.removeAllListeners = emitter.removeAllListeners.bind(emitter)
  mock.destroy = function () {
    queue = []
    emitter.removeAllListeners()
  }
  return {
    stream: mock as NodeJS.ReadStream,
    push(chunk: string): void {
      queue.push(chunk)
      if (!readable) {
        readable = true
        emitter.emit("readable")
      }
    },
  }
}

describe("discrete input dispatch — render()", () => {
  test(`render(): ${BURST.length} keys in one stdin chunk reach every onChange`, async () => {
    const { Composer, changes } = createComposer()
    const stdout = createMockStdout()
    const stdin = createMockStdin()
    const instance = await render(
      <Composer />,
      { stdout: stdout.stream, stdin: stdin.stream, width: COLS, height: ROWS },
      { stdin: stdin.stream },
    )
    try {
      await settle(50) // mount effects have subscribed the input handler
      stdin.push(BURST)
      await waitUntil(
        () => changes.length === BURST.length,
        `${BURST.length} onChanges (reached ${changes.length})`,
      )
      expect(changes.at(-1)).toBe(BURST)
    } finally {
      instance.unmount()
    }
  })
})

// ---------------------------------------------------------------------------
// renderToXterm() — one onData chunk per delivery.
// ---------------------------------------------------------------------------

describe("discrete input dispatch — renderToXterm()", () => {
  test(`renderToXterm(): ${BURST.length} keys in one onData chunk reach every onChange`, async () => {
    const { Composer, changes } = createComposer()
    let dataListener: ((data: string) => void) | null = null
    const terminal = {
      cols: COLS,
      rows: ROWS,
      write: () => {},
      onData: (cb: (data: string) => void) => {
        dataListener = cb
        return { dispose: () => {} }
      },
    }

    const instance = renderToXterm(<Composer />, terminal, { input: true })
    try {
      expect(dataListener).not.toBeNull()
      dataListener!(BURST)
      await waitUntil(
        () => changes.length === BURST.length,
        `${BURST.length} onChanges (reached ${changes.length})`,
      )
      expect(changes.at(-1)).toBe(BURST)
    } finally {
      instance.unmount()
    }
  })
})

// ---------------------------------------------------------------------------
// renderToCanvas() — the DOM delivers one keydown per key, so the burst is one
// synchronous dispatch loop rather than one chunk.
// ---------------------------------------------------------------------------

describe("discrete input dispatch — renderToCanvas()", () => {
  test(`renderToCanvas(): ${BURST.length} synchronous keydowns reach every onChange`, async () => {
    const { Composer, changes } = createComposer()

    const createMockCtx = () => ({
      setTransform: () => {},
      clearRect: () => {},
      drawImage: () => {},
      save: () => {},
      restore: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      setLineDash: () => {},
      fillText: () => {},
      measureText: () => ({ width: 10 }),
    })

    const listeners = new Map<string, (e: unknown) => void>()
    const mockTextarea = {
      style: {},
      setAttribute: () => {},
      addEventListener: (event: string, handler: (e: unknown) => void) => {
        listeners.set(event, handler)
      },
      removeEventListener: (event: string) => {
        listeners.delete(event)
      },
      focus: () => {},
      blur: () => {},
    }
    const mockContainer = {
      style: {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 200 }),
      appendChild: () => {},
      removeChild: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    const mockCanvas = {
      width: 400,
      height: 200,
      style: {},
      parentElement: mockContainer,
      getContext: () => createMockCtx(),
    }

    const prevDocument = globalThis.document
    globalThis.document = {
      createElement: (tag: string) => {
        if (tag === "textarea") return mockTextarea
        if (tag === "canvas") return { width: 400, height: 200, getContext: () => createMockCtx() }
        return { style: {}, setAttribute: () => {}, appendChild: () => {} }
      },
    } as unknown as Document

    let instance: ReturnType<typeof renderToCanvas> | undefined
    try {
      instance = renderToCanvas(<Composer />, mockCanvas as unknown as HTMLCanvasElement, {
        width: 400,
        height: 200,
        input: true,
      })

      const keydown = listeners.get("keydown")
      expect(keydown).toBeDefined()

      for (const char of BURST) {
        keydown!({ key: char, preventDefault: () => {}, stopPropagation: () => {} })
      }

      await waitUntil(
        () => changes.length === BURST.length,
        `${BURST.length} onChanges (reached ${changes.length})`,
      )
      expect(changes.at(-1)).toBe(BURST)
    } finally {
      instance?.unmount()
      globalThis.document = prevDocument
    }
  })
})
