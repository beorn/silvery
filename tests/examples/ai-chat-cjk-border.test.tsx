/**
 * Regression test: CJK + emoji text in user messages causes border cropping.
 *
 * The user message "Now add i18n support for error messages. We need 日本語
 * (Japanese) and Deutsch (German). 🌍" wraps to 2 lines at typical widths.
 * After pressing Enter to advance, the agent response box has a cropped
 * bottom border — height measurement mismatch with CJK/emoji content.
 *
 * Uses createTermless for full ANSI rendering verification.
 */

import React from "react"
import { describe, test, expect, afterEach } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import type { Term } from "../../packages/term/src/ansi/term"
import { run, type RunHandle } from "../../packages/term/src/runtime/run"
import { CodingAgent, type ScriptEntry } from "../../examples/interactive/ai-chat"

const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms))

// Script with CJK + emoji that triggers the wrapping issue
const CJK_SCRIPT: ScriptEntry[] = [
  {
    role: "user",
    content: "Now add i18n support for error messages. We need 日本語 (Japanese) and Deutsch (German). 🌍",
    tokens: { input: 146, output: 0 },
  },
  {
    role: "agent",
    thinking: "i18n for error messages — I need to create translation JSON files.",
    content: "I'll create the translation files and update the error handling.",
    toolCalls: [
      {
        tool: "Write",
        args: "src/i18n/ja.json",
        output: ['  "token_expired": "トークンの有効期限が切れました 🔧"'],
      },
    ],
    tokens: { input: 17868, output: 1134 },
  },
  {
    role: "agent",
    content: "i18n support added. 🌍✅",
    tokens: { input: 20802, output: 134 },
  },
]

/**
 * Check that all box borders are properly closed.
 * A cropped border means ╭ without matching ╰ on the same indentation level.
 */
function assertBordersIntact(text: string) {
  const lines = text.split("\n")
  let openBorders = 0
  for (const line of lines) {
    const trimmed = line.trimStart()
    if (trimmed.startsWith("╭")) openBorders++
    if (trimmed.startsWith("╰")) openBorders--
  }
  // Every ╭ should have a matching ╰
  expect(openBorders).toBe(0)
}

describe("CJK + emoji border integrity", () => {
  let term: Term
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  test("user message with CJK text does not crop agent box border", async () => {
    // Use a width where the CJK message wraps to 2 lines
    term = createTermless({ cols: 100, rows: 30 })
    handle = await run(<CodingAgent script={CJK_SCRIPT} autoStart={false} fastMode={true} />, term)
    await settle(500)

    const screen = term.screen!
    const text = screen.getText()

    // The user message should be visible (with CJK characters)
    expect(text).toContain("i18n")

    // All box borders should be properly closed
    assertBordersIntact(text)

    // The agent response should have both ╭ and ╰
    expect(text).toContain("╭")
    expect(text).toContain("╰")
  })

  test("agent box border after CJK user message at narrow width", async () => {
    // Narrow width forces more wrapping
    term = createTermless({ cols: 80, rows: 30 })
    handle = await run(<CodingAgent script={CJK_SCRIPT} autoStart={false} fastMode={true} />, term)
    await settle(500)

    const text = term.screen!.getText()
    assertBordersIntact(text)
  })

  test("after Enter, boxes remain intact with inline mode", async () => {
    // Run in inline-like conditions (narrower width, more content)
    term = createTermless({ cols: 100, rows: 30 })
    handle = await run(<CodingAgent script={CJK_SCRIPT} autoStart={false} fastMode={true} />, term)
    await settle(500)

    // Press Enter to advance past the CJK user message
    await handle.press("Enter")
    await settle(500)

    const screen = term.screen!
    const text = screen.getText()
    const scrollback = term.scrollback?.getText() ?? ""
    const allText = scrollback + text

    // Agent response should be visible (either screen or scrollback)
    expect(allText).toContain("translation")

    // All borders in current screen should be intact
    assertBordersIntact(text)
  })

  test("CJK width: 日本語 measured as 6 columns, 🌍 as 2", async () => {
    // Verify our width measurement matches terminal expectations
    const { displayWidth } = await import("../../packages/term/src/unicode")
    expect(displayWidth("日本語")).toBe(6) // Each CJK char = 2 cols
    expect(displayWidth("🌍")).toBe(2) // Emoji = 2 cols
    expect(displayWidth("日本語 (Japanese)")).toBe(17) // 6 + 1 + 10
  })
})
