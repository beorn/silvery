import { EventEmitter } from "node:events"
import { describe, expect, it } from "vitest"
import type { Key } from "@silvery/ag/keys"
import { createInputOwner } from "../src/runtime/input-owner"
import { keyToIslandAnsi } from "../src/runtime/event-handlers"

class FakeStdin extends EventEmitter {
  isTTY = true
  isRaw = false
  setRawMode(on: boolean): void {
    this.isRaw = on
  }
  resume(): void {}
  pause(): void {}
  setEncoding(_encoding: BufferEncoding): this {
    return this
  }
}

class FakeStdout {
  writes: string[] = []
  write(data: string): boolean {
    this.writes.push(data)
    return true
  }
}

function osc52ClipboardResponse(text: string): string {
  return `\x1b]52;c;${Buffer.from(text, "utf-8").toString("base64")}\x07`
}

describe("createInputOwner clipboard paste parsing", () => {
  it("decodes OSC52 clipboard responses into paste events before key parsing", () => {
    const stdin = new FakeStdin()
    const stdout = new FakeStdout()
    const input = createInputOwner(
      stdin as unknown as NodeJS.ReadStream,
      stdout as unknown as NodeJS.WriteStream,
      { enableBracketedPaste: false },
    )
    const pastes: string[] = []
    const keys: string[] = []
    input.onPaste((event) => pastes.push(event.text))
    input.onKey((event) => keys.push(event.input))

    stdin.emit("data", osc52ClipboardResponse("FROM_CLIPBOARD"))

    expect(pastes).toEqual(["FROM_CLIPBOARD"])
    expect(keys).toEqual([])
    input[Symbol.dispose]()
  })
})

