/**
 * @failure A pane app started with nobody answering its OSC 10/11/4 palette probe painted a guessed scheme background as a band, and never re-read the palette once a real terminal attached, resized it, focused it, or sent a color-scheme notice.
 * @level l3
 * @consumer @ag/code/21624-hab-attach-wrong-size
 * @testonly none
 *
 * The real path end to end: a `run()` fixture app under a real PTY, silvery's
 * one input parser, and the real render. The test is the terminal on the far
 * side of the PTY. It stays silent through the startup probe, which is the
 * headless pane service, and then answers OSC 10 and 11 like a terminal that
 * has attached. Cell backgrounds are read from a real emulator fed with
 * everything the app wrote.
 */

import { afterEach, describe, expect, test } from "vitest"
import { join } from "node:path"
import { createTerminal } from "@termless/core"
import { createXtermBackend } from "@termless/xtermjs"

const SILVERY_ROOT = join(import.meta.dirname, "../..")
const FIXTURE = join(import.meta.dirname, "fixtures/palette-reprobe-app.tsx")
const CLIENT_BG = { r: 0x10, g: 0x20, b: 0x30 }
const CLIENT_OSC_11 = "\x1b]11;rgb:1010/2020/3030\x07"
const CLIENT_OSC_10 = "\x1b]10;rgb:d0d0/d0d0/d0d0\x07"

interface Peer {
  /** From now on, answer OSC 10/11 queries like an attached terminal. */
  startAnswering(): void
  write(data: string): void
  resize(cols: number, rows: number): void
  /** Background of a screen cell, or null for the terminal default. */
  bgAt(row: number, col: number): { r: number; g: number; b: number } | null
  screenText(): string
  /** Every explicit (non-default) background on screen, as `row,col` keys. */
  explicitBackgrounds(): string[]
  describe(): string
  close(): Promise<void>
}

const peers: Peer[] = []
afterEach(async () => {
  await Promise.all(peers.splice(0).map((peer) => peer.close()))
})

function spawnApp(cols: number, rows: number): Peer {
  const emulator = createTerminal({ backend: createXtermBackend(), cols, rows })
  let size = { cols, rows }
  let answering = false
  let pending = ""
  let transcript = ""
  const decoder = new TextDecoder()

  const proc = Bun.spawn([process.execPath, FIXTURE], {
    cwd: SILVERY_ROOT,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      FORCE_COLOR: "3",
      SILVERY_COLOR: "",
    },
    terminal: {
      cols,
      rows,
      data(_terminal: unknown, data: Uint8Array) {
        const text = decoder.decode(data, { stream: true })
        transcript += text
        emulator.feed(text)
        if (!answering) return
        pending += text
        answerQueries()
      },
    },
  })
  const pty = proc.terminal as {
    write(data: string): void
    resize(cols: number, rows: number): void
    close(): void
  }

  function answerQueries(): void {
    for (;;) {
      const at = pending.search(/\x1b\]1[01];\?(?:\x07|\x1b\\)/)
      if (at === -1) break
      const code = pending.slice(at + 2, at + 4)
      pty.write(code === "11" ? CLIENT_OSC_11 : CLIENT_OSC_10)
      pending = pending.slice(at + 6)
    }
    // Keep a tail long enough to hold a query split across reads.
    if (pending.length > 16) pending = pending.slice(-16)
  }

  function screenRow(row: number): number {
    const scrollback = emulator.getScrollback()
    return scrollback.totalRows - scrollback.screenRows + row
  }

  const peer: Peer = {
    startAnswering() {
      answering = true
    },
    write(data) {
      pty.write(data)
    },
    resize(nextCols, nextRows) {
      size = { cols: nextCols, rows: nextRows }
      emulator.resize(nextCols, nextRows)
      pty.resize(nextCols, nextRows)
    },
    bgAt(row, col) {
      const bg = emulator.getCell(screenRow(row), col).bg
      return bg === null ? null : { r: bg.r, g: bg.g, b: bg.b }
    },
    screenText() {
      return emulator.getText()
    },
    explicitBackgrounds() {
      const found: string[] = []
      for (let row = 0; row < size.rows; row++) {
        for (let col = 0; col < size.cols; col++) {
          if (emulator.getCell(screenRow(row), col).bg !== null) found.push(`${row},${col}`)
        }
      }
      return found
    },
    describe() {
      const bg = peer.bgAt(size.rows - 2, size.cols - 2)
      return [
        `size ${size.cols}x${size.rows}, answering=${answering}, exit=${proc.exitCode}`,
        `bg at (${size.rows - 2},${size.cols - 2}) = ${JSON.stringify(bg)}`,
        `screen: ${JSON.stringify(emulator.getText().trim().slice(0, 200))}`,
        `transcript tail: ${JSON.stringify(transcript.slice(-400))}`,
      ].join("\n")
    },
    async close() {
      pty.close()
      proc.kill()
      await Promise.race([proc.exited, new Promise((resolve) => setTimeout(resolve, 2000))])
      if (proc.exitCode === null) proc.kill(9)
    },
  }
  peers.push(peer)
  return peer
}

async function until(peer: Peer, what: string, predicate: () => boolean, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}\n${peer.describe()}`)
}

async function startUnanswered(cols: number, rows: number): Promise<Peer> {
  const peer = spawnApp(cols, rows)
  await until(peer, "the first frame", () => peer.screenText().includes("palette-fixture"))
  return peer
}

describe("palette probe with nobody answering, then a terminal that answers", () => {
  test("an unanswered probe paints the terminal default background, never a guessed band", async () => {
    const peer = await startUnanswered(80, 24)
    expect(peer.explicitBackgrounds()).toEqual([])
  })

  test("a mode-2031 notice (CSI ? 997 ; 1 n) re-probes and repaints with the answering terminal's background", async () => {
    const peer = await startUnanswered(80, 24)
    peer.startAnswering()
    peer.write("\x1b[?997;1n")
    await until(peer, "the notice to repaint the canvas", () => {
      const bg = peer.bgAt(22, 78)
      return bg !== null && bg.r === CLIENT_BG.r && bg.g === CLIENT_BG.g && bg.b === CLIENT_BG.b
    })
    expect(peer.bgAt(0, 40)).toEqual(CLIENT_BG)
  })

  test("a focus-in (CSI I) after an unanswered probe re-probes and repaints", async () => {
    const peer = await startUnanswered(80, 24)
    peer.startAnswering()
    peer.write("\x1b[I")
    await until(peer, "the focus-in to repaint the canvas", () => {
      const bg = peer.bgAt(22, 78)
      return bg !== null && bg.r === CLIENT_BG.r && bg.g === CLIENT_BG.g && bg.b === CLIENT_BG.b
    })
  })

  test("the first resize after an unanswered probe re-probes: an attach at another size takes the client's background", async () => {
    const peer = await startUnanswered(80, 24)
    peer.startAnswering()
    peer.resize(120, 40)
    await until(peer, "the resize to repaint the canvas at 120x40", () => {
      const bg = peer.bgAt(38, 118)
      return bg !== null && bg.r === CLIENT_BG.r && bg.g === CLIENT_BG.g && bg.b === CLIENT_BG.b
    })
    expect(peer.bgAt(0, 0)).toEqual(CLIENT_BG)
  })
})
