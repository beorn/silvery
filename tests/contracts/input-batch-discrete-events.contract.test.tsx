/**
 * Contract: the keys in one input batch run with React discrete-event semantics.
 *
 * Several keys can arrive in ONE stdin chunk — agent send-text, a terminal
 * replaying buffered input, key repeat during a slow frame. The runtime
 * processes such a chunk as one batch and paints once for it. Each key's
 * handlers must still observe the React state that the previous key's
 * handlers committed, exactly as two separately delivered keys would:
 *
 *   - "\x1b[B\r" (ArrowDown, Enter) opens the row the cursor moved to, not the
 *     row it left — a ListView cursor plus an Enter handler reading
 *     `items[cursor]`, the yrd watch-pane shape.
 *   - "abc\r" submits "abc" read from the parent's text state.
 *   - A burst longer than React's 50-commit nested-update limit settles per
 *     key instead of throwing "Maximum update depth exceeded".
 *   - A bracketed paste stays ONE event, and the Enter after it observes it.
 *   - Layout and paint still run once per batch: the per-key commit is React
 *     reconciliation only.
 *   - An exit or abort key whose handler also schedules state still exits
 *     once, and nothing renders or paints after it, although that state
 *     commits before teardown.
 *
 * The rows run through `run()` AND `createApp().run()`; the exit row runs
 * through `createApp().run()` only, because its abort route is an app
 * handler. run() is a thin wrapper over createApp today; moving createApp's
 * processEventBatch onto @silvery/create's runEventBatch must keep both
 * entries green.
 *
 * @failure A key in the same stdin chunk as an earlier key acts on stale React
 *   state: Enter opens the row above the cursor, or submits the text as it was
 *   before the typed characters (28217).
 * @level l4
 * @consumer yrd watch pane open-on-Enter; agent send-text into run()/createApp() inputs
 * @testonly none
 */

import React, { useEffect, useState } from "react"
import { describe, expect, test } from "vitest"
import { createTermless, type TermlessTerm } from "@silvery/test"
import { silveryBenchStart, silveryBenchStop } from "@silvery/ag-term/pipeline"

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ListView, Text, TextInput, useInput } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"
import { createApp, useApp } from "../../packages/ag-term/src/runtime/create-app"
import { recentRenderOutputEvents } from "../../packages/ag-term/src/runtime/render-trace"

const COLS = 40
const ROWS = 10

type Mount = (element: React.ReactElement, term: TermlessTerm) => PromiseLike<{ unmount(): void }>

const ENTRIES: ReadonlyArray<readonly [string, Mount]> = [
  ["run()", (element, term) => run(element, term)],
  [
    "createApp().run()",
    // Input arrives through the termless term; frames feed its emulator.
    (element, term) =>
      createApp(() => () => ({})).run(element, {
        term,
        cols: COLS,
        rows: ROWS,
        writable: { write: (data: string) => term.write(data) },
      }),
  ],
]

/** Write raw bytes as ONE stdin chunk — the shape agent send-text produces. */
function sendChunk(term: TermlessTerm, bytes: string): void {
  ;(term as unknown as { sendInput(data: string): void }).sendInput(bytes)
}

