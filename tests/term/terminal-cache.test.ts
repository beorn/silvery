/**
 * TerminalCache domain object tests.
 *
 * Verifies that createTerminalCache implements ListCache and writes
 * frozen items to stdout with optional OSC 133 markers.
 */

import { describe, test, expect, vi } from "vitest"
import { createTerminalCache } from "../../packages/term/src/terminal-cache"
import { isListCache } from "../../packages/term/src/list-cache"

interface Msg {
  id: string
  text: string
  done: boolean
}

const getKey = (item: Msg, _i: number) => item.id

function createMockStdout() {
  const written: string[] = []
  return {
    write(data: string) {
      written.push(data)
      return true
    },
    written,
  }
}

describe("createTerminalCache", () => {
  test("implements ListCache interface", () => {
    const stdout = createMockStdout()
    const cache = createTerminalCache<Msg>({
      render: (m) => m.text,
      stdout,
    })
    expect(isListCache(cache)).toBe(true)
  })

  test("computes contiguous frozen prefix", () => {
    const stdout = createMockStdout()
    const cache = createTerminalCache<Msg>({
      isCacheable: (m) => m.done,
      render: (m) => m.text,
      stdout,
    })

    const items: Msg[] = [
      { id: "1", text: "done msg", done: true },
      { id: "2", text: "also done", done: true },
      { id: "3", text: "pending", done: false },
    ]

    const count = cache.update(items, getKey)
    expect(count).toBe(2)
    expect(cache.frozenCount).toBe(2)
  })

  test("writes frozen items to stdout", () => {
    const stdout = createMockStdout()
    const cache = createTerminalCache<Msg>({
      isCacheable: (m) => m.done,
      render: (m) => m.text,
      stdout,
    })

    const items: Msg[] = [
      { id: "1", text: "first", done: true },
      { id: "2", text: "second", done: true },
      { id: "3", text: "pending", done: false },
    ]

    cache.update(items, getKey)

    // Should have written 2 items to stdout
    const allOutput = stdout.written.join("")
    expect(allOutput).toContain("first")
    expect(allOutput).toContain("second")
    expect(allOutput).not.toContain("pending")
  })

  test("only writes newly frozen items (not already frozen)", () => {
    const stdout = createMockStdout()
    const cache = createTerminalCache<Msg>({
      isCacheable: (m) => m.done,
      render: (m) => m.text,
      stdout,
    })

    const items1: Msg[] = [
      { id: "1", text: "first", done: true },
      { id: "2", text: "pending", done: false },
    ]

    cache.update(items1, getKey)
    const writeCount1 = stdout.written.length

    // Second update — item 1 already frozen, item 2 now done
    const items2: Msg[] = [
      { id: "1", text: "first", done: true },
      { id: "2", text: "pending", done: true },
    ]

    cache.update(items2, getKey)
    // Should have written only item 2 in the second update
    const newWrites = stdout.written.slice(writeCount1).join("")
    expect(newWrites).toContain("pending")
    expect(newWrites).not.toContain("first")
  })

  test("writes OSC 133 markers when markers=true", () => {
    const stdout = createMockStdout()
    const cache = createTerminalCache<Msg>({
      isCacheable: (m) => m.done,
      render: (m) => m.text,
      markers: true,
      stdout,
    })

    const items: Msg[] = [{ id: "1", text: "msg", done: true }]
    cache.update(items, getKey)

    const allOutput = stdout.written.join("")
    // OSC 133 prompt start marker
    expect(allOutput).toContain("\x1b]133;A\x07")
  })

  test("writes custom markers", () => {
    const stdout = createMockStdout()
    const cache = createTerminalCache<Msg>({
      isCacheable: (m) => m.done,
      render: (m) => m.text,
      markers: {
        before: (_m, i) => `[BEGIN ${i}]`,
        after: (_m, i) => `[END ${i}]`,
      },
      stdout,
    })

    const items: Msg[] = [{ id: "1", text: "msg", done: true }]
    cache.update(items, getKey)

    const allOutput = stdout.written.join("")
    expect(allOutput).toContain("[BEGIN 0]")
    expect(allOutput).toContain("[END 0]")
  })

  test("imperative freeze works", () => {
    const stdout = createMockStdout()
    const cache = createTerminalCache<Msg>({
      isCacheable: () => false,
      render: (m) => m.text,
      stdout,
    })

    cache.freeze("1")

    const items: Msg[] = [
      { id: "1", text: "manually frozen", done: false },
      { id: "2", text: "not frozen", done: false },
    ]

    const count = cache.update(items, getKey)
    expect(count).toBe(1)

    const allOutput = stdout.written.join("")
    expect(allOutput).toContain("manually frozen")
    expect(allOutput).not.toContain("not frozen")
  })

  test("getEntry returns cached entries", () => {
    const stdout = createMockStdout()
    const cache = createTerminalCache<Msg>({
      isCacheable: (m) => m.done,
      render: (m) => m.text,
      stdout,
    })

    const items: Msg[] = [
      { id: "1", text: "first", done: true },
      { id: "2", text: "pending", done: false },
    ]

    cache.update(items, getKey)
    expect(cache.getEntry("1")).toEqual({ key: "1", index: 0 })
    expect(cache.getEntry("2")).toBeUndefined()
  })

  test("clear resets state", () => {
    const stdout = createMockStdout()
    const cache = createTerminalCache<Msg>({
      isCacheable: (m) => m.done,
      render: (m) => m.text,
      stdout,
    })

    const items: Msg[] = [{ id: "1", text: "first", done: true }]
    cache.update(items, getKey)
    expect(cache.frozenCount).toBe(1)

    cache.clear()
    expect(cache.frozenCount).toBe(0)
    expect(cache.getEntry("1")).toBeUndefined()
  })

  test("fires freeze events", () => {
    const stdout = createMockStdout()
    const cache = createTerminalCache<Msg>({
      isCacheable: (m) => m.done,
      render: (m) => m.text,
      stdout,
    })

    const handler = vi.fn()
    cache.on("freeze", handler)

    const items: Msg[] = [{ id: "1", text: "first", done: true }]
    cache.update(items, getKey)

    expect(handler).toHaveBeenCalledWith({ key: "1", index: 0 })
  })

  test("config is accessible", () => {
    const stdout = createMockStdout()
    const cache = createTerminalCache<Msg>({
      capacity: 500,
      overscan: 10,
      render: (m) => m.text,
      stdout,
    })

    expect(cache.config.capacity).toBe(500)
    expect(cache.config.overscan).toBe(10)
  })

  test("uses \\r\\n line endings in stdout output", () => {
    const stdout = createMockStdout()
    const cache = createTerminalCache<Msg>({
      isCacheable: (m) => m.done,
      render: (m) => `line1\nline2`,
      stdout,
    })

    const items: Msg[] = [{ id: "1", text: "multi", done: true }]
    cache.update(items, getKey)

    const textWrites = stdout.written.filter((s) => s.includes("line"))
    expect(textWrites.some((s) => s.includes("\r\n"))).toBe(true)
  })
})
