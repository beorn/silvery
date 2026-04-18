/**
 * Event loop tests — the extracted `processEventBatch` substrate.
 *
 * These lock in the behavioral contract create-app.tsx will adopt:
 *   - Ctrl+C / Ctrl+Z interception fires BEFORE other events in the batch
 *   - onRender/onBarrier/onExit/onSuspend are called for matching effects
 *   - afterDispatch === false aborts the batch
 *   - afterDispatch === "flush" fires an extra barrier
 *   - Reentry guard inside the chain doesn't crash the loop
 */

import { describe, expect, test, vi } from "vitest"
import { pipe } from "../src/pipe"
import { createBaseApp } from "../src/runtime/base-app"
import {
  eventToOp,
  runEventBatch,
  type BatchedEvent,
} from "../src/runtime/event-loop"
import { withFocusChain } from "../src/runtime/with-focus-chain"
import { withInputChain } from "../src/runtime/with-input-chain"
import { withPasteChain } from "../src/runtime/with-paste-chain"
import { withTerminalChain, type KeyShape } from "../src/runtime/with-terminal-chain"

function mkApp(opts?: { focus?: { dispatchKey: (input: string, key: KeyShape) => boolean; active: boolean } }) {
  const base = pipe(createBaseApp(), withTerminalChain(), withPasteChain(), withInputChain)
  if (!opts?.focus) return base
  return pipe(
    base,
    withFocusChain({
      dispatchKey: opts.focus.dispatchKey,
      hasActiveFocus: () => opts.focus!.active,
    }),
  )
}

describe("eventToOp", () => {
  test("maps term:key to input:key", () => {
    expect(eventToOp({ type: "term:key", input: "j", key: { ctrl: false } })).toEqual({
      type: "input:key",
      input: "j",
      key: { ctrl: false },
    })
  })
  test("maps term:paste", () => {
    expect(eventToOp({ type: "term:paste", text: "hi" })).toEqual({ type: "term:paste", text: "hi" })
  })
  test("maps term:focus", () => {
    expect(eventToOp({ type: "term:focus", focused: true })).toEqual({ type: "term:focus", focused: true })
  })
  test("maps term:resize", () => {
    expect(eventToOp({ type: "term:resize", cols: 80, rows: 24 })).toEqual({
      type: "term:resize",
      cols: 80,
      rows: 24,
    })
  })
  test("returns null for unknown event types", () => {
    expect(eventToOp({ type: "mystery" } as unknown as BatchedEvent)).toBeNull()
  })
})

describe("runEventBatch — lifecycle interception", () => {
  test("empty batch → shouldExit=false, nothing called", async () => {
    const app = mkApp()
    const onRender = vi.fn()
    const onExit = vi.fn()
    const result = await runEventBatch(app, [], { onRender, onExit })
    expect(result).toBe(false)
    expect(onRender).not.toHaveBeenCalled()
    expect(onExit).not.toHaveBeenCalled()
  })

  test("Ctrl+C triggers onExit BEFORE remaining events dispatch", async () => {
    const app = mkApp()
    const seenResizes: unknown[] = []
    const onRender = vi.fn()
    const onExit = vi.fn((eff: unknown) => {
      // Capture the order: we MUST see exit before any subsequent render.
      seenResizes.push(`exit:${(eff as { reason?: string }).reason}`)
    })
    const batch: BatchedEvent[] = [
      { type: "term:resize", cols: 90, rows: 20 },
      { type: "term:key", input: "c", key: { ctrl: true, eventType: "press" } },
      { type: "term:resize", cols: 100, rows: 30 }, // should never be dispatched
    ]
    const exited = await runEventBatch(app, batch, { onRender, onExit })
    expect(exited).toBe(true)
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(seenResizes).toEqual(["exit:ctrl-c"])
    expect(onRender).not.toHaveBeenCalled()
  })

  test("Ctrl+Z triggers onSuspend, batch continues after suspend", async () => {
    const app = mkApp()
    const onSuspend = vi.fn()
    const onRender = vi.fn()
    const batch: BatchedEvent[] = [
      { type: "term:key", input: "z", key: { ctrl: true, eventType: "press" } },
      { type: "term:resize", cols: 100, rows: 30 },
    ]
    const exited = await runEventBatch(app, batch, { onSuspend, onRender })
    expect(exited).toBe(false) // Ctrl+Z does NOT exit
    expect(onSuspend).toHaveBeenCalledTimes(1)
    expect(onRender).toHaveBeenCalledTimes(1) // resize still dispatched
  })

  test("onInterrupt=false prevents Ctrl+C from exiting", async () => {
    const app = mkApp()
    const onExit = vi.fn()
    const onRender = vi.fn()
    const batch: BatchedEvent[] = [
      { type: "term:key", input: "c", key: { ctrl: true, eventType: "press" } },
      { type: "term:resize", cols: 100, rows: 30 },
    ]
    const exited = await runEventBatch(
      app,
      batch,
      { onExit, onRender },
      { lifecycle: { onInterrupt: () => false } },
    )
    expect(exited).toBe(false)
    expect(onExit).not.toHaveBeenCalled()
    // The Ctrl+C op still goes through the chain (modifier observer picks
    // it up) — but the suspend/exit was prevented.
    expect(app.terminal.modifiers.ctrl).toBe(true)
    expect(onRender).toHaveBeenCalledTimes(1) // resize
  })
})

