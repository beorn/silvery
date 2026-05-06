/**
 * Unit tests for term.modes — the single-owner terminal protocol modes.
 *
 * After the signals refactor, each mode is a callable alien-signals Signal.
 * Read via `modes.altScreen()`, write via `modes.altScreen(true)`, subscribe
 * via `effect(() => modes.altScreen())`. Idempotence is automatic (alien-
 * signals doesn't notify when the value doesn't change). Dispose writes
 * `false` to each ever-activated signal; the internal effects emit the
 * disable ANSI as a side-effect.
 */

import { describe, it, expect } from "vitest"
import { createModes, KittyFlags } from "@silvery/ag-term/runtime"
import { createTerm } from "@silvery/ag-term/ansi"
import { effect } from "@silvery/signals"

// =============================================================================
// Mock stdin (only the bits setRawMode touches)
// =============================================================================

function createMockStdin(opts?: { isTTY?: boolean }) {
  const isTTY = opts?.isTTY ?? true
  const state = { isRaw: false, setRawCalls: 0 }
  const stdin = {
    get isTTY() {
      return isTTY
    },
    get isRaw() {
      return state.isRaw
    },
    setRawMode(raw: boolean) {
      state.setRawCalls++
      state.isRaw = raw
      return stdin
    },
  } as unknown as NodeJS.ReadStream
  return { stdin, state }
}

function createRecordingWrite() {
  const writes: string[] = []
  const write = (data: string) => {
    writes.push(data)
  }
  return { write, writes, joined: () => writes.join("") }
}

// =============================================================================
// Tests
// =============================================================================

describe("createModes — construction", () => {
  it("does not emit any ANSI or termios change until a signal is written", () => {
    const { stdin, state } = createMockStdin()
    const { write, writes } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    expect(writes).toHaveLength(0)
    expect(state.setRawCalls).toBe(0)
    expect(modes.rawMode()).toBe(false)
    expect(modes.altScreen()).toBe(false)
    expect(modes.bracketedPaste()).toBe(false)
    expect(modes.kittyKeyboard()).toBe(false)
    expect(modes.mouse()).toBe(false)
    expect(modes.focusReporting()).toBe(false)
  })
})

describe("createModes — rawMode", () => {
  it("toggles stdin raw state and tracks it", () => {
    const { stdin, state } = createMockStdin()
    const { write } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    modes.rawMode(true)
    expect(state.isRaw).toBe(true)
    expect(modes.rawMode()).toBe(true)
    expect(state.setRawCalls).toBe(1)

    modes.rawMode(true) // idempotent — alien-signals no-op for same value
    expect(state.setRawCalls).toBe(1)
  })

  it("no-ops on non-TTY stdin but still tracks tendency", () => {
    const { stdin, state } = createMockStdin({ isTTY: false })
    const { write } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    modes.rawMode(true)
    // non-TTY: setRawMode on the stream isn't called, but our signal tracks intent
    expect(state.setRawCalls).toBe(0)
    expect(modes.rawMode()).toBe(true)
  })
})

describe("createModes — altScreen", () => {
  it("emits 1049h on enable and 1049l on disable, idempotent", () => {
    const { stdin } = createMockStdin()
    const { write, writes } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    modes.altScreen(true)
    expect(modes.altScreen()).toBe(true)
    expect(writes).toContain("\x1b[?1049h")

    const before = writes.length
    modes.altScreen(true) // idempotent
    expect(writes.length).toBe(before)

    modes.altScreen(false)
    expect(modes.altScreen()).toBe(false)
    expect(writes.at(-1)).toBe("\x1b[?1049l")
  })
})

describe("createModes — bracketedPaste", () => {
  it("emits 2004h / 2004l", () => {
    const { stdin } = createMockStdin()
    const { write, writes } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    modes.bracketedPaste(true)
    expect(writes).toContain("\x1b[?2004h")
    expect(modes.bracketedPaste()).toBe(true)

    modes.bracketedPaste(false)
    expect(writes.at(-1)).toBe("\x1b[?2004l")
    expect(modes.bracketedPaste()).toBe(false)
  })
})

