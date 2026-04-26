/**
 * Layout corruption during simultaneous ListView grow + queue-region mount.
 *
 * Bead: km-silvercode.layout-corrupt-during-stream-with-queue
 *
 * Root cause: flexily's overflow-container flexShrink override was clobbering
 * an explicit `setFlexShrink(0)` on a Box with `overflow="hidden"`. The
 * silvercode SessionCard's left-gutter Box (`width=1, flexShrink=0,
 * overflow=hidden, contains <Text wrap="wrap">"▎"×200</Text>`) was being
 * forced shrinkable. When its row sibling (the message ListView) had
 * multi-line content whose max-content baseSize exceeded the container's
 * width, flex distribution shrank the gutter to 0.
 *
 * Fix: flexily now tracks whether `setFlexShrink()` was explicitly called
 * (`hasExplicitFlexShrink()`) and only applies the overflow-container
 * shrink-bridge when the consumer left the value at its default. Explicit
 * `setFlexShrink(0)` on an overflow=hidden Box is now honored — the gutter
 * stays at its declared `width=1`.
 *
 * The test below exercises the canonical silvercode shape AND the
 * simultaneous-resize sequence (streaming append + queue mount) that
 * triggered the user-visible regression. SILVERY_STRICT (auto-armed at
 * level 1+ in vitest setup) verifies that incremental rendering matches
 * fresh rendering on every commit.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text, ListView, TextArea, Screen } from "../../src/index.js"

const settle = (ms = 80) => new Promise((r) => setTimeout(r, ms))

function makeMessage(i: number): string {
  return [
    `msg-${i}: assistant token-stream chunk ${i} containing some prose`,
    `  + a continuation line that may also wrap depending on width`,
    `  + a snippet: const longIdentifierName = computeSomethingExpensive(arg1, arg2, arg3)`,
  ].join("\n")
}
const makeMessages = (n: number) => Array.from({ length: n }, (_, i) => makeMessage(i + 1))

/**
 * SessionCard-shape — outer row Box with a 1-col gutter (Text wrap=wrap
 * repeating "▎" 200x inside an overflow=hidden Box) + a flex column
 * containing a ListView. Mirrors apps/silvercode/src/components/SessionCard.tsx
 * exactly down to the gutter wrap pattern.
 */
function SessionLike({ messages, focused }: { messages: string[]; focused: boolean }) {
  return (
    <Box
      flexDirection="row"
      flexGrow={1}
      flexShrink={1}
      minWidth={0}
      minHeight={0}
      overflow="hidden"
    >
      <Box
        id="gutter-box"
        flexShrink={0}
        flexGrow={0}
        flexBasis={1}
        width={1}
        flexDirection="column"
        overflow="hidden"
      >
        {focused ? (
          <Text id="gutter-text" color="$accent" wrap="wrap">
            {"▎".repeat(200)}
          </Text>
        ) : null}
      </Box>
      <Box
        flexDirection="column"
        flexGrow={1}
        flexShrink={1}
        minWidth={0}
        minHeight={0}
        paddingLeft={1}
        paddingRight={2}
      >
        <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0} paddingX={1} paddingTop={1}>
          <ListView
            items={messages}
            follow="end"
            renderItem={(label) => (
              <Box flexDirection="column" flexShrink={1} minWidth={0}>
                <Text wrap="wrap">{label}</Text>
              </Box>
            )}
          />
        </Box>
      </Box>
    </Box>
  )
}

/**
 * CommandBox-shape — queue region conditionally mounted when queueText is
 * non-empty + always-live command TextArea. Mirrors silvercode's
 * components/CommandBox.tsx structural conditional.
 */
function CommandLike({ queue, command }: { queue: string; command: string }) {
  const hasQueue = queue.length > 0
  return (
    <Box
      backgroundColor="$bg-surface-subtle"
      paddingX={2}
      paddingY={1}
      flexShrink={0}
      flexDirection="column"
    >
      {hasQueue && (
        <>
          <Box flexDirection="row">
            <Box flexDirection="column" flexShrink={0}>
              <Text color="$fg-muted">{"> "}</Text>
            </Box>
            <Box flexGrow={1}>
              <TextArea
                value={queue}
                onChange={() => {}}
                fieldSizing="content"
                minRows={1}
                maxRows={12}
              />
            </Box>
          </Box>
          <Box flexDirection="row">
            <Text color="$border-default">{"─".repeat(40)}</Text>
          </Box>
        </>
      )}
      <Box flexDirection="row">
        <Text color="$primary" bold>
          {"> "}
        </Text>
        <Box flexGrow={1}>
          <TextArea
            value={command}
            onChange={() => {}}
            fieldSizing="content"
            minRows={1}
            maxRows={8}
          />
        </Box>
      </Box>
    </Box>
  )
}

