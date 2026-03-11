/**
 * Inline mode scrollback promotion — reproduces the "screen cleared and redrawn" bug.
 *
 * The bug: in a real terminal (Ghostty), pressing Enter clears the screen and redraws
 * content from the top. Nothing enters terminal scrollback. Content "jumps up."
 *
 * Root cause: after scrollback promotion, prevCursorRow includes frozen line count.
 * On the next render, cursor-up overshoots past the app's content into pre-existing
 * terminal content (shell prompt, direnv output). This doesn't manifest in termless
 * tests that start with a clean screen (row 0).
 *
 * To reproduce: pre-populate the emulator with "shell prompt" content before starting
 * the app, simulating a real terminal where the app starts partway down the screen.
 */

import React from "react"
import { describe, test, expect, afterEach } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import type { Term } from "../../packages/term/src/ansi/term"
import { run, type RunHandle } from "../../packages/term/src/runtime/run"
import { CodingAgent, SCRIPT } from "../../examples/interactive/static-scrollback"

// ============================================================================
// Helper: simulate a real terminal with pre-existing content
// ============================================================================

/**
 * Feed "shell prompt" content into the termless emulator before starting the app.
 * This simulates what a real terminal looks like: shell prompt, direnv output,
 * then `bun run examples/interactive/ai-chat.tsx`, then the app starts.
 */
function feedShellPrompt(term: Term, lines: number = 5) {
  const emulator = (term as unknown as Record<string, unknown>)._emulator as { feed(data: string): void }
  // Simulate shell prompt and some output
  emulator.feed("Last login: Tue Mar 10 20:23:34 on ttys012\r\n")
  emulator.feed("direnv: loading ~/Code/pim/km/.envrc\r\n")
  emulator.feed("direnv: using flake\r\n")
  for (let i = 3; i < lines; i++) {
    emulator.feed(`shell-line-${i}\r\n`)
  }
  emulator.feed("$ bun run examples/interactive/ai-chat.tsx\r\n")
}

/**
 * Run the app in inline mode through the Options path (same as real app),
 * with pre-existing terminal content to simulate a real shell session.
 */
async function runInlineWithShellPrompt(
  element: React.ReactElement,
  dims: { cols: number; rows: number } = { cols: 120, rows: 40 },
  shellLines: number = 5,
): Promise<{ term: Term; handle: RunHandle }> {
  const term = createTermless(dims)
  const emulator = (term as unknown as Record<string, unknown>)._emulator as { feed(data: string): void }

  // Pre-populate with shell prompt content
  feedShellPrompt(term, shellLines)

  // Capture shell content before app starts
  const preAppScreen = term.screen!.getText()

  // Use the Options path with inline mode (same code path as real app)
  const handle = await run(element, {
    mode: "inline",
    writable: { write: (s: string) => emulator.feed(s) },
    cols: dims.cols,
    rows: dims.rows,
  })

  return { term, handle }
}

// ============================================================================
// Tests: reproduce the "screen cleared and redrawn" bug
// ============================================================================