describe("createModes — kittyKeyboard", () => {
  it("emits CSI > flags u on enable, CSI < u on disable", () => {
    const { stdin } = createMockStdin()
    const { write, writes } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    const flags = KittyFlags.DISAMBIGUATE | KittyFlags.REPORT_EVENTS
    modes.kittyKeyboard(flags)
    expect(writes).toContain(`\x1b[>${flags}u`)
    expect(modes.kittyKeyboard()).toBe(flags)

    modes.kittyKeyboard(false)
    expect(writes.at(-1)).toBe("\x1b[<u")
    expect(modes.kittyKeyboard()).toBe(false)
  })

  it("treats repeat-same-flags call as idempotent", () => {
    const { stdin } = createMockStdin()
    const { write, writes } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    modes.kittyKeyboard(11)
    const count = writes.length
    modes.kittyKeyboard(11)
    expect(writes.length).toBe(count)
  })

  it("emits fresh enable sequence when flags change from one bitfield to another", () => {
    const { stdin } = createMockStdin()
    const { write, writes } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    modes.kittyKeyboard(1)
    modes.kittyKeyboard(3)
    // Two distinct enable writes — values changed.
    const enables = writes.filter((w) => /\[>\d+u/.test(w))
    expect(enables).toEqual(["\x1b[>1u", "\x1b[>3u"])
  })
})

describe("createModes — mouse", () => {
  it("emits SGR mouse enable (1003+1006) / disable (1016l+1006l+1003l)", () => {
    const { stdin } = createMockStdin()
    const { write, writes } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    modes.mouse(true)
    // canonical sequence from @silvery/ansi: ?1003h + ?1006h
    expect(writes.at(-1)).toBe("\x1b[?1003h\x1b[?1006h")
    expect(modes.mouse()).toBe(true)

    modes.mouse(false)
    expect(writes.at(-1)).toBe("\x1b[?1016l\x1b[?1006l\x1b[?1003l")
    expect(modes.mouse()).toBe(false)
  })

  it("emits SGR-Pixels enable when mouse mode is pixel", () => {
    const { stdin } = createMockStdin()
    const { write, writes } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    modes.mouse("pixel")
    expect(writes.at(-1)).toBe("\x1b[?1003h\x1b[?1006h\x1b[?1016h")
    expect(modes.mouse()).toBe("pixel")
  })
})

describe("createModes — focusReporting", () => {
  it("emits 1004h / 1004l", () => {
    const { stdin } = createMockStdin()
    const { write, writes } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    modes.focusReporting(true)
    expect(writes.at(-1)).toBe("\x1b[?1004h")
    expect(modes.focusReporting()).toBe(true)

    modes.focusReporting(false)
    expect(writes.at(-1)).toBe("\x1b[?1004l")
    expect(modes.focusReporting()).toBe(false)
  })
})

describe("createModes — effect subscription", () => {
  it("effect(() => modes.altScreen()) fires on writes", () => {
    const { stdin } = createMockStdin()
    const { write } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    const observed: boolean[] = []
    const stop = effect(() => {
      observed.push(modes.altScreen())
    })

    // Seed read records the initial value.
    expect(observed).toEqual([false])

    modes.altScreen(true)
    expect(observed).toEqual([false, true])

    modes.altScreen(false)
    expect(observed).toEqual([false, true, false])

    // Same-value write is a no-op for alien-signals — no re-emission.
    modes.altScreen(false)
    expect(observed).toEqual([false, true, false])

    stop()
  })

  it("effect(() => modes.kittyKeyboard()) sees each distinct bitfield", () => {
    const { stdin } = createMockStdin()
    const { write } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    const observed: (number | false)[] = []
    const stop = effect(() => {
      observed.push(modes.kittyKeyboard())
    })

    modes.kittyKeyboard(1)
    modes.kittyKeyboard(1) // idempotent — no new emission
    modes.kittyKeyboard(3)
    modes.kittyKeyboard(false)

    expect(observed).toEqual([false, 1, 3, false])
    stop()
  })
})

describe("createTerm exposes modes on the Term interface", () => {
  it("headless Term: term.modes is a working Modes instance", () => {
    const term = createTerm({ cols: 80, rows: 24 })
    expect(term.modes).toBeDefined()
    expect(term.modes.rawMode()).toBe(false)

    term.modes.altScreen(true)
    expect(term.modes.altScreen()).toBe(true)

    term.modes.kittyKeyboard(KittyFlags.DISAMBIGUATE | KittyFlags.REPORT_EVENTS)
    expect(term.modes.kittyKeyboard()).toBe(3)

    term[Symbol.dispose]()
    // dispose flips state back to false
    expect(term.modes.altScreen()).toBe(false)
    expect(term.modes.kittyKeyboard()).toBe(false)
  })
})

describe("createModes — dispose", () => {
  it("restores ONLY modes that were activated, in correct order", () => {
    const { stdin, state } = createMockStdin()
    const { write, writes } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    modes.rawMode(true)
    modes.altScreen(true)
    modes.bracketedPaste(true)
    modes.kittyKeyboard(1)
    modes.mouse(true)
    modes.focusReporting(true)

    writes.length = 0 // clear so we only see dispose output
    modes[Symbol.dispose]()

    const output = writes.join("")
    // Order: focus → mouse → kitty → paste → alt-screen
    expect(output.indexOf("\x1b[?1004l")).toBeGreaterThanOrEqual(0)
    expect(output.indexOf("\x1b[?1006l\x1b[?1003l")).toBeGreaterThan(output.indexOf("\x1b[?1004l"))
    expect(output.indexOf("\x1b[<u")).toBeGreaterThan(output.indexOf("\x1b[?1006l\x1b[?1003l"))
    expect(output.indexOf("\x1b[?2004l")).toBeGreaterThan(output.indexOf("\x1b[<u"))
    expect(output.indexOf("\x1b[?1049l")).toBeGreaterThan(output.indexOf("\x1b[?2004l"))

    // Raw mode restored via termios, not ANSI
    expect(state.isRaw).toBe(false)

    // Signals cleared
    expect(modes.rawMode()).toBe(false)
    expect(modes.altScreen()).toBe(false)
    expect(modes.bracketedPaste()).toBe(false)
    expect(modes.kittyKeyboard()).toBe(false)
    expect(modes.mouse()).toBe(false)
    expect(modes.focusReporting()).toBe(false)
  })

  it("does nothing on dispose if nothing was activated", () => {
    const { stdin, state } = createMockStdin()
    const { write, writes } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    modes[Symbol.dispose]()
    expect(writes).toHaveLength(0)
    expect(state.setRawCalls).toBe(0)
  })

  it("ignores writes after dispose (no leak)", () => {
    const { stdin } = createMockStdin()
    const { write, writes } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    modes[Symbol.dispose]()
    writes.length = 0

    modes.rawMode(true)
    modes.altScreen(true)
    modes.mouse(true)
    expect(writes).toHaveLength(0)
  })

  it("is idempotent — second dispose is a no-op", () => {
    const { stdin } = createMockStdin()
    const { write, writes } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    modes.bracketedPaste(true)
    modes[Symbol.dispose]()
    const after = writes.length
    modes[Symbol.dispose]()
    expect(writes.length).toBe(after)
  })
})

// =============================================================================
// Phase 2 — modes.enable(name) returns a Disposable
// =============================================================================

describe("createModes — enable() returns a Disposable", () => {
  it("enables the named mode and returns a Disposable", () => {
    const { stdin } = createMockStdin()
    const { write } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    const handle = modes.enable("altScreen")
    expect(modes.altScreen()).toBe(true)
    expect(typeof handle[Symbol.dispose]).toBe("function")

    handle[Symbol.dispose]()
    expect(modes.altScreen()).toBe(false)
  })

  it("using-statement scopes a mode to a block and restores on exit", () => {
    const { stdin, state } = createMockStdin()
    const { write } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    expect(state.isRaw).toBe(false)
    {
      using _raw = modes.enable("rawMode")
      expect(modes.rawMode()).toBe(true)
      expect(state.isRaw).toBe(true)
    }

    expect(modes.rawMode()).toBe(false)
    expect(state.isRaw).toBe(false)
  })

  it("restores to the prior value (not just false)", () => {
    const { stdin } = createMockStdin()
    const { write } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    // Pre-enable the mode directly — a later nested enable() should restore
    // to `true`, not `false`.
    modes.altScreen(true)
    expect(modes.altScreen()).toBe(true)

    const handle = modes.enable("altScreen")
    expect(modes.altScreen()).toBe(true)
    handle[Symbol.dispose]()
    expect(modes.altScreen()).toBe(true) // stays true — prior value preserved
  })

  it("double-dispose is a no-op", () => {
    const { stdin } = createMockStdin()
    const { write } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    const handle = modes.enable("mouse")
    handle[Symbol.dispose]()
    expect(modes.mouse()).toBe(false)
    // Force mouse back on after first dispose; a second dispose must NOT
    // clobber the new state.
    modes.mouse(true)
    handle[Symbol.dispose]()
    expect(modes.mouse()).toBe(true)
  })

  it("composes with DisposableStack via .use(...)", () => {
    const { stdin, state } = createMockStdin()
    const { write } = createRecordingWrite()
    const modes = createModes({ write, stdin })

    {
      using stack = new DisposableStack()
      stack.use(modes.enable("altScreen"))
      stack.use(modes.enable("mouse"))
      stack.use(modes.enable("bracketedPaste"))
      expect(modes.altScreen()).toBe(true)
      expect(modes.mouse()).toBe(true)
      expect(modes.bracketedPaste()).toBe(true)
    }

    expect(modes.altScreen()).toBe(false)
    expect(modes.mouse()).toBe(false)
    expect(modes.bracketedPaste()).toBe(false)
    // rawMode was never touched.
    expect(state.isRaw).toBe(false)
  })
})