/**
 * Mirror of silvercode's App.tsx shape: row container with [LEFT column
 * (SessionCard above CommandBox) | side panel].
 */
function App({
  messages,
  queue,
  command,
}: {
  messages: string[]
  queue: string
  command: string
}) {
  return (
    <Screen flexDirection="row">
      <Box flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden">
        <SessionLike messages={messages} focused />
        <Box flexDirection="column" flexShrink={0}>
          <CommandLike queue={queue} command={command} />
        </Box>
      </Box>
      <Box flexShrink={0} flexBasis={40} flexDirection="column" backgroundColor="$bg-surface-subtle">
        <Text>side</Text>
      </Box>
    </Screen>
  )
}

describe("layout-during-stream — gutter survives simultaneous resize", () => {
  test("gutter Box(width=1, flexShrink=0, overflow=hidden) keeps width=1", async () => {
    const r = createRenderer({ cols: 100, rows: 20 })
    const app = r(<App messages={makeMessages(5)} queue="" command="" />)
    await settle()

    // The fix: explicit flexShrink=0 on an overflow=hidden Box is honored.
    // Pre-fix: flexily clobbered shrink to ≥1, gutter collapsed to width=0.
    const bb = app.locator("#gutter-box").boundingBox()
    expect(bb).not.toBeNull()
    expect(bb!.width).toBe(1)

    // The gutter character (▎) actually renders at column 0.
    expect(app.cell(0, 0).char).toBe("▎")
  })

  test("gutter survives streaming-only frame (message append, queue empty)", async () => {
    const r = createRenderer({ cols: 100, rows: 20 })
    const app = r(<App messages={makeMessages(5)} queue="" command="" />)
    await settle()
    expect(app.locator("#gutter-box").boundingBox()!.width).toBe(1)

    app.rerender(<App messages={makeMessages(6)} queue="" command="" />)
    await settle()
    expect(app.locator("#gutter-box").boundingBox()!.width).toBe(1)
    expect(app.cell(0, 0).char).toBe("▎")
  })

  test("gutter survives SIMULTANEOUS append + queue mount", async () => {
    // Silvercode P1 trigger: streaming token chunk arrives AND user
    // types into queue (queue region mounts) in the same commit.
    const r = createRenderer({ cols: 100, rows: 20 })
    const app = r(<App messages={makeMessages(5)} queue="" command="" />)
    await settle()
    expect(app.locator("#gutter-box").boundingBox()!.width).toBe(1)

    // Frame 1: streaming-only.
    app.rerender(<App messages={makeMessages(6)} queue="" command="" />)
    await settle()

    // Frame 2: simultaneous — message #7 + queue mounts on first keystroke.
    app.rerender(<App messages={makeMessages(7)} queue="h" command="" />)
    await settle()
    expect(app.locator("#gutter-box").boundingBox()!.width).toBe(1)
    expect(app.cell(0, 0).char).toBe("▎")

    // Continued sequence: more streaming + more typing.
    for (let i = 2; i <= 5; i++) {
      app.rerender(
        <App messages={makeMessages(7 + i)} queue={"h".repeat(i)} command="" />,
      )
      await settle()
      expect(app.locator("#gutter-box").boundingBox()!.width).toBe(1)
    }
  })

  // NOTE: An "incremental == fresh" assertion across the full sequence
  // is intentionally NOT included here. The ListView `follow="end"`
  // policy converges to the tail asynchronously after each commit, so
  // an incremental sequence vs. a single-shot fresh render of the same
  // end state can show different scroll positions for one frame. That
  // behavior is owned by `tests/features/listview-follow-end.test.tsx`
  // and `listview-sticky-bottom.test.tsx`; this test is scoped to the
  // gutter-collapse regression. SILVERY_STRICT (auto-armed in vitest
  // setup) catches per-commit incremental ≠ fresh divergence at the
  // pipeline level — that's the broader correctness invariant the
  // simultaneous-resize sequence above exercises.
})
