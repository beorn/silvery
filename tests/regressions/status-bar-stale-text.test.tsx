/**
 * Regression: IncrementalRenderMismatchError when text content changes length
 * in a justifyContent="space-between" row.
 *
 * Bug: km-silvery.aichat-incr
 * Source: ai-chat-bugs.test.tsx "bug 5: status bar with frozen items at narrow width"
 *
 * When a Text node's content gets shorter in a space-between row,
 * stale characters remain at the old positions because:
 * 1. The Text node MOVES (flex recalculates), so clearExcessArea is skipped
 * 2. The parent Box should handle cleanup via clearNodeRegion, but doesn't
 */
import React, { useState, useEffect, useRef } from "react"
import { describe, test, expect, afterEach } from "vitest"
import { createRenderer, createTermless } from "@silvery/test"
import { Box, Text } from "silvery"
import { run, type RunHandle } from "../../packages/term/src/runtime/run"

const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms))

describe("regression: status bar stale text (km-silvery.aichat-incr)", () => {
  test("text content change in space-between row clears stale chars", () => {
    function StatusBar({ cost }: { cost: string }) {
      return (
        <Box flexDirection="row" justifyContent="space-between" width={80}>
          <Text dimColor>esc quit</Text>
          <Text dimColor wrap="truncate">
            ctx {"█░░░░░░░░░░░░░░░░░░░"} 4%{"  "}
            {cost}
          </Text>
        </Box>
      )
    }

    const r = createRenderer({ cols: 80, rows: 5 })

    // Render with longer cost text
    const app = r(<StatusBar cost="$1.025" />)
    const text1 = app.text
    expect(text1).toContain("$1.025")

    // Re-render with shorter cost text — stale "5" should be cleared
    app.rerender(<StatusBar cost="$1.02" />)
    const text2 = app.text
    expect(text2).toContain("$1.02")
    // The old trailing character "5" should NOT remain
    expect(text2).not.toContain("$1.025")
  })

  test("text shrink in space-between with multiple re-renders", () => {
    function Bar({ right }: { right: string }) {
      return (
        <Box flexDirection="row" justifyContent="space-between" width={60}>
          <Text>left</Text>
          <Text>{right}</Text>
        </Box>
      )
    }

    const r = createRenderer({ cols: 60, rows: 3 })
    const app = r(<Bar right="ABCDEFGH" />)
    expect(app.text).toContain("ABCDEFGH")

    // Shrink right text
    app.rerender(<Bar right="ABCD" />)
    expect(app.text).toContain("ABCD")
    expect(app.text).not.toContain("ABCDEFGH")

    // Shrink again
    app.rerender(<Bar right="AB" />)
    expect(app.text).toContain("AB")
    expect(app.text).not.toContain("ABCD")
  })

  // Full pipeline test using run() + termless (matches ai-chat-bugs.test.tsx)
  test("status bar in scrollable content — full pipeline", async () => {
    function App() {
      const [count, setCount] = useState(0)
      const countRef = useRef(0)
      countRef.current = count

      // Expose setter for external control
      ;(globalThis as any).__testSetCount = (n: number) => setCount(n)

      // Variable-length cost string
      const cost = `$${(count * 0.15).toFixed(2)}`

      return (
        <Box flexDirection="column" width={80}>
          {/* Content area — multiple items to create height */}
          {Array.from({ length: 20 }, (_, i) => (
            <Box key={i}>
              <Text>
                Item {i}: {"x".repeat(30)} (count={count})
              </Text>
            </Box>
          ))}

          {/* Status bar at bottom — space-between with variable-length right text */}
          <Box flexDirection="row" justifyContent="space-between">
            <Text dimColor>esc quit</Text>
            <Text dimColor>
              ctx {"█░░░░░░░░░░░░░░░░░░░"} {count}%{"  "}
              {cost}
            </Text>
          </Box>
        </Box>
      )
    }

    const term = createTermless({ cols: 80, rows: 25 })
    const handle = await run(<App />, term)
    await settle(100)

    // Trigger several re-renders with changing cost string
    for (let i = 1; i <= 5; i++) {
      ;(globalThis as any).__testSetCount(i)
      await settle(100)
    }

    // The SILVERY_STRICT check in the pipeline will throw
    // IncrementalRenderMismatchError if stale chars remain
    const text = term.screen!.getText()
    expect(text).toContain("$0.75") // 5 * 0.15 = 0.75

    handle.unmount()
    delete (globalThis as any).__testSetCount
  })
})