describe("createInputOwner probe transactions", () => {
  it("retains split responses through a barrier and replays unrelated bytes once", async () => {
    const stdin = new FakeStdin()
    const stdout = new FakeStdout()
    const input = createInputOwner(
      stdin as unknown as NodeJS.ReadStream,
      stdout as unknown as NodeJS.WriteStream,
      { enableBracketedPaste: false },
    )
    const keys: string[] = []
    input.onKey((event) => keys.push(event.input))

    const transaction = input.probeTransaction({
      query: "QUERY+BARRIER",
      timeoutMs: 100,
      maxBufferBytes: 128,
      recognize(buffer) {
        const consumed: Array<{ start: number; end: number }> = []
        const ackStart = buffer.indexOf("ACK")
        if (ackStart >= 0) consumed.push({ start: ackStart, end: ackStart + 3 })
        const barrierStart = buffer.indexOf("BARRIER")
        if (barrierStart >= 0) consumed.push({ start: barrierStart, end: barrierStart + 7 })
        return barrierStart >= 0
          ? { status: "complete" as const, consumed, value: { acknowledged: ackStart >= 0 } }
          : { status: "pending" as const, consumed }
      },
    })

    expect(stdout.writes).toEqual(["QUERY+BARRIER"])
    stdin.emit("data", "jACK")
    expect(keys).toEqual([])
    stdin.emit("data", "BARRIER")

    await expect(transaction).resolves.toEqual({
      status: "complete",
      value: { acknowledged: true },
    })
    expect(keys).toEqual(["j"])
    input[Symbol.dispose]()
  })

  it("replays each unrelated input chunk with its original batch metadata", async () => {
    const stdin = new FakeStdin()
    const stdout = new FakeStdout()
    const input = createInputOwner(
      stdin as unknown as NodeJS.ReadStream,
      stdout as unknown as NodeJS.WriteStream,
      { enableBracketedPaste: false },
    )
    const batches: Array<number | undefined> = []
    const timestamps: Array<number | undefined> = []
    input.onMouse((event) => {
      batches.push(event.inputBatchId)
      timestamps.push(event.receivedAt)
    })
    const transaction = input.probeTransaction({
      query: "QUERY",
      timeoutMs: 100,
      maxBufferBytes: 128,
      recognize(buffer) {
        const consumed: Array<{ start: number; end: number }> = []
        for (const token of ["ACK", "BARRIER"]) {
          const start = buffer.indexOf(token)
          if (start >= 0) consumed.push({ start, end: start + token.length })
        }
        return buffer.includes("BARRIER")
          ? { status: "complete" as const, consumed, value: true }
          : { status: "pending" as const, consumed }
      },
    })

    stdin.emit("data", "\x1b[<35;2;1MACK")
    await new Promise<void>((resolve) => setImmediate(resolve))
    stdin.emit("data", "\x1b[<35;3;1MBARRIER")

    await expect(transaction).resolves.toEqual({ status: "complete", value: true })
    expect(batches).toHaveLength(2)
    expect(new Set(batches).size).toBe(2)
    expect(timestamps.every((timestamp) => Number.isFinite(timestamp))).toBe(true)
    expect(timestamps[0]).toBeLessThan(timestamps[1]!)
    input[Symbol.dispose]()
  })

  it("fails a second transaction loud without writing its query", async () => {
    const stdin = new FakeStdin()
    const stdout = new FakeStdout()
    const input = createInputOwner(
      stdin as unknown as NodeJS.ReadStream,
      stdout as unknown as NodeJS.WriteStream,
      { enableBracketedPaste: false },
    )
    const first = input.probeTransaction({
      query: "FIRST",
      timeoutMs: 100,
      maxBufferBytes: 128,
      recognize: () => ({ status: "pending", consumed: [] }),
    })

    await expect(
      input.probeTransaction({
        query: "SECOND",
        timeoutMs: 100,
        maxBufferBytes: 128,
        recognize: () => ({ status: "pending", consumed: [] }),
      }),
    ).resolves.toEqual({ status: "busy" })
    expect(stdout.writes).toEqual(["FIRST"])

    input[Symbol.dispose]()
    await expect(first).resolves.toEqual({ status: "error", reason: "disposed" })
  })

  it("fails overflow loud and replays known unrelated gaps in arrival order", async () => {
    const stdin = new FakeStdin()
    const stdout = new FakeStdout()
    const input = createInputOwner(
      stdin as unknown as NodeJS.ReadStream,
      stdout as unknown as NodeJS.WriteStream,
      { enableBracketedPaste: false },
    )
    const keys: string[] = []
    input.onKey((event) => keys.push(event.input))
    const transaction = input.probeTransaction({
      query: "QUERY",
      timeoutMs: 100,
      maxBufferBytes: 4,
      recognize(buffer) {
        const ackStart = buffer.indexOf("ACK")
        return {
          status: "pending" as const,
          consumed: ackStart < 0 ? [] : [{ start: ackStart, end: ackStart + 3 }],
        }
      },
    })

    stdin.emit("data", "jACK")
    expect(keys).toEqual([])
    stdin.emit("data", "k")

    await expect(transaction).resolves.toEqual({
      status: "overflow",
      maxBufferBytes: 4,
      receivedBytes: 5,
    })
    expect(keys).toEqual(["j", "k"])
    input[Symbol.dispose]()
  })

  it("returns typed timeout and treats it as no evidence while replaying gaps", async () => {
    const stdin = new FakeStdin()
    const stdout = new FakeStdout()
    const input = createInputOwner(
      stdin as unknown as NodeJS.ReadStream,
      stdout as unknown as NodeJS.WriteStream,
      { enableBracketedPaste: false },
    )
    const keys: string[] = []
    input.onKey((event) => keys.push(event.input))
    const transaction = input.probeTransaction({
      query: "QUERY",
      timeoutMs: 5,
      maxBufferBytes: 128,
      recognize(buffer) {
        const ackStart = buffer.indexOf("ACK")
        return {
          status: "pending" as const,
          consumed: ackStart < 0 ? [] : [{ start: ackStart, end: ackStart + 3 }],
        }
      },
    })

    stdin.emit("data", "jACK")
    await expect(transaction).resolves.toEqual({ status: "timeout" })
    expect(keys).toEqual(["j"])
    input[Symbol.dispose]()
  })

  it("writes queued ordinary probes only after transaction replay closes", async () => {
    const stdin = new FakeStdin()
    const stdout = new FakeStdout()
    const input = createInputOwner(
      stdin as unknown as NodeJS.ReadStream,
      stdout as unknown as NodeJS.WriteStream,
      { enableBracketedPaste: false },
    )
    const transaction = input.probeTransaction({
      query: "TRANSACTION",
      timeoutMs: 100,
      maxBufferBytes: 128,
      recognize(buffer) {
        const start = buffer.indexOf("BARRIER")
        return start < 0
          ? { status: "pending" as const, consumed: [] }
          : {
              status: "complete" as const,
              consumed: [{ start, end: start + 7 }],
              value: true,
            }
      },
    })
    const ordinary = input.probe({
      query: "ORDINARY",
      timeoutMs: 100,
      parse: (buffer) =>
        buffer === "RESPONSE" ? { result: "done", consumed: buffer.length } : null,
    })
    expect(stdout.writes).toEqual(["TRANSACTION"])

    stdin.emit("data", "BARRIER")
    await expect(transaction).resolves.toEqual({ status: "complete", value: true })
    expect(stdout.writes).toEqual(["TRANSACTION", "ORDINARY"])
    stdin.emit("data", "RESPONSE")
    await expect(ordinary).resolves.toBe("done")
    input[Symbol.dispose]()
  })

  it("counts an ordinary probe timeout from the call instead of queue activation", async () => {
    const stdin = new FakeStdin()
    const stdout = new FakeStdout()
    const input = createInputOwner(
      stdin as unknown as NodeJS.ReadStream,
      stdout as unknown as NodeJS.WriteStream,
      { enableBracketedPaste: false },
    )
    const transaction = input.probeTransaction({
      query: "TRANSACTION",
      timeoutMs: 100,
      maxBufferBytes: 128,
      recognize: () => ({ status: "pending", consumed: [] }),
    })
    const ordinary = input.probe({
      query: "ORDINARY",
      timeoutMs: 5,
      parse: () => null,
    })

    await expect(ordinary).resolves.toBeNull()
    expect(stdout.writes).toEqual(["TRANSACTION"])
    input[Symbol.dispose]()
    await expect(transaction).resolves.toEqual({ status: "error", reason: "disposed" })
  })

  it("resolves queued ordinary probes when disposal closes the transaction", async () => {
    const stdin = new FakeStdin()
    const stdout = new FakeStdout()
    const input = createInputOwner(
      stdin as unknown as NodeJS.ReadStream,
      stdout as unknown as NodeJS.WriteStream,
      { enableBracketedPaste: false },
    )
    const transaction = input.probeTransaction({
      query: "TRANSACTION",
      timeoutMs: 100,
      maxBufferBytes: 128,
      recognize: () => ({ status: "pending", consumed: [] }),
    })
    const ordinary = input.probe({
      query: "ORDINARY",
      timeoutMs: 100,
      parse: () => null,
    })

    input[Symbol.dispose]()

    await expect(transaction).resolves.toEqual({ status: "error", reason: "disposed" })
    await expect(
      Promise.race([
        ordinary,
        new Promise<"hung">((resolve) => setTimeout(() => resolve("hung"), 10)),
      ]),
    ).resolves.toBeNull()
  })

  it("rejects an invalid bound before writing the transaction query", async () => {
    const stdin = new FakeStdin()
    const stdout = new FakeStdout()
    const input = createInputOwner(
      stdin as unknown as NodeJS.ReadStream,
      stdout as unknown as NodeJS.WriteStream,
      { enableBracketedPaste: false },
    )

    await expect(
      input.probeTransaction({
        query: "UNBOUNDED",
        timeoutMs: 100,
        maxBufferBytes: Number.NaN,
        recognize: () => ({ status: "pending", consumed: [] }),
      }),
    ).resolves.toEqual({ status: "error", reason: "invalid-options" })
    expect(stdout.writes).toEqual([])
    input[Symbol.dispose]()
  })

  it("fails invalid consumed spans loud and replays the full buffer", async () => {
    const stdin = new FakeStdin()
    const stdout = new FakeStdout()
    const input = createInputOwner(
      stdin as unknown as NodeJS.ReadStream,
      stdout as unknown as NodeJS.WriteStream,
      { enableBracketedPaste: false },
    )
    const keys: string[] = []
    input.onKey((event) => keys.push(event.input))
    const transaction = input.probeTransaction({
      query: "QUERY",
      timeoutMs: 100,
      maxBufferBytes: 128,
      recognize: () => ({
        status: "complete",
        consumed: [{ start: 0, end: 0 }],
        value: true,
      }),
    })

    stdin.emit("data", "j")

    await expect(transaction).resolves.toEqual({
      status: "error",
      reason: "invalid-consumed-span",
    })
    expect(keys).toEqual(["j"])
    input[Symbol.dispose]()
  })

  it("keeps the last valid consumed spans when a later recognition is invalid", async () => {
    const stdin = new FakeStdin()
    const stdout = new FakeStdout()
    const input = createInputOwner(
      stdin as unknown as NodeJS.ReadStream,
      stdout as unknown as NodeJS.WriteStream,
      { enableBracketedPaste: false },
    )
    const keys: string[] = []
    input.onKey((event) => keys.push(event.input))
    const transaction = input.probeTransaction({
      query: "QUERY",
      timeoutMs: 100,
      maxBufferBytes: 128,
      recognize(buffer) {
        if (buffer.endsWith("k")) {
          return { status: "pending" as const, consumed: [{ start: 0, end: buffer.length + 1 }] }
        }
        const ackStart = buffer.indexOf("ACK")
        return {
          status: "pending" as const,
          consumed: ackStart < 0 ? [] : [{ start: ackStart, end: ackStart + 3 }],
        }
      },
    })

    stdin.emit("data", "jACK")
    stdin.emit("data", "k")

    await expect(transaction).resolves.toEqual({
      status: "error",
      reason: "invalid-consumed-span",
    })
    expect(keys).toEqual(["j", "k"])
    input[Symbol.dispose]()
  })

  it("defines consumed spans as UTF-16 offsets while bounding the buffer in UTF-8 bytes", async () => {
    const stdin = new FakeStdin()
    const stdout = new FakeStdout()
    const input = createInputOwner(
      stdin as unknown as NodeJS.ReadStream,
      stdout as unknown as NodeJS.WriteStream,
      { enableBracketedPaste: false },
    )
    const keys: string[] = []
    input.onKey((event) => keys.push(event.input))
    const transaction = input.probeTransaction({
      query: "QUERY",
      timeoutMs: 100,
      maxBufferBytes: 12,
      recognize(buffer) {
        const ackStart = buffer.indexOf("ACK")
        return {
          status: "complete" as const,
          consumed: [{ start: ackStart, end: ackStart + 3 }],
          value: true,
        }
      },
    })

    stdin.emit("data", "éACK")

    await expect(transaction).resolves.toEqual({ status: "complete", value: true })
    expect(keys).toEqual(["é"])
    input[Symbol.dispose]()
  })

  it("returns a typed recognizer error instead of throwing across stdin dispatch", async () => {
    const stdin = new FakeStdin()
    const stdout = new FakeStdout()
    const input = createInputOwner(
      stdin as unknown as NodeJS.ReadStream,
      stdout as unknown as NodeJS.WriteStream,
      { enableBracketedPaste: false },
    )
    const transaction = input.probeTransaction({
      query: "QUERY",
      timeoutMs: 100,
      maxBufferBytes: 128,
      recognize: () => {
        throw new Error("bad recognizer")
      },
    })

    expect(() => stdin.emit("data", "j")).not.toThrow()
    await expect(transaction).resolves.toMatchObject({
      status: "error",
      reason: "recognizer-threw",
      message: "Error: bad recognizer",
    })
    input[Symbol.dispose]()
  })
})

