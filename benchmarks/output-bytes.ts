/**
 * Output Bytes Measurement — Silvery vs Ink
 *
 * Measures bytes emitted per incremental update for both frameworks.
 * Not a throughput benchmark — this measures output size, which matters
 * for SSH, tmux, mosh, screen recorders, and tiling WMs.
 *
 * Run: bun benchmarks/output-bytes.ts
 */

import React from "react"
import { Writable } from "node:stream"
import { createRenderer } from "@silvery/test"
import { Box as SBox, Text as SText } from "silvery"
import { render as inkRender, Box as IBox, Text as IText } from "ink"

// Byte-counting mock stdout for Ink
function createCountingStdout(cols: number, rows: number) {
  let totalBytes = 0
  const stream = new Writable({
    write(chunk, _encoding, cb) {
      totalBytes += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length
      cb()
    },
  })
  Object.assign(stream, {
    columns: cols,
    rows,
    isTTY: true,
    getWindowSize: () => [cols, rows],
  })
  return {
    stream: stream as unknown as NodeJS.WriteStream,
    get bytes() {
      return totalBytes
    },
    reset() {
      totalBytes = 0
    },
  }
}

// Silvery: createRenderer uses headless term internally.
// The `ansi` property gives us the full ANSI output string.
// For incremental updates, we compare consecutive ansi outputs' byte sizes.
// But that gives the FULL frame, not the diff. We need the actual bytes sent.
//
// Use term.paint() to get the actual diff output.
import { createTerm } from "@silvery/ag-term"

function measureSilvery(cols: number, rows: number, items: number) {
  const render = createRenderer({ cols, rows })

  // Initial render with cursor at 0
  const app = render(
    React.createElement(
      SBox,
      { flexDirection: "column" },
      ...Array.from({ length: items }, (_, i) =>
        React.createElement(
          SBox,
          { key: i, backgroundColor: i === 0 ? "#334155" : undefined },
          React.createElement(SText, null, `Item ${i}: Some content here for a realistic line`),
        ),
      ),
    ),
  )

  // Move cursor: change bg on item 0 -> item 1
  app.rerender(
    React.createElement(
      SBox,
      { flexDirection: "column" },
      ...Array.from({ length: items }, (_, i) =>
        React.createElement(
          SBox,
          { key: i, backgroundColor: i === 1 ? "#334155" : undefined },
          React.createElement(SText, null, `Item ${i}: Some content here for a realistic line`),
        ),
      ),
    ),
  )

  // The app.ansi gives the full frame. For actual diff bytes,
  // we need to look at what term.paint() would emit.
  // In headless mode, the renderer tracks lastOutput internally.
  // Let's use the frames to compute the diff.
  const frames = (app as any).frames as string[] | undefined
  if (frames && frames.length >= 2) {
    return {
      initialBytes: Buffer.byteLength(frames[0]!),
      updateBytes: Buffer.byteLength(frames[frames.length - 1]!),
      frameCount: frames.length,
    }
  }
  // Fallback: full frame size
  return {
    initialBytes: Buffer.byteLength(app.ansi),
    updateBytes: Buffer.byteLength(app.ansi),
    frameCount: 1,
  }
}

function measureInk(cols: number, rows: number, items: number) {
  const stdout = createCountingStdout(cols, rows)

  const instance = inkRender(
    React.createElement(
      IBox,
      { flexDirection: "column" },
      ...Array.from({ length: items }, (_, i) =>
        React.createElement(
          IBox,
          { key: i },
          React.createElement(
            IText,
            { inverse: i === 0 },
            `Item ${i}: Some content here for a realistic line`,
          ),
        ),
      ),
    ),
    { stdout: stdout.stream, debug: true, incrementalRendering: true },
  )
  const initialBytes = stdout.bytes
  stdout.reset()

  // Move cursor
  instance.rerender(
    React.createElement(
      IBox,
      { flexDirection: "column" },
      ...Array.from({ length: items }, (_, i) =>
        React.createElement(
          IBox,
          { key: i },
          React.createElement(
            IText,
            { inverse: i === 1 },
            `Item ${i}: Some content here for a realistic line`,
          ),
        ),
      ),
    ),
  )
  const updateBytes = stdout.bytes

  instance.unmount()
  return { initialBytes, updateBytes }
}

// ============================================================================
// Measurements
// ============================================================================

console.log("\nOutput Bytes — cursor move (bg/inverse change, 2 items affected)\n")
console.log(
  "Scenario                    | Silvery  | Ink      | Ratio    | @100Kbps (Silvery) | @100Kbps (Ink)",
)
console.log(
  "----------------------------|----------|----------|----------|--------------------|--------------",
)

for (const [label, cols, rows, items] of [
  ["100 items, 80×24", 80, 24, 100],
  ["100 items, 200×60", 200, 60, 100],
  ["1000 items, 80×24", 80, 24, 1000],
  ["1000 items, 200×60", 200, 60, 1000],
] as const) {
  const s = measureSilvery(cols, rows, items)
  const ink = measureInk(cols, rows, items)

  const ratio = ink.updateBytes / s.updateBytes
  const sMs100k = (((s.updateBytes * 8) / 100_000) * 1000).toFixed(1) // ms at 100 Kbps
  const iMs100k = (((ink.updateBytes * 8) / 100_000) * 1000).toFixed(1)

  console.log(
    `${label.padEnd(28)}| ${String(s.updateBytes).padEnd(9)}| ${String(ink.updateBytes).padEnd(9)}| ${ratio.toFixed(1).padEnd(9)}| ${(sMs100k + "ms").padEnd(19)}| ${iMs100k}ms`,
  )
}

console.log("\n@100Kbps = typical bad SSH / VPN / mosh connection")
console.log("@1Mbps would be 10× faster (divide ms by 10)\n")
