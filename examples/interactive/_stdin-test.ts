#!/usr/bin/env bun
/**
 * Bare stdin test — no React, no hightea.
 *
 * Tests whether Bun's stdin "readable" events deliver all keypresses.
 * Run in a real terminal (not through a tool): bun vendor/hightea/examples/interactive/_stdin-test.ts
 *
 * Type characters slowly. Each keypress should appear immediately.
 * Press Ctrl+C to exit.
 */

const fs = await import("node:fs")

const log = fs.createWriteStream("/tmp/stdin-test.log", { flags: "w" })
function logMsg(msg: string) {
  const ts = new Date().toISOString().slice(11, 23)
  log.write(`[${ts}] ${msg}\n`)
  process.stdout.write(msg + "\n")
}

logMsg("=== Bare stdin readable test ===")
logMsg("Type characters slowly. Press Ctrl+C to exit.")
logMsg("")

process.stdin.setEncoding("utf8")
process.stdin.setRawMode(true)
process.stdin.ref()

let count = 0

function handleReadable() {
  const chunk = process.stdin.read() as string | null
  if (chunk === null) {
    logMsg(`  readable event but stdin.read() returned null`)
    return
  }

  for (let i = 0; i < chunk.length; i++) {
    count++
    const ch = chunk[i]!
    const code = ch.charCodeAt(0)

    if (code === 3) {
      // Ctrl+C
      logMsg(`\n=== Total: ${count} keypresses ===`)
      log.end()
      process.stdin.setRawMode(false)
      process.stdin.unref()
      process.exit(0)
    }

    if (code >= 32 && code < 127) {
      logMsg(`#${count} char='${ch}' code=${code} chunkLen=${chunk.length}`)
    } else {
      logMsg(
        `#${count} code=0x${code.toString(16).padStart(2, "0")} chunkLen=${chunk.length} raw=${JSON.stringify(chunk.slice(i))}`,
      )
    }
  }

  // Try reading again in case more data
  const more = process.stdin.read() as string | null
  if (more !== null) {
    logMsg(`  EXTRA data in buffer: ${JSON.stringify(more)}`)
  }
}

process.stdin.on("readable", handleReadable)

logMsg("Listening for stdin readable events...")
logMsg("")