const settle = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function waitUntil(condition: () => boolean, what: string, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}`)
    await settle(10)
  }
}

/** The runtime's per-batch diagnostics (create-app.tsx event loop). */
const batchDiagnostics = globalThis as {
  __silvery_batch_count?: number
  __silvery_last_batch_size?: number
}

describe.each(ENTRIES)("contract: one input batch, discrete events — %s", (_entry, mount) => {
  test("contract: Enter in the same chunk as ArrowDown opens the row the cursor moved to", async () => {
    const items = ["alpha", "beta", "gamma"]
    const opened: string[] = []

    function Picker() {
      const [cursor, setCursor] = useState(0)
      useInput((_input, key) => {
        if (key.return) opened.push(items[cursor]!)
      })
      return (
        <ListView
          items={items}
          nav
          cursorKey={cursor}
          onCursor={setCursor}
          height={5}
          renderItem={(item, index) => <Text>{index === cursor ? `> ${item}` : `  ${item}`}</Text>}
        />
      )
    }

    using term = createTermless({ cols: COLS, rows: ROWS })
    const handle = await mount(<Picker />, term)
    try {
      await waitUntil(() => term.screen.getText().includes("> alpha"), "the first paint")
      sendChunk(term, "\x1b[B\r")
      await waitUntil(() => opened.length > 0, "the Enter handler")
      expect(opened).toEqual(["beta"])
      await waitUntil(() => term.screen.getText().includes("> beta"), "the batch's frame")
    } finally {
      handle.unmount()
    }
  })

  test("contract: text typed in the same chunk as Enter is in the parent's state when Enter reads it", async () => {
    const submitted: string[] = []

    function Composer() {
      const [text, setText] = useState("")
      useInput((_input, key) => {
        if (key.return) submitted.push(text)
      })
      return <TextInput value={text} onChange={setText} prompt="> " placeholder="type here" />
    }

    using term = createTermless({ cols: COLS, rows: ROWS })
    const handle = await mount(<Composer />, term)
    try {
      await waitUntil(() => term.screen.getText().includes("type here"), "the first paint")
      sendChunk(term, "abc\r")
      await waitUntil(() => submitted.length > 0, "the Enter handler")
      expect(submitted).toEqual(["abc"])
    } finally {
      handle.unmount()
    }
  })

  test("contract: a burst longer than React's nested-update limit reaches every key", async () => {
    // TextInput syncs its controlled value in a passive effect, so every key's
    // commit schedules a follow-up update. 200 keys is four times React's
    // 50-commit nested-update limit: the burst must settle per key, not throw
    // "Maximum update depth exceeded" partway and drop that key's onChange.
    const burst = "abcdefghij".repeat(20)
    const changes: string[] = []
    const submitted: string[] = []

    function Composer() {
      const [text, setText] = useState("")
      useInput((_input, key) => {
        if (key.return) submitted.push(text)
      })
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

    using term = createTermless({ cols: COLS, rows: ROWS })
    const handle = await mount(<Composer />, term)
    try {
      await waitUntil(() => term.screen.getText().includes("type here"), "the first paint")
      sendChunk(term, `${burst}\r`)
      await waitUntil(() => submitted.length > 0, "the Enter handler")
      expect(changes).toHaveLength(burst.length)
      expect(changes.at(-1)).toBe(burst)
      expect(submitted).toEqual([burst])
    } finally {
      handle.unmount()
    }
  })

  test("contract: a bracketed paste stays one event, and Enter in the same chunk observes it", async () => {
    const log: string[] = []

    function PasteTarget() {
      const [text, setText] = useState("")
      useInput(
        (input, key) => {
          log.push(key.return ? `enter:${text}` : `key:${input}`)
        },
        {
          onPaste: (pasted) => {
            log.push(`paste:${pasted}`)
            setText((prev) => prev + pasted)
          },
        },
      )
      return <Text>text=[{text}]</Text>
    }

    using term = createTermless({ cols: COLS, rows: ROWS })
    const handle = await mount(<PasteTarget />, term)
    try {
      await waitUntil(() => term.screen.getText().includes("text=[]"), "the first paint")
      sendChunk(term, "\x1b[200~hello world\x1b[201~\r")
      await waitUntil(() => log.some((entry) => entry.startsWith("enter:")), "the Enter handler")
      // One paste event, no per-character key events, then Enter seeing the paste.
      expect(log).toEqual(["paste:hello world", "enter:hello world"])
    } finally {
      handle.unmount()
    }
  })

  test("contract: a multi-key batch commits per key yet lays out and paints once", async () => {
    const seen: number[] = []

    function Counter() {
      const [count, setCount] = useState(0)
      useInput((input) => {
        if (input !== "j") return
        seen.push(count)
        setCount(count + 1)
      })
      return <Text>count={count}</Text>
    }

    using term = createTermless({ cols: COLS, rows: ROWS })
    const handle = await mount(<Counter />, term)
    try {
      await waitUntil(() => term.screen.getText().includes("count=0"), "the first paint")
      await settle(50) // the app is idle: no frame in flight when counting starts
      const batchesBefore = batchDiagnostics.__silvery_batch_count ?? 0
      const writesBefore = term.out.events.length
      const phases = silveryBenchStart()
      try {
        sendChunk(term, "jjj")
        await waitUntil(() => seen.length === 3, "the third j")
        await settle(50) // the batch's frame, and anything it schedules
      } finally {
        silveryBenchStop()
      }

      // The three keys were ONE batch — otherwise this row proves nothing.
      expect(batchDiagnostics.__silvery_batch_count).toBe(batchesBefore + 1)
      expect(batchDiagnostics.__silvery_last_batch_size).toBe(3)
      // Layout ran once (one renderer pipeline pass) and paint ran once (one
      // frame written to the terminal) for the batch — not once per key.
      expect(phases.pipelineCalls).toBe(1)
      expect(term.out.events.length - writesBefore).toBe(1)
      // Yet each key's handler observed the previous key's committed state.
      expect(seen).toEqual([0, 1, 2])
      expect(term.screen.getText()).toContain("count=3")
    } finally {
      handle.unmount()
    }
  })

  test("contract: an update a key handler schedules after an await paints in the batch's own frame", async () => {
    // A handler that commits, then awaits once and commits again — the hab deck's split runs its state update one
    // microtask after the key because its dispatch awaits a target. That continuation lands in React's default lane,
    // outside the key's discrete scope, and must still be in the frame the batch paints, not in a later one.
    function Split() {
      const [state, setState] = useState("idle")
      useInput((input) => {
        if (input !== "v") return
        setState("chord-closed")
        void Promise.resolve().then(() => setState("split-done"))
      })
      return <Text>state={state}</Text>
    }

    using term = createTermless({ cols: COLS, rows: ROWS })
    const handle = await mount(<Split />, term)
    try {
      await waitUntil(() => term.screen.getText().includes("state=idle"), "the first paint")
      await settle(50) // the app is idle: no frame in flight when counting starts
      const writesBefore = term.out.events.length
      sendChunk(term, "v")
      await waitUntil(
        () => term.screen.getText().includes("state=split-done"),
        "the awaited update's paint",
      )
      await settle(100) // anything a late standalone frame would add
      // One frame for the batch, and it carries the continuation: never a frame of the intermediate state first.
      expect(term.out.events.length - writesBefore).toBe(1)
    } finally {
      handle.unmount()
    }
  })

  test("contract: a committing batch costs exactly one sweep pass, and the pass adds no layout or paint", async () => {
    // The sweep that carries an awaited continuation into the batch's frame is one more pass of the existing flush
    // loop, run when the batch's keys committed (28297). While SILVERY_TRACE_FRAMES names a directory, every painted
    // frame emits a RENDER_OUTPUT event with the batch's own doRender() count (the renderer resets it per batch),
    // early returns included, so the count is the cost even when the pass finds nothing dirty.
    const traceDir = mkdtempSync(join(tmpdir(), "silvery-batch-sweep-"))
    const savedTrace = process.env.SILVERY_TRACE_FRAMES
    process.env.SILVERY_TRACE_FRAMES = traceDir
    try {
      function Counter() {
        const [count, setCount] = useState(0)
        useInput((input) => {
          if (input === "j") setCount((value) => value + 1)
        })
        return <Text>count={count}</Text>
      }

      using term = createTermless({ cols: COLS, rows: ROWS })
      const handle = await mount(<Counter />, term)
      try {
        await waitUntil(() => term.screen.getText().includes("count=0"), "the first paint")
        await settle(50) // the app is idle: no frame in flight when counting starts
        const batchRenders = () => recentRenderOutputEvents().at(-1)?.renderCount ?? Number.NaN
        const press = async (key: string, shows: string) => {
          sendChunk(term, key)
          await waitUntil(() => term.screen.getText().includes(shows), shows)
          await settle(100) // the batch's frame, and anything it schedules
        }

        await press("j", "count=1") // the first key also flushes the mount's passive effects
        const writesBefore = term.out.events.length
        const phases = silveryBenchStart()
        try {
          await press("j", "count=2")
        } finally {
          silveryBenchStop()
        }
        // The batch render plus exactly one sweep pass (one before 28297)...
        expect(batchRenders()).toBe(2)
        // ...which renders nothing new here, so layout and paint still run once for the batch.
        expect(phases.pipelineCalls).toBe(1)
        expect(term.out.events.length - writesBefore).toBe(1)

        // A key no handler acts on: its batch's sweep pass is an early-return dirty check, so nothing is written.
        const batches = batchDiagnostics.__silvery_batch_count ?? 0
        const writesBeforeIdle = term.out.events.length
        sendChunk(term, "x")
        await waitUntil(
          () => (batchDiagnostics.__silvery_batch_count ?? 0) > batches,
          "the batch for x",
        )
        await settle(100)
        expect(term.out.events.length - writesBeforeIdle).toBe(0)
      } finally {
        handle.unmount()
      }
    } finally {
      if (savedTrace === undefined) delete process.env.SILVERY_TRACE_FRAMES
      else process.env.SILVERY_TRACE_FRAMES = savedTrace
      rmSync(traceDir, { recursive: true, force: true }) // raw-delete-allow: the trace dir this test made with mkdtempSync
    }
  })
})

/** How the exit key leaves the batch: chain exit, or the app handler aborting it. */
type ExitRoute = "useInput" | "app handler"

describe("contract: an exit key that also schedules state — createApp().run()", () => {
  test.each<[string, ExitRoute]>([
    ['a useInput handler returns "exit"', "useInput"],
    ['the app\'s term:key handler returns "exit", aborting the batch', "app handler"],
  ])(
    "contract: %s — the app exits once, and nothing renders or paints after it",
    async (_name, route) => {
      const log: string[] = []

      function Farewell({ label }: { label: string }) {
        useEffect(() => {
          log.push(`effect:${label}`)
        }, [label])
        useEffect(
          () => () => {
            log.push("unmount")
          },
          [],
        )
        return <Text>label={label}</Text>
      }

      function QuitOnQ() {
        const [label, setLabel] = useState("ready")
        useInput((input) => {
          if (input !== "q") return
          setLabel("bye")
          return "exit"
        })
        return <Farewell label={label} />
      }

      function StoreLabel() {
        return <Farewell label={useApp((state: { label: string }) => state.label)} />
      }

      using term = createTermless({ cols: COLS, rows: ROWS })
      const harness = {
        term,
        cols: COLS,
        rows: ROWS,
        writable: { write: (data: string) => term.write(data) },
      }
      const handle =
        route === "useInput"
          ? await createApp(() => () => ({})).run(<QuitOnQ />, harness)
          : await createApp(() => () => ({ label: "ready" }), {
              "term:key": (data, ctx) => {
                if ((data as { input: string }).input !== "q") return
                ctx.set({ label: "bye" })
                return "exit"
              },
            }).run(<StoreLabel />, harness)
      // createApp has no onExit option; its exit hook is the app scope's disposal.
      let exits = 0
      handle.scope.defer(() => {
        exits++
      })
      let exited = false
      void handle.waitUntilExit().then(() => {
        exited = true
      })
      try {
        await waitUntil(() => term.screen.getText().includes("label=ready"), "the first paint")
        await settle(50) // the app is idle: no frame in flight when counting starts
        const writesBefore = term.out.events.length
        const phases = silveryBenchStart()
        try {
          sendChunk(term, "q")
          await waitUntil(() => exited, "the exit")
          await settle(50) // anything the exit key's commit scheduled
        } finally {
          silveryBenchStop()
        }

        // The app exited once: one app-scope disposal, one unmount.
        expect(exits).toBe(1)
        expect(log.filter((entry) => entry === "unmount")).toHaveLength(1)
        // The exit key's update rendered nothing: no layout or content pass, no
        // terminal write, and the screen still shows the frame from before it.
        expect(phases.pipelineCalls).toBe(0)
        expect(term.out.events.length - writesBefore).toBe(0)
        expect(term.screen.getText()).toContain("label=ready")
        // The exit key's update did commit before teardown (each key is a
        // discrete event), so the expectations above saw that commit; without
        // it this row proves nothing.
        expect(log).toEqual(["effect:ready", "effect:bye", "unmount"])
      } finally {
        handle.unmount()
      }
    },
  )
})
