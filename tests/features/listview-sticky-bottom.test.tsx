/**
 * ListView sticky-bottom auto-follow.
 *
 * Chat-style scroll behavior. When `stickyBottom` is set and the user is
 * scrolled to the END of the list, new items appended at the tail trigger
 * an auto-scroll to the new maxRow. When the user has scrolled UP (away
 * from the bottom), auto-follow is disabled — the viewport stays put even
 * as more items are appended. When the user scrolls back to the bottom,
 * auto-follow resumes.
 *
 * The optional `onAtBottomChange` callback fires whenever the viewport
 * transitions between "at bottom" and "scrolled away" — useful for
 * rendering an overscroll indicator or sticky-toggle UI.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text, ListView } from "../../src/index.js"

const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms))

const makeItems = (n: number) =>
  Array.from({ length: n }, (_, i) => `Item ${i + 1}`)

function StickyChat(props: {
  items: string[]
  stickyBottom?: boolean
  onAtBottomChange?: (atBottom: boolean) => void
}) {
  return (
    <Box flexDirection="column" height={6} width={30}>
      <ListView
        items={props.items}
        height={6}
        cursorKey={props.items.length - 1}
        nav
        stickyBottom={props.stickyBottom ?? true}
        onAtBottomChange={props.onAtBottomChange}
        renderItem={(label) => <Text>{label}</Text>}
      />
    </Box>
  )
}

describe("ListView stickyBottom — auto-follow at end", () => {
  test("appending items while viewport is at bottom auto-scrolls to new maxRow", async () => {
    const render = createRenderer({ cols: 30, rows: 8 })
    const app = render(<StickyChat items={makeItems(10)} />)
    await settle()

    // Initial: cursor pins to Item 10 → viewport ends at Item 10.
    expect(app.text).toContain("Item 10")

    // Append Item 11 — should auto-follow.
    app.rerender(<StickyChat items={makeItems(11)} />)
    await settle()

    expect(app.text).toContain("Item 11")
  })

  test("after user scrolls up via wheel, appending items does NOT auto-follow", async () => {
    const render = createRenderer({ cols: 30, rows: 8 })
    const app = render(<StickyChat items={makeItems(20)} />)
    await settle()

    // At bottom — should see Item 20.
    expect(app.text).toContain("Item 20")

    // Scroll up via wheel (delta=-1 means up). With 20 items in height=6, the
    // viewport supports ~14 rows of scroll. Three wheel-ups move us off the
    // bottom.
    await app.wheel(5, 3, -1)
    await app.wheel(5, 3, -1)
    await app.wheel(5, 3, -1)
    await settle()

    // We're no longer at the bottom — Item 20 not visible.
    expect(app.text).not.toContain("Item 20")

    // Append a new item — should NOT auto-follow.
    app.rerender(<StickyChat items={makeItems(21)} />)
    await settle()

    // The visible content is unchanged — viewport stayed put.
    expect(app.text).not.toContain("Item 21")

    // Append another — still no follow.
    app.rerender(<StickyChat items={makeItems(22)} />)
    await settle()
    expect(app.text).not.toContain("Item 22")
  })

  test("scrolling back to the bottom re-enables auto-follow", async () => {
    const render = createRenderer({ cols: 30, rows: 8 })
    const app = render(<StickyChat items={makeItems(20)} />)
    await settle()

    // Scroll up to break sticky state.
    await app.wheel(5, 3, -1)
    await app.wheel(5, 3, -1)
    await app.wheel(5, 3, -1)
    await settle()

    expect(app.text).not.toContain("Item 20")

    // Append while scrolled-away — does not follow.
    app.rerender(<StickyChat items={makeItems(21)} />)
    await settle()
    expect(app.text).not.toContain("Item 21")

    // Scroll all the way back to the bottom.
    for (let i = 0; i < 30; i++) {
      await app.wheel(5, 3, 1)
    }
    await settle()

    // Now at bottom again.
    expect(app.text).toContain("Item 21")

    // Append Item 22 — auto-follow resumes.
    app.rerender(<StickyChat items={makeItems(22)} />)
    await settle()
    expect(app.text).toContain("Item 22")
  })
})

describe("ListView onAtBottomChange callback", () => {
  test("callback fires false when user scrolls up, true when they return", async () => {
    const transitions: boolean[] = []
    const render = createRenderer({ cols: 30, rows: 8 })
    const app = render(
      <StickyChat
        items={makeItems(20)}
        onAtBottomChange={(atBottom) => {
          transitions.push(atBottom)
        }}
      />,
    )
    await settle(100)

    // Initial state: at the bottom, callback should have fired with `true`.
    expect(transitions[transitions.length - 1]).toBe(true)
    transitions.length = 0

    // Scroll up — should emit `false`.
    await app.wheel(5, 3, -1)
    await app.wheel(5, 3, -1)
    await app.wheel(5, 3, -1)
    await settle(100)
    expect(transitions).toContain(false)
    transitions.length = 0

    // Scroll back down to the bottom — should emit `true` again.
    for (let i = 0; i < 30; i++) {
      await app.wheel(5, 3, 1)
    }
    await settle(100)
    expect(transitions).toContain(true)
  })

  test("callback does NOT fire on every render — only on transitions", async () => {
    const transitions: boolean[] = []
    const render = createRenderer({ cols: 30, rows: 8 })
    const app = render(
      <StickyChat
        items={makeItems(10)}
        onAtBottomChange={(atBottom) => {
          transitions.push(atBottom)
        }}
      />,
    )
    await settle(100)

    const initialCount = transitions.length
    expect(transitions[initialCount - 1]).toBe(true)

    // Re-render with new items at the bottom — atBottom stays true → no new emit.
    app.rerender(<StickyChat items={makeItems(11)} onAtBottomChange={(atBottom) => transitions.push(atBottom)} />)
    await settle(100)
    app.rerender(<StickyChat items={makeItems(12)} onAtBottomChange={(atBottom) => transitions.push(atBottom)} />)
    await settle(100)

    // No additional transition emissions because atBottom remained true.
    expect(transitions.length).toBe(initialCount)
  })
})
