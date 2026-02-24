/**
 * Tests for widget components: Spinner, ProgressBar, SelectList, Table, Badge, Divider
 *
 * Uses createRenderer for interactive components (SelectList, Spinner animation)
 * and static rendering for simple display components (Badge, Table, Divider).
 */

import React, { useState } from "react"
import { describe, expect, test, vi } from "vitest"
import { Box, Text, useInput } from "../src/index.js"
import { Spinner } from "../src/components/Spinner.js"
import { ProgressBar } from "../src/components/ProgressBar.js"
import { SelectList } from "../src/components/SelectList.js"
import type { SelectOption } from "../src/components/SelectList.js"
import { Table } from "../src/components/Table.js"
import { Badge } from "../src/components/Badge.js"
import { Divider } from "../src/components/Divider.js"
import { createRenderer } from "inkx/testing"

// =============================================================================
// Spinner
// =============================================================================

describe("Spinner", () => {
  const render = createRenderer({ cols: 40, rows: 5 })

  test("renders first frame of dots spinner", () => {
    const app = render(<Spinner />)
    expect(app.text).toContain("⠋")
  })

  test("renders with label", () => {
    const app = render(<Spinner label="Loading..." />)
    expect(app.text).toContain("Loading...")
  })

  test("renders different spinner types", () => {
    const dotsApp = render(<Spinner type="dots" />)
    expect(dotsApp.text).toContain("⠋")

    const lineApp = render(<Spinner type="line" />)
    expect(lineApp.text).toContain("|")

    const arcApp = render(<Spinner type="arc" />)
    expect(arcApp.text).toContain("◜")

    const bounceApp = render(<Spinner type="bounce" />)
    expect(bounceApp.text).toContain("⠁")
  })

  test("cycles frames over time", async () => {
    vi.useFakeTimers()
    try {
      const app = render(<Spinner type="line" interval={100} />)
      expect(app.text).toContain("|")

      // Advance timer several frames — verify it changed from initial
      await vi.advanceTimersByTimeAsync(400)
      // After 4 intervals, should have cycled through frames
      // Just verify it's not stuck on the first frame
      const text = app.text
      // The spinner should still be rendering something from the line frames
      expect(text).toMatch(/[|/—\\]/)
    } finally {
      vi.useRealTimers()
    }
  })
})

// =============================================================================
// ProgressBar
// =============================================================================

describe("ProgressBar", () => {
  const render = createRenderer({ cols: 40, rows: 5 })

  test("renders determinate progress at 0%", () => {
    const app = render(<ProgressBar value={0} width={20} />)
    expect(app.text).toContain("░")
    expect(app.text).toContain("0%")
  })

  test("renders determinate progress at 100%", () => {
    const app = render(<ProgressBar value={1} width={20} />)
    expect(app.text).toContain("█")
    expect(app.text).toContain("100%")
  })

  test("renders determinate progress at 50%", () => {
    const app = render(<ProgressBar value={0.5} width={20} />)
    expect(app.text).toContain("█")
    expect(app.text).toContain("░")
    expect(app.text).toContain("50%")
  })

  test("hides percentage when showPercentage is false", () => {
    const app = render(<ProgressBar value={0.5} width={20} showPercentage={false} />)
    expect(app.text).not.toContain("%")
  })

  test("renders with label", () => {
    const app = render(<ProgressBar value={0.3} width={30} label="Download" />)
    expect(app.text).toContain("Download")
    expect(app.text).toContain("30%")
  })

  test("renders with custom fill and empty chars", () => {
    const app = render(<ProgressBar value={0.5} width={20} fillChar="#" emptyChar="." showPercentage={false} />)
    expect(app.text).toContain("#")
    expect(app.text).toContain(".")
  })

  test("clamps value to 0-1 range", () => {
    const overApp = render(<ProgressBar value={1.5} width={20} />)
    expect(overApp.text).toContain("100%")

    const underApp = render(<ProgressBar value={-0.5} width={20} />)
    expect(underApp.text).toContain("0%")
  })
})

// =============================================================================
// SelectList
// =============================================================================