describe("inline mode with pre-existing terminal content", () => {
  let term: Term
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  test("shell prompt survives initial render", async () => {
    ;({ term, handle } = await runInlineWithShellPrompt(
      <CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />,
      { cols: 120, rows: 40 },
    ))

    // The shell prompt should still be visible on screen (or in scrollback)
    const screenText = term.screen!.getText()
    const scrollbackText = term.scrollback!.getText()
    const allText = scrollbackText + screenText

    expect(allText).toContain("bun run examples/interactive/ai-chat.tsx")
    // App content should also be visible
    expect(term.screen).toContainText("Static Scrollback")
  })

  test("shell prompt survives after first Enter press", async () => {
    ;({ term, handle } = await runInlineWithShellPrompt(
      <CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />,
      { cols: 120, rows: 40 },
    ))

    await handle.press("Enter")

    // The shell prompt should NOT be overwritten — it should still be
    // on screen or safely in terminal scrollback.
    const screenText = term.screen!.getText()
    const scrollbackText = term.scrollback!.getText()
    const allText = scrollbackText + screenText

    // Shell prompt content should be preserved somewhere
    expect(allText).toContain("bun run examples/interactive/ai-chat.tsx")
    // App content should be visible
    expect(term.screen).toContainText("context")
  })

  test("cursor-up does not overshoot into shell prompt area", async () => {
    ;({ term, handle } = await runInlineWithShellPrompt(
      <CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />,
      { cols: 120, rows: 40 },
    ))

    // Record which lines have shell content before first Enter
    const screenBefore = term.screen!.getLines()
    const shellLineIndices: number[] = []
    for (let i = 0; i < screenBefore.length; i++) {
      if (screenBefore[i]!.includes("direnv") || screenBefore[i]!.includes("shell-line")) {
        shellLineIndices.push(i)
      }
    }

    await handle.press("Enter")

    // After Enter, the shell prompt lines should NOT have been overwritten
    // with app content. Check that "direnv" text is still intact.
    const screenAfter = term.screen!.getLines()
    const scrollbackAfter = term.scrollback!.getText()
    const allText = scrollbackAfter + "\n" + screenAfter.join("\n")

    expect(allText).toContain("direnv")
  })

  test("repeated Enter presses accumulate content correctly", async () => {
    ;({ term, handle } = await runInlineWithShellPrompt(
      <CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />,
      { cols: 120, rows: 30 },
      3,
    ))

    for (let i = 0; i < 5; i++) {
      await handle.press("Enter")

      const lines = term.screen!.getLines()
      const nonBlankLines = lines.filter((l: string) => l.trim().length > 0).length

      // Screen should never be mostly blank
      expect(
        nonBlankLines,
        `After Enter ${i + 1}: only ${nonBlankLines}/${lines.length} non-blank lines`,
      ).toBeGreaterThan(3)

      // Status bar should always be visible
      expect(term.screen).toContainText("context")
    }
  })

  test("frozen content enters terminal scrollback", async () => {
    ;({ term, handle } = await runInlineWithShellPrompt(
      <CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />,
      { cols: 120, rows: 20 },
      3,
    ))

    for (let i = 0; i < 6; i++) {
      await handle.press("Enter")
    }

    // After 6 Enter presses on a 20-row terminal, frozen content should
    // have been pushed into terminal scrollback
    const scrollbackText = term.scrollback!.getText()
    expect(
      scrollbackText.length,
      "No content in terminal scrollback after 6 Enter presses",
    ).toBeGreaterThan(0)

    // The scrollback should contain actual app content (not just shell prompt)
    const allScrollback = scrollbackText
    const hasAppContent =
      allScrollback.includes("Agent") ||
      allScrollback.includes("auth") ||
      allScrollback.includes("Fix the login")
    expect(hasAppContent, "Scrollback has no app content").toBe(true)
  })

  test("content does not jump up — render region stays at bottom", async () => {
    // With a 40-row terminal and 5 shell lines, the app starts at ~row 6.
    // After Enter, content should stay in the same region, not jump to row 0.
    ;({ term, handle } = await runInlineWithShellPrompt(
      <CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />,
      { cols: 120, rows: 40 },
    ))

    // Find where app content starts
    const linesBefore = term.screen!.getLines()
    const appStartBefore = linesBefore.findIndex(
      (l: string) => l.includes("Static Scrollback") || l.includes("Fix the login"),
    )

    await handle.press("Enter")

    // After Enter, the app content should start at the same position
    // (or higher if content was pushed into scrollback by growth)
    const linesAfter = term.screen!.getLines()
    const appStartAfter = linesAfter.findIndex(
      (l: string) =>
        l.includes("Static Scrollback") ||
        l.includes("Fix the login") ||
        l.includes("Agent"),
    )

    // Content should NOT have jumped to row 0 (which is where the shell prompt was)
    // If it jumped, appStartAfter would be 0 or close to 0
    // Allow some movement (content grows), but it shouldn't jump from row 6 to row 0
    if (appStartBefore > 3) {
      // The content shouldn't suddenly appear at the very top (row 0-1)
      // unless it legitimately grew to fill the screen
      const linesOfContent = linesAfter.filter((l: string) => l.trim().length > 0).length
      if (linesOfContent < 35) {
        // Screen isn't full — content shouldn't be at the very top
        expect(
          appStartAfter,
          `Content jumped from row ${appStartBefore} to row ${appStartAfter}`,
        ).toBeGreaterThan(0)
      }
    }
  })
})

// ============================================================================
// Comparison: clean screen vs pre-populated screen
// ============================================================================

describe("clean screen baseline (no shell prompt)", () => {
  let term: Term
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  test("works correctly without pre-existing content", async () => {
    // This is the existing test pattern — start clean, no shell prompt
    term = createTermless({ cols: 120, rows: 40 })
    const emulator = (term as unknown as Record<string, unknown>)._emulator as { feed(data: string): void }

    handle = await run(
      <CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />,
      {
        mode: "inline",
        writable: { write: (s: string) => emulator.feed(s) },
        cols: 120,
        rows: 40,
      },
    )

    expect(term.screen).toContainText("Static Scrollback")

    for (let i = 0; i < 5; i++) {
      await handle.press("Enter")
      expect(term.screen).toContainText("context")
    }
  })
})