describe("keyToIslandAnsi — shifted symbols and hotkey preservation (25124)", () => {
  function makeKey(partial: Partial<Key>): Key {
    return {
      upArrow: false,
      downArrow: false,
      leftArrow: false,
      rightArrow: false,
      pageDown: false,
      pageUp: false,
      home: false,
      end: false,
      return: false,
      escape: false,
      ctrl: false,
      shift: false,
      tab: false,
      backspace: false,
      delete: false,
      meta: false,
      super: false,
      hyper: false,
      capsLock: false,
      numLock: false,
      ...partial,
    }
  }

  it("preserves shifted symbol keys when text is present (Kitty protocol)", () => {
    // Under Kitty keyboard protocol, input contains the unshifted key (e.g. "4"),
    // key.shift is true, and key.text contains the typed symbol (e.g. "$").
    const symbolCases: Array<{ input: string; key: Partial<Key>; expected: string }> = [
      { input: "`", key: { shift: true, text: "~" }, expected: "~" },
      { input: "1", key: { shift: true, text: "!" }, expected: "!" },
      { input: "2", key: { shift: true, text: "@" }, expected: "@" },
      { input: "3", key: { shift: true, text: "#" }, expected: "#" },
      { input: "4", key: { shift: true, text: "$" }, expected: "$" },
      { input: "5", key: { shift: true, text: "%" }, expected: "%" },
      { input: "6", key: { shift: true, text: "^" }, expected: "^" },
      { input: "7", key: { shift: true, text: "&" }, expected: "&" },
      { input: "8", key: { shift: true, text: "*" }, expected: "*" },
      { input: "9", key: { shift: true, text: "(" }, expected: "(" },
      { input: "0", key: { shift: true, text: ")" }, expected: ")" },
      { input: "-", key: { shift: true, text: "_" }, expected: "_" },
      { input: "=", key: { shift: true, text: "+" }, expected: "+" },
      { input: "[", key: { shift: true, text: "{" }, expected: "{" },
      { input: "]", key: { shift: true, text: "}" }, expected: "}" },
      { input: "\\", key: { shift: true, text: "|" }, expected: "|" },
      { input: ";", key: { shift: true, text: ":" }, expected: ":" },
      { input: "'", key: { shift: true, text: '"' }, expected: '"' },
      { input: ",", key: { shift: true, text: "<" }, expected: "<" },
      { input: ".", key: { shift: true, text: ">" }, expected: ">" },
      { input: "/", key: { shift: true, text: "?" }, expected: "?" },
    ]

    for (const c of symbolCases) {
      expect(keyToIslandAnsi(c.input, makeKey(c.key))).toBe(c.expected)
    }
  })

  it("encodes $((6*7)) arithmetic sequence without shift-stripping", () => {
    // Regression: $((6*7)) previously arrived as 49968700 due to shift-stripping
    const tokens: Array<{ input: string; key: Partial<Key>; expected: string }> = [
      { input: "4", key: { shift: true, text: "$" }, expected: "$" },
      { input: "9", key: { shift: true, text: "(" }, expected: "(" },
      { input: "9", key: { shift: true, text: "(" }, expected: "(" },
      { input: "6", key: { shift: false, text: "6" }, expected: "6" },
      { input: "8", key: { shift: true, text: "*" }, expected: "*" },
      { input: "7", key: { shift: false, text: "7" }, expected: "7" },
      { input: "0", key: { shift: true, text: ")" }, expected: ")" },
      { input: "0", key: { shift: true, text: ")" }, expected: ")" },
    ]
    const result = tokens.map((t) => keyToIslandAnsi(t.input, makeKey(t.key))).join("")
    expect(result).toBe("$((6*7))")
  })

  it("resolves legacy shifted symbols when text is not set", () => {
    expect(keyToIslandAnsi("4", makeKey({ shift: true }))).toBe("$")
    expect(keyToIslandAnsi("9", makeKey({ shift: true }))).toBe("(")
    expect(keyToIslandAnsi("0", makeKey({ shift: true }))).toBe(")")
    expect(keyToIslandAnsi("/", makeKey({ shift: true }))).toBe("?")
  })

  it("preserves control modifiers and special keys", () => {
    expect(keyToIslandAnsi("c", makeKey({ ctrl: true }))).toBe("\x03")
    expect(keyToIslandAnsi("g", makeKey({ ctrl: true }))).toBe("\x07")
    expect(keyToIslandAnsi("", makeKey({ escape: true }))).toBe("\x1b")
    expect(keyToIslandAnsi("", makeKey({ upArrow: true }))).toBe("\x1b[A")
    expect(keyToIslandAnsi("\r", makeKey({ return: true }))).toBe("\r")
  })
})