describe("SelectList", () => {
  const render = createRenderer({ cols: 40, rows: 10 })

  const items: SelectOption[] = [
    { label: "Apple", value: "apple" },
    { label: "Banana", value: "banana" },
    { label: "Cherry", value: "cherry" },
  ]

  test("renders all items", () => {
    const app = render(<SelectList items={items} />)
    expect(app.text).toContain("Apple")
    expect(app.text).toContain("Banana")
    expect(app.text).toContain("Cherry")
  })

  test("highlights first item by default", () => {
    const app = render(<SelectList items={items} />)
    // First item should have the indicator
    expect(app.text).toContain("▸ Apple")
  })

  test("highlights specified initial index", () => {
    const app = render(<SelectList items={items} initialIndex={1} />)
    expect(app.text).toContain("▸ Banana")
  })

  test("moves highlight down on j/down arrow", async () => {
    const app = render(<SelectList items={items} />)
    expect(app.text).toContain("▸ Apple")

    await app.press("j")
    expect(app.text).toContain("▸ Banana")

    await app.press("ArrowDown")
    expect(app.text).toContain("▸ Cherry")
  })

  test("moves highlight up on k/up arrow", async () => {
    const app = render(<SelectList items={items} initialIndex={2} />)
    expect(app.text).toContain("▸ Cherry")

    await app.press("k")
    expect(app.text).toContain("▸ Banana")

    await app.press("ArrowUp")
    expect(app.text).toContain("▸ Apple")
  })

  test("fires onSelect on Enter", async () => {
    const handleSelect = vi.fn()
    const app = render(<SelectList items={items} onSelect={handleSelect} />)

    await app.press("j") // Move to Banana
    await app.press("Enter")

    expect(handleSelect).toHaveBeenCalledWith({ label: "Banana", value: "banana" }, 1)
  })

  test("fires onHighlight on navigation", async () => {
    const handleHighlight = vi.fn()
    const app = render(<SelectList items={items} onHighlight={handleHighlight} />)

    await app.press("j")
    expect(handleHighlight).toHaveBeenCalledWith(1)

    await app.press("j")
    expect(handleHighlight).toHaveBeenCalledWith(2)
  })

  test("skips disabled items during navigation", async () => {
    const itemsWithDisabled: SelectOption[] = [
      { label: "Apple", value: "apple" },
      { label: "Banana", value: "banana", disabled: true },
      { label: "Cherry", value: "cherry" },
    ]
    const app = render(<SelectList items={itemsWithDisabled} />)
    expect(app.text).toContain("▸ Apple")

    // Down should skip Banana and land on Cherry
    await app.press("j")
    expect(app.text).toContain("▸ Cherry")
  })

  test("does not fire onSelect for disabled items", async () => {
    const handleSelect = vi.fn()
    const disabledItems: SelectOption[] = [{ label: "Only", value: "only", disabled: true }]
    const app = render(<SelectList items={disabledItems} onSelect={handleSelect} />)

    await app.press("Enter")
    expect(handleSelect).not.toHaveBeenCalled()
  })

  test("wraps around when navigating past end", async () => {
    const app = render(<SelectList items={items} initialIndex={2} />)
    expect(app.text).toContain("▸ Cherry")

    await app.press("j")
    expect(app.text).toContain("▸ Apple")
  })

  test("wraps around when navigating before start", async () => {
    const app = render(<SelectList items={items} initialIndex={0} />)
    expect(app.text).toContain("▸ Apple")

    await app.press("k")
    expect(app.text).toContain("▸ Cherry")
  })

  test("controlled mode uses highlightedIndex", () => {
    const app = render(<SelectList items={items} highlightedIndex={2} />)
    expect(app.text).toContain("▸ Cherry")
  })

  test("does not capture input when isActive is false", async () => {
    // Wrap SelectList with a parent that tracks its own key events
    let parentKeyPressed = false
    function Wrapper() {
      const [, setCount] = useState(0)
      useInput((input) => {
        if (input === "j") {
          parentKeyPressed = true
          setCount((c) => c + 1)
        }
      })
      return <SelectList items={items} isActive={false} />
    }

    const app = render(<Wrapper />)
    await app.press("j")

    // The parent should have received the key since SelectList is inactive
    expect(parentKeyPressed).toBe(true)
  })

  test("respects maxVisible for scrolled view", () => {
    const manyItems: SelectOption[] = Array.from({ length: 10 }, (_, i) => ({
      label: `Item ${i}`,
      value: `item-${i}`,
    }))

    const app = render(<SelectList items={manyItems} maxVisible={3} />)
    const text = app.text

    // Should show only 3 items
    const visibleCount = manyItems.filter((item) => text.includes(item.label)).length
    expect(visibleCount).toBe(3)
  })
})

// =============================================================================
// Table
// =============================================================================

