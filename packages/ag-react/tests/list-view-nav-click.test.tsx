/**
 * ListView regression: standalone nav-mode click fires onSelect exactly once.
 *
 * Commit 48143ef0 added a default click wrapper in ListView so that apps
 * turning on `nav` without supplying `onItemClick` still get "click →
 * moveCursor + onSelect". This test locks that behaviour in — it was almost
 * regressed while fixing the SelectList double-fire bug.
 */

import React from "react"
import { describe, test, expect, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { ListView } from "../src/ui/components/ListView"
import { Box } from "../src/components/Box"
import { Text } from "../src/components/Text"

const ITEMS = ["apple", "banana", "cherry", "durian"]

describe("ListView nav mode: default click handler", () => {
  test("clicking a row fires onSelect exactly once (no parent handlers)", async () => {
    const onSelect = vi.fn()
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <ListView
        items={ITEMS}
        height={5}
        nav
        onSelect={onSelect}
        renderItem={(item) => <Text>{item}</Text>}
      />,
    )

    await app.click(0, 2)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(2)
  })

  test("onItemClick override replaces default (onSelect not auto-called)", async () => {
    const onSelect = vi.fn()
    const onItemClick = vi.fn()
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <ListView
        items={ITEMS}
        height={5}
        nav
        onSelect={onSelect}
        onItemClick={onItemClick}
        renderItem={(item) => <Text>{item}</Text>}
      />,
    )

    await app.click(0, 1)

    expect(onItemClick).toHaveBeenCalledTimes(1)
    expect(onItemClick).toHaveBeenCalledWith(1)
    expect(onSelect).not.toHaveBeenCalled()
  })

  test("hover moves cursor, does not fire onSelect", async () => {
    const onSelect = vi.fn()
    const onCursor = vi.fn()
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <ListView
        items={ITEMS}
        height={5}
        nav
        onSelect={onSelect}
        onCursor={onCursor}
        renderItem={(item) => <Text>{item}</Text>}
      />,
    )

    await app.hover(0, 2)

    expect(onCursor).toHaveBeenCalledWith(2)
    expect(onSelect).not.toHaveBeenCalled()
  })

  test("scrollbar=false suppresses overflow scroll chrome during navigation", async () => {
    const render = createRenderer({ cols: 24, rows: 5 })
    const app = render(
      <Box width={24} height={5}>
        <ListView
          items={Array.from({ length: 20 }, (_, i) => `item ${i}`)}
          height={3}
          nav
          active
          scrollbar={false}
          renderItem={(item) => <Text>{item}</Text>}
        />
      </Box>,
    )

    await app.press("ArrowUp")
    for (let i = 0; i < 8; i++) await app.press("ArrowDown")

    expect(app.lines.slice(0, 3).some((line) => /[█▀▄]$/.test(line))).toBe(false)
    expect(app.text).not.toContain("▀▀▀")
  })
})