describe("runEventBatch — per-event effects", () => {
  test("term:resize triggers exactly one onRender", async () => {
    const app = mkApp()
    const onRender = vi.fn()
    await runEventBatch(app, [{ type: "term:resize", cols: 80, rows: 24 }], { onRender })
    expect(onRender).toHaveBeenCalledTimes(1)
    expect(app.terminal.cols).toBe(80)
  })

  test("useInput handler returning 'exit' triggers onExit and aborts", async () => {
    const app = mkApp()
    app.input.register(() => "exit")
    const onExit = vi.fn()
    const onRender = vi.fn()
    const exited = await runEventBatch(
      app,
      [
        { type: "term:key", input: "q", key: { eventType: "press" } },
        { type: "term:resize", cols: 200, rows: 50 },
      ],
      { onExit, onRender },
    )
    expect(exited).toBe(true)
    expect(onExit).toHaveBeenCalledTimes(1)
    // Resize after exit should never run:
    expect(app.terminal.cols).toBe(80)
  })

  test("focus-chain consumes → useInput fallback never sees the key", async () => {
    const dispatchKey = vi.fn(() => true)
    const app = mkApp({ focus: { dispatchKey, active: true } })
    const seen: string[] = []
    app.input.register((input) => {
      seen.push(input)
    })
    await runEventBatch(app, [{ type: "term:key", input: "a", key: { eventType: "press" } }], {
      onRender: () => {},
    })
    expect(dispatchKey).toHaveBeenCalledWith("a", expect.objectContaining({ eventType: "press" }))
    expect(seen).toEqual([])
  })

  test("focus-chain pass-through → useInput fallback sees the key", async () => {
    const dispatchKey = vi.fn(() => false)
    const app = mkApp({ focus: { dispatchKey, active: true } })
    const seen: string[] = []
    app.input.register((input) => {
      seen.push(input)
    })
    await runEventBatch(app, [{ type: "term:key", input: "k", key: { eventType: "press" } }], {
      onRender: () => {},
    })
    expect(seen).toEqual(["k"])
  })

  test("paste event invokes onRender via withPasteChain", async () => {
    const app = mkApp()
    const got: string[] = []
    app.paste.register((text) => {
      got.push(text)
    })
    const onRender = vi.fn()
    await runEventBatch(app, [{ type: "term:paste", text: "pasted-body" }], { onRender })
    expect(got).toEqual(["pasted-body"])
    expect(onRender).toHaveBeenCalledTimes(1)
  })
})

describe("runEventBatch — afterDispatch hook", () => {
  test("afterDispatch === false exits the batch", async () => {
    const app = mkApp()
    const onExit = vi.fn()
    const afterDispatch = vi.fn((): false | void => false)
    const exited = await runEventBatch(
      app,
      [{ type: "term:resize", cols: 80, rows: 24 }],
      { afterDispatch, onExit },
    )
    expect(exited).toBe(true)
    expect(afterDispatch).toHaveBeenCalledTimes(1)
    expect(onExit).toHaveBeenCalledWith({ type: "exit", reason: "app-handler" })
  })

  test("afterDispatch === 'flush' fires onBarrier", async () => {
    const app = mkApp()
    const onBarrier = vi.fn()
    await runEventBatch(
      app,
      [{ type: "term:resize", cols: 80, rows: 24 }],
      { afterDispatch: () => "flush", onBarrier, onRender: () => {} },
    )
    expect(onBarrier).toHaveBeenCalledTimes(1)
  })

  test("afterDispatch returning nothing is a no-op", async () => {
    const app = mkApp()
    const onBarrier = vi.fn()
    await runEventBatch(
      app,
      [{ type: "term:resize", cols: 80, rows: 24 }],
      { afterDispatch: () => undefined, onBarrier, onRender: () => {} },
    )
    expect(onBarrier).not.toHaveBeenCalled()
  })
})

describe("runEventBatch — robustness", () => {
  test("a dispatch that throws does not hang the loop", async () => {
    const app = mkApp()
    // Register a handler that triggers reentrant dispatch — caught by base.
    app.input.register(() => {
      app.dispatch({ type: "noop" })
    })
    const origError = console.error
    console.error = () => {}
    try {
      await runEventBatch(
        app,
        [{ type: "term:key", input: "j", key: { eventType: "press" } }],
        { onRender: () => {} },
      )
    } finally {
      console.error = origError
    }
    // We reached here without hanging — event-loop recovered.
    expect(true).toBe(true)
  })

  test("unknown event types are skipped", async () => {
    const app = mkApp()
    const onRender = vi.fn()
    await runEventBatch(app, [{ type: "weird" } as unknown as BatchedEvent], { onRender })
    expect(onRender).not.toHaveBeenCalled()
  })

  test("onOtherEffect catches plugin-specific effects", async () => {
    const app = mkApp()
    // Install a plugin that emits a custom effect on paste.
    const prev = app.apply
    app.apply = (op) => {
      if (op.type === "term:paste") {
        const downstream = prev(op) || []
        return [...downstream, { type: "telemetry", kind: "paste-ingested" }]
      }
      return prev(op)
    }
    const onOther = vi.fn()
    await runEventBatch(app, [{ type: "term:paste", text: "x" }], {
      onRender: () => {},
      onOtherEffect: onOther,
    })
    expect(onOther).toHaveBeenCalledWith({ type: "telemetry", kind: "paste-ingested" })
  })
})
