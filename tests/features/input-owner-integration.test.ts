/**
 * Integration test — InputOwner routes probeColors + keeps key input alive.
 *
 * The race this structurally prevents (commits 2d9ab59f + cea0460b were the
 * tenant-side patches; this is the ownership fix): probeColors captures
 * `wasRaw=false` in its entry, runs OSC queries, and in its finally resets
 * raw=false — but meanwhile term-provider's events() generator has taken
 * over stdin and set raw=true, so the probe's finally kills host-TUI input.
 *
 * With an InputOwner owning stdin for the probe window, there is no
 * setRawMode(false) at all in the probe code path — the owner owns termios
 * lifecycle, the probe owns nothing.
 *
 * This test simulates the sequence end-to-end against a mock stdin/stdout:
 *   1. construct InputOwner
 *   2. probeColors({ input: owner, timeoutMs })
 *   3. emulator answers OSC 10 + 11 inline
 *   4. InputOwner disposes (probe window ends)
 *   5. A fresh listener attaches and observes that stdin bytes still route
 *      — demonstrating the owner's dispose didn't permanently disable input.
 */

import { describe, it, expect } from "vitest"
import { probeColors } from "@silvery/ansi"
import { createInputOwner } from "@silvery/ag-term/runtime"

function createMockIO() {
  const written: string[] = []
  const dataHandlers = new Set<(chunk: string) => void>()
  const state = { isRaw: false, paused: false }

  const stdout = {
    write: (data: string) => {
      written.push(data)
      // Simulate a terminal that answers the OSC queries inline.
      if (data === "\x1b]10;?\x07") {
        queueMicrotask(() => deliver("\x1b]10;rgb:eeee/eeee/eeee\x07"))
      } else if (data === "\x1b]11;?\x07") {
        queueMicrotask(() => deliver("\x1b]11;rgb:2626/2626/2626\x07"))
      } else if (data.startsWith("\x1b]4;") && data.endsWith("\x07")) {
        // A burst of 16 OSC 4 queries — answer a subset to simulate partial
        // responses (some terminals don't answer all 16).
        const answers: string[] = []
        for (let i = 0; i < 16; i++) {
          answers.push(`\x1b]4;${i};rgb:${hex2(i * 10)}/${hex2(i * 15)}/${hex2(i * 20)}\x07`)
        }
        queueMicrotask(() => deliver(answers.join("")))
      }
      return true
    },
    isTTY: true,
    columns: 80,
    rows: 24,
    on: () => {},
    off: () => {},
  } as unknown as NodeJS.WriteStream

  const stdin = {
    get isTTY() {
      return true
    },
    get isRaw() {
      return state.isRaw
    },
    setRawMode(raw: boolean) {
      state.isRaw = raw
      return stdin
    },
    resume() {
      state.paused = false
    },
    pause() {
      state.paused = true
    },
    setEncoding() {},
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
      return event === "data" ? dataHandlers.size : 0
    },
  } as unknown as NodeJS.ReadStream

  function deliver(chunk: string) {
    for (const handler of [...dataHandlers]) handler(chunk)
  }

  return { stdin, stdout, written, state, dataHandlers, deliver }
}

function hex2(n: number): string {
  const v = Math.min(255, Math.max(0, n))
  return v.toString(16).padStart(2, "0")
}

describe("InputOwner + probeColors integration", () => {
  it("routes probeColors through InputOwner and resolves with a detected scheme", async () => {
    const { stdin, stdout, written } = createMockIO()
    using owner = createInputOwner(stdin, stdout)

    const detected = await probeColors({ input: owner, timeoutMs: 500 })

    expect(detected).not.toBeNull()
    expect(detected!.fg).toBe("#eeeeee")
    expect(detected!.bg).toBe("#262626")
    // At least one OSC 4 slot populated from the palette burst
    expect(detected!.ansi.filter(Boolean).length).toBeGreaterThan(0)

    // Verify that the owner routed the expected queries
    expect(written.some((s) => s === "\x1b]10;?\x07")).toBe(true)
    expect(written.some((s) => s === "\x1b]11;?\x07")).toBe(true)
    expect(written.some((s) => s.startsWith("\x1b]4;0;?"))).toBe(true)
  })

  it("after dispose, stdin is releasable — host session's raw-mode is NOT stuck on", async () => {
    const { stdin, stdout, state, dataHandlers } = createMockIO()
    const owner = createInputOwner(stdin, stdout)
    expect(state.isRaw).toBe(true)
    expect(dataHandlers.size).toBe(1)

    await probeColors({ input: owner, timeoutMs: 50 })

    owner.dispose()
    // Owner set raw=true on construction → owner restored raw=false on dispose
    expect(state.isRaw).toBe(false)
    expect(dataHandlers.size).toBe(0)

    // Simulate what the term-provider does AFTER detection finishes: it
    // takes over stdin with its own setRawMode + listener. This is the
    // "host TUI input still works" assertion — the owner's dispose left
    // stdin in a state that the next owner can cleanly claim.
    stdin.setRawMode(true)
    const keys: string[] = []
    stdin.on("data", (chunk) => keys.push(chunk as unknown as string))
    expect(state.isRaw).toBe(true)

    // The mock's "deliver" function calls every registered listener — this
    // stands in for real stdin data arriving after the probe window closed.
    // If the owner had leaked a listener or flipped raw off, this wouldn't
    // reach our handler.
    for (const handler of [...dataHandlers]) handler("j")
    expect(keys).toEqual(["j"])
  })

  it("concurrent probeColors + fake key press — key event is not consumed by probe", async () => {
    const { stdin, stdout, deliver, dataHandlers } = createMockIO()
    using owner = createInputOwner(stdin, stdout)

    // Subscribe to typed key events — simulates the app listener registered
    // alongside the owner.
    const keys: string[] = []
    owner.onKey((e) => keys.push(e.input))

    // Kick off probeColors — its OSC queries will be answered by the mock
    const probeP = probeColors({ input: owner, timeoutMs: 500 })

    // Before the mock answers, inject a keypress. The owner must NOT
    // misattribute this to any probe parser — it should arrive on onKey.
    deliver("j")
    expect(keys).toEqual(["j"])

    // Meanwhile the queued OSC responses land — probeColors still resolves.
    const detected = await probeP
    expect(detected).not.toBeNull()
    expect(detected!.bg).toBe("#262626")

    // Another keypress after probe completed also routes to onKey.
    deliver("k")
    expect(keys).toEqual(["j", "k"])

    // dataHandlers on the mock still contains exactly 1 entry (the owner's).
    expect(dataHandlers.size).toBe(1)
  })
})