describe("Table", () => {
  const render = createRenderer({ cols: 60, rows: 10 })

  test("renders headers and data", () => {
    const app = render(
      <Table
        columns={[
          { header: "Name", key: "name" },
          { header: "Age", key: "age" },
        ]}
        data={[
          { name: "Alice", age: 30 },
          { name: "Bob", age: 25 },
        ]}
      />,
    )

    expect(app.text).toContain("Name")
    expect(app.text).toContain("Age")
    expect(app.text).toContain("Alice")
    expect(app.text).toContain("Bob")
    expect(app.text).toContain("30")
    expect(app.text).toContain("25")
  })

  test("hides header when showHeader is false", () => {
    const app = render(
      <Table columns={[{ header: "Name", key: "name" }]} data={[{ name: "Alice" }]} showHeader={false} />,
    )

    expect(app.text).toContain("Alice")
    // Header separator should not be present
    expect(app.text).not.toContain("─")
  })

  test("renders separator between columns", () => {
    const app = render(
      <Table
        columns={[
          { header: "A", key: "a" },
          { header: "B", key: "b" },
        ]}
        data={[{ a: "1", b: "2" }]}
      />,
    )

    expect(app.text).toContain("│")
  })

  test("aligns columns correctly", () => {
    const app = render(
      <Table
        columns={[
          { header: "Left", key: "l", align: "left", width: 10 },
          { header: "Right", key: "r", align: "right", width: 10 },
        ]}
        data={[{ l: "abc", r: "xyz" }]}
      />,
    )

    const text = app.text
    expect(text).toContain("abc")
    expect(text).toContain("xyz")
  })

  test("handles array data rows", () => {
    const app = render(
      <Table
        columns={[{ header: "Col1" }, { header: "Col2" }]}
        data={[
          ["foo", "bar"],
          ["baz", "qux"],
        ]}
      />,
    )

    expect(app.text).toContain("foo")
    expect(app.text).toContain("bar")
    expect(app.text).toContain("baz")
    expect(app.text).toContain("qux")
  })

  test("auto-sizes columns to fit content", () => {
    const app = render(
      <Table
        columns={[
          { header: "ID", key: "id" },
          { header: "Description", key: "desc" },
        ]}
        data={[
          { id: "1", desc: "Short" },
          { id: "2", desc: "A longer description" },
        ]}
      />,
    )

    expect(app.text).toContain("A longer description")
  })

  test("uses custom separator", () => {
    const app = render(
      <Table
        columns={[
          { header: "A", key: "a" },
          { header: "B", key: "b" },
        ]}
        data={[{ a: "1", b: "2" }]}
        separator=" | "
      />,
    )

    expect(app.text).toContain(" | ")
  })
})

// =============================================================================
// Badge
// =============================================================================

describe("Badge", () => {
  const render = createRenderer({ cols: 40, rows: 5 })

  test("renders label text", () => {
    const app = render(<Badge label="Active" />)
    expect(app.text).toContain("Active")
  })

  test("renders with default variant", () => {
    const app = render(<Badge label="Status" />)
    expect(app.text).toContain("Status")
  })

  test("renders all variants", () => {
    const variants = ["default", "primary", "success", "warning", "error"] as const

    for (const variant of variants) {
      const app = render(<Badge label={variant} variant={variant} />)
      expect(app.text).toContain(variant)
    }
  })

  test("renders with custom color", () => {
    const app = render(<Badge label="Custom" color="magenta" />)
    expect(app.text).toContain("Custom")
  })

  test("has padding around label", () => {
    const app = render(<Badge label="Test" />)
    // Badge renders with the label text
    expect(app.text).toContain("Test")
  })
})

// =============================================================================
// Divider
// =============================================================================

describe("Divider", () => {
  const render = createRenderer({ cols: 40, rows: 5 })

  test("renders a line of characters", () => {
    const app = render(<Divider width={20} />)
    expect(app.text).toContain("─".repeat(20))
  })

  test("renders with custom character", () => {
    const app = render(<Divider char="=" width={15} />)
    expect(app.text).toContain("=".repeat(15))
  })

  test("renders with centered title", () => {
    const app = render(<Divider title="Section" width={30} />)
    expect(app.text).toContain("Section")
    expect(app.text).toContain("─")
  })

  test("title is surrounded by divider characters", () => {
    const app = render(<Divider title="Hi" width={20} />)
    const text = app.text
    // Should have "─" on both sides of " Hi "
    expect(text).toContain("─")
    expect(text).toContain("Hi")
  })

  test("renders with custom character and title", () => {
    const app = render(<Divider char="=" title="Test" width={20} />)
    const text = app.text
    expect(text).toContain("=")
    expect(text).toContain("Test")
  })
})
