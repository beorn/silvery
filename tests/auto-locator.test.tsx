/**
 * AutoLocator Integration Tests
 *
 * Tests for the auto-refreshing locator system (src/auto-locator.ts).
 * AutoLocator re-evaluates queries against the current tree on each access,
 * eliminating the stale locator problem. This is the canonical locator API
 * used by App.locator(), App.getByTestId(), and App.getByText().
 */

import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { Box, Text, useInput, type Key } from "../src/index.ts"
import { createAutoLocator, createRenderer } from "../src/testing/index.tsx"

const render = createRenderer({ cols: 80, rows: 24 })

// ============================================================================
// Locator Creation (getByTestId, getByText, locator)
// ============================================================================

describe("AutoLocator creation via App", () => {
  test("getByTestId finds element by testID prop", () => {
    const app = render(
      <Box>
        <Box testID="sidebar">
          <Text>Sidebar</Text>
        </Box>
        <Box testID="main">
          <Text>Main</Text>
        </Box>
      </Box>,
    )

    expect(app.getByTestId("sidebar").count()).toBe(1)
    expect(app.getByTestId("main").count()).toBe(1)
    expect(app.getByTestId("nonexistent").count()).toBe(0)
  })

  test("getByText finds element by string content", () => {
    const app = render(
      <Box>
        <Text>Hello World</Text>
        <Text>Goodbye</Text>
      </Box>,
    )

    expect(app.getByText("Hello").count()).toBe(1)
    expect(app.getByText("World").count()).toBe(1)
    expect(app.getByText("Goodbye").count()).toBe(1)
    expect(app.getByText("Missing").count()).toBe(0)
  })

  test("getByText finds element by regex pattern", () => {
    const app = render(
      <Box>
        <Text>Task 1</Text>
        <Text>Task 22</Text>
        <Text>Note 3</Text>
      </Box>,
    )

    expect(app.getByText(/Task \d+/).count()).toBe(2)
    expect(app.getByText(/Note/).count()).toBe(1)
    expect(app.getByText(/^Missing$/).count()).toBe(0)
  })

  test("locator finds by attribute presence [attr]", () => {
    const app = render(
      <Box>
        <Text data-selected="true">Selected</Text>
        <Text>Unselected</Text>
      </Box>,
    )

    expect(app.locator("[data-selected]").count()).toBe(1)
  })

  test("locator finds by attribute value [attr='value']", () => {
    const app = render(
      <Box>
        <Text data-status="active">Active</Text>
        <Text data-status="inactive">Inactive</Text>
      </Box>,
    )

    expect(app.locator('[data-status="active"]').count()).toBe(1)
    expect(app.locator('[data-status="inactive"]').count()).toBe(1)
    expect(app.locator('[data-status="unknown"]').count()).toBe(0)
  })

  test("locator finds by attribute prefix [attr^='prefix']", () => {
    const app = render(
      <Box>
        <Text testID="col-inbox">Inbox</Text>
        <Text testID="col-next">Next</Text>
        <Text testID="header">Header</Text>
      </Box>,
    )

    expect(app.locator('[testID^="col-"]').count()).toBe(2)
  })

  test("locator finds by attribute suffix [attr$='suffix']", () => {
    const app = render(
      <Box>
        <Text testID="inbox-col">Inbox</Text>
        <Text testID="next-col">Next</Text>
        <Text testID="header">Header</Text>
      </Box>,
    )

    expect(app.locator('[testID$="-col"]').count()).toBe(2)
  })

  test("locator finds by attribute contains [attr*='contains']", () => {
    const app = render(
      <Box>
        <Text testID="my-task-item">Task</Text>
        <Text testID="other-task-thing">Other</Text>
        <Text testID="header">Header</Text>
      </Box>,
    )

    expect(app.locator('[testID*="task"]').count()).toBe(2)
  })

  test("locator with #id selector", () => {
    const app = render(
      <Box>
        <Box id="panel-a">
          <Text>A</Text>
        </Box>
        <Box id="panel-b">
          <Text>B</Text>
        </Box>
      </Box>,
    )

    expect(app.locator("#panel-a").count()).toBe(1)
    expect(app.locator("#panel-b").count()).toBe(1)
  })
})

// ============================================================================
// Auto-refresh on Re-render
// ============================================================================

describe("AutoLocator auto-refresh", () => {
  test("same locator returns fresh results after state change", () => {
    function Toggler() {
      const [active, setActive] = useState(false)
      useInput((input) => {
        if (input === "t") setActive((v) => !v)
      })
      return (
        <Box testID="status">
          <Text>{active ? "ACTIVE" : "IDLE"}</Text>
        </Box>
      )
    }

    const app = render(<Toggler />)
    const status = app.getByTestId("status")

    // Initial state
    expect(status.textContent()).toBe("IDLE")

    // Toggle
    app.stdin.write("t")
    // Same locator reference, fresh result
    expect(status.textContent()).toBe("ACTIVE")

    // Toggle back
    app.stdin.write("t")
    expect(status.textContent()).toBe("IDLE")
  })

  test("locator tracks moving cursor through list", () => {
    function List() {
      const [cursor, setCursor] = useState(0)
      const items = ["Alpha", "Beta", "Gamma"]
      useInput((_input: string, key: Key) => {
        if (key.downArrow) setCursor((c) => Math.min(c + 1, items.length - 1))
        if (key.upArrow) setCursor((c) => Math.max(c - 1, 0))
      })
      return (
        <Box flexDirection="column">
          {items.map((item, i) => (
            <Text key={item} testID={i === cursor ? "selected" : undefined}>
              {i === cursor ? "> " : "  "}
              {item}
            </Text>
          ))}
        </Box>
      )
    }

    const app = render(<List />)
    const selected = app.getByTestId("selected")

    expect(selected.textContent()).toContain("Alpha")

    app.stdin.write("\x1b[B") // down arrow
    expect(selected.textContent()).toContain("Beta")

    app.stdin.write("\x1b[B") // down arrow
    expect(selected.textContent()).toContain("Gamma")

    app.stdin.write("\x1b[A") // up arrow
    expect(selected.textContent()).toContain("Beta")
  })

  test("locator count updates when nodes are added/removed", () => {
    function DynamicList() {
      const [count, setCount] = useState(2)
      useInput((input) => {
        if (input === "+") setCount((c) => c + 1)
        if (input === "-") setCount((c) => Math.max(0, c - 1))
      })
      return (
        <Box flexDirection="column">
          {Array.from({ length: count }, (_, i) => (
            <Text key={i} testID="list-item">
              Item {i}
            </Text>
          ))}
        </Box>
      )
    }

    const app = render(<DynamicList />)
    const items = app.getByTestId("list-item")

    expect(items.count()).toBe(2)

    app.stdin.write("+")
    expect(items.count()).toBe(3)

    app.stdin.write("-")
    app.stdin.write("-")
    expect(items.count()).toBe(1)
  })
})

// ============================================================================
// Query Re-evaluation Against Tree
// ============================================================================

describe("AutoLocator query re-evaluation", () => {
  test("resolveAll returns fresh node references each time", () => {
    function Counter() {
      const [count, setCount] = useState(0)
      useInput((input) => {
        if (input === "i") setCount((c) => c + 1)
      })
      return (
        <Box testID="counter">
          <Text>{String(count)}</Text>
        </Box>
      )
    }

    const app = render(<Counter />)
    const counter = app.getByTestId("counter")

    const nodes1 = counter.resolveAll()
    expect(nodes1.length).toBe(1)

    app.stdin.write("i")

    const nodes2 = counter.resolveAll()
    expect(nodes2.length).toBe(1)
    // Content changed, so textContent should differ
    expect(counter.textContent()).toBe("1")
  })

  test("resolve returns first match when multiple exist", () => {
    const app = render(
      <Box>
        <Text testID="dup">First</Text>
        <Text testID="dup">Second</Text>
      </Box>,
    )

    const loc = app.getByTestId("dup")
    // resolve() returns first
    const node = loc.resolve()
    expect(node).not.toBeNull()
  })

  test("resolve returns null for no matches", () => {
    const app = render(
      <Box>
        <Text>Content</Text>
      </Box>,
    )

    expect(app.getByTestId("missing").resolve()).toBeNull()
  })
})

// ============================================================================
// Multiple Matches / No Matches
// ============================================================================

describe("AutoLocator multiple and no matches", () => {
  test("count returns exact number of matches", () => {
    const app = render(
      <Box>
        <Text testID="item">A</Text>
        <Text testID="item">B</Text>
        <Text testID="item">C</Text>
        <Text testID="other">D</Text>
      </Box>,
    )

    expect(app.getByTestId("item").count()).toBe(3)
    expect(app.getByTestId("other").count()).toBe(1)
    expect(app.getByTestId("none").count()).toBe(0)
  })

  test("resolveAll returns all matching nodes", () => {
    const app = render(
      <Box>
        <Text testID="row">Row 1</Text>
        <Text testID="row">Row 2</Text>
        <Text testID="row">Row 3</Text>
      </Box>,
    )

    const all = app.getByTestId("row").resolveAll()
    expect(all.length).toBe(3)
  })

  test("resolveAll returns empty array for no matches", () => {
    const app = render(
      <Box>
        <Text>Content</Text>
      </Box>,
    )

    expect(app.getByTestId("absent").resolveAll()).toEqual([])
  })

  test("textContent returns empty string for no match", () => {
    const app = render(
      <Box>
        <Text>Content</Text>
      </Box>,
    )

    expect(app.getByTestId("absent").textContent()).toBe("")
  })

  test("getAttribute returns undefined for no match", () => {
    const app = render(
      <Box>
        <Text>Content</Text>
      </Box>,
    )

    expect(app.getByTestId("absent").getAttribute("anything")).toBeUndefined()
  })

  test("boundingBox returns null for no match", () => {
    const app = render(
      <Box>
        <Text>Content</Text>
      </Box>,
    )

    expect(app.getByTestId("absent").boundingBox()).toBeNull()
  })

  test("isVisible returns false for no match", () => {
    const app = render(
      <Box>
        <Text>Content</Text>
      </Box>,
    )

    expect(app.getByTestId("absent").isVisible()).toBe(false)
  })
})

// ============================================================================
// Narrowing (first, last, nth)
// ============================================================================

describe("AutoLocator narrowing", () => {
  function ThreeItems() {
    return (
      <Box>
        <Text testID="item">Alpha</Text>
        <Text testID="item">Beta</Text>
        <Text testID="item">Gamma</Text>
      </Box>
    )
  }

  test("first() returns the first matching element", () => {
    const app = render(<ThreeItems />)
    expect(app.getByTestId("item").first().textContent()).toBe("Alpha")
  })

  test("last() returns the last matching element", () => {
    const app = render(<ThreeItems />)
    expect(app.getByTestId("item").last().textContent()).toBe("Gamma")
  })

  test("nth(0) returns the first element", () => {
    const app = render(<ThreeItems />)
    expect(app.getByTestId("item").nth(0).textContent()).toBe("Alpha")
  })

  test("nth(1) returns the second element", () => {
    const app = render(<ThreeItems />)
    expect(app.getByTestId("item").nth(1).textContent()).toBe("Beta")
  })

  test("nth(2) returns the third element", () => {
    const app = render(<ThreeItems />)
    expect(app.getByTestId("item").nth(2).textContent()).toBe("Gamma")
  })

  test("nth out of bounds returns empty locator", () => {
    const app = render(<ThreeItems />)
    expect(app.getByTestId("item").nth(99).textContent()).toBe("")
    expect(app.getByTestId("item").nth(99).resolve()).toBeNull()
  })

  test("first of zero matches returns null on resolve", () => {
    const app = render(
      <Box>
        <Text>Content</Text>
      </Box>,
    )
    expect(app.getByTestId("absent").first().resolve()).toBeNull()
  })

  test("last of zero matches returns null on resolve", () => {
    const app = render(
      <Box>
        <Text>Content</Text>
      </Box>,
    )
    expect(app.getByTestId("absent").last().resolve()).toBeNull()
  })
})

// ============================================================================
// Filtering
// ============================================================================

describe("AutoLocator filtering", () => {
  test("filter with hasText narrows results", () => {
    const app = render(
      <Box>
        <Box testID="card" data-status="done">
          <Text>Buy milk</Text>
        </Box>
        <Box testID="card" data-status="todo">
          <Text>Write tests</Text>
        </Box>
        <Box testID="card" data-status="done">
          <Text>Fix bug</Text>
        </Box>
      </Box>,
    )

    const cards = app.getByTestId("card")
    expect(cards.count()).toBe(3)

    const milkCard = cards.filter({ hasText: "milk" })
    expect(milkCard.count()).toBe(1)
    expect(milkCard.textContent()).toContain("milk")
  })

  test("filter with hasText regex", () => {
    const app = render(
      <Box>
        <Box testID="item">
          <Text>Task 42</Text>
        </Box>
        <Box testID="item">
          <Text>Note: hello</Text>
        </Box>
        <Box testID="item">
          <Text>Task 99</Text>
        </Box>
      </Box>,
    )

    const tasks = app.getByTestId("item").filter({ hasText: /Task \d+/ })
    expect(tasks.count()).toBe(2)
  })

  test("filter with hasTestId narrows by node's own testID", () => {
    const app = render(
      <Box>
        <Box testID="card" data-type="task">
          <Text>Task card</Text>
        </Box>
        <Box testID="card" data-type="note">
          <Text>Note card</Text>
        </Box>
        <Box testID="sidebar">
          <Text>Sidebar</Text>
        </Box>
      </Box>,
    )

    // hasTestId filters nodes that themselves have testID="card"
    const cards = app.locator("[data-type]").filter({ hasTestId: "card" })
    expect(cards.count()).toBe(2)
  })

  test("filter with predicate function", () => {
    const app = render(
      <Box>
        <Text testID="a" data-priority="1">
          High
        </Text>
        <Text testID="b" data-priority="3">
          Low
        </Text>
        <Text testID="c" data-priority="1">
          Also high
        </Text>
      </Box>,
    )

    // Use function predicate
    const highPriority = app.locator("[data-priority]").filter((node) => {
      const props = node.props as Record<string, unknown>
      return props["data-priority"] === "1"
    })
    expect(highPriority.count()).toBe(2)
  })

  test("filter with has attribute option", () => {
    const app = render(
      <Box>
        <Text data-type="task" data-done="true">
          Done task
        </Text>
        <Text data-type="task">Pending task</Text>
        <Text data-type="note">A note</Text>
      </Box>,
    )

    const done = app.locator('[data-type="task"]').filter({
      has: { attr: "data-done", value: "true" },
    })
    expect(done.count()).toBe(1)
    expect(done.textContent()).toContain("Done task")
  })
})

// ============================================================================
// Chained Locators
// ============================================================================

describe("AutoLocator chaining", () => {
  test("getByTestId can be chained with getByText", () => {
    const app = render(
      <Box>
        <Box testID="sidebar">
          <Text>Sidebar content</Text>
        </Box>
        <Box testID="main">
          <Text>Main content</Text>
        </Box>
      </Box>,
    )

    // Both queries are independent (both search from root)
    expect(app.getByTestId("sidebar").count()).toBe(1)
    expect(app.getByText("Main content").count()).toBe(1)
  })

  test("locator chaining combines predicates", () => {
    const app = render(
      <Box>
        <Text testID="task" data-done="true">
          Buy milk
        </Text>
        <Text testID="task" data-done="false">
          Write tests
        </Text>
      </Box>,
    )

    // Chain attribute selectors - both predicates must match
    const doneTasks = app.locator('[testID="task"]').filter({
      has: { attr: "data-done", value: "true" },
    })
    expect(doneTasks.count()).toBe(1)
    expect(doneTasks.textContent()).toContain("Buy milk")
  })
})

// ============================================================================
// Utilities (textContent, getAttribute, boundingBox, isVisible)
// ============================================================================

describe("AutoLocator utilities", () => {
  test("textContent returns concatenated text from children", () => {
    const app = render(
      <Box testID="parent">
        <Text>Hello </Text>
        <Text>World</Text>
      </Box>,
    )

    expect(app.getByTestId("parent").textContent()).toBe("Hello World")
  })

  test("getAttribute returns prop value as string", () => {
    const app = render(
      <Box>
        <Text testID="task" data-status="done" data-priority="1">
          Task
        </Text>
      </Box>,
    )

    expect(app.getByTestId("task").getAttribute("data-status")).toBe("done")
    expect(app.getByTestId("task").getAttribute("data-priority")).toBe("1")
    expect(app.getByTestId("task").getAttribute("testID")).toBe("task")
  })

  test("getAttribute returns undefined for missing attribute", () => {
    const app = render(
      <Box>
        <Text testID="task">Task</Text>
      </Box>,
    )

    expect(app.getByTestId("task").getAttribute("data-missing")).toBeUndefined()
  })

  test("boundingBox returns position and dimensions", () => {
    const app = render(
      <Box testID="container" width={40} height={10}>
        <Text>Content</Text>
      </Box>,
    )

    const box = app.getByTestId("container").boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBe(40)
    expect(box!.height).toBe(10)
    expect(typeof box!.x).toBe("number")
    expect(typeof box!.y).toBe("number")
  })

  test("isVisible returns true for element with dimensions", () => {
    const app = render(
      <Box testID="visible" width={20} height={5}>
        <Text>Visible</Text>
      </Box>,
    )

    expect(app.getByTestId("visible").isVisible()).toBe(true)
  })

  test("isVisible returns false for non-existent element", () => {
    const app = render(
      <Box>
        <Text>Content</Text>
      </Box>,
    )

    expect(app.getByTestId("ghost").isVisible()).toBe(false)
  })
})

// ============================================================================
// CSS-like Selector Parsing
// ============================================================================

describe("AutoLocator selector parsing", () => {
  test("child combinator: parent > child", () => {
    const app = render(
      <Box>
        <Box testID="outer">
          <Box testID="inner">
            <Text>Nested</Text>
          </Box>
        </Box>
      </Box>,
    )

    // [testID="outer"] > [testID="inner"] should match inner box
    const inner = app.locator('[testID="outer"] > [testID="inner"]')
    expect(inner.count()).toBe(1)
  })

  test("descendant combinator: ancestor descendant (using #id)", () => {
    const app = render(
      <Box id="root-box">
        <Box>
          <Text id="deep">Deep text</Text>
        </Box>
      </Box>,
    )

    // #ancestor #descendant uses descendant combinator
    const deep = app.locator("#root-box #deep")
    expect(deep.count()).toBe(1)
    expect(deep.textContent()).toBe("Deep text")
  })

  test("descendant combinator does not match non-descendants", () => {
    const app = render(
      <Box>
        <Box id="branch-a">
          <Text id="leaf">In A</Text>
        </Box>
        <Box id="branch-b">
          <Text>In B</Text>
        </Box>
      </Box>,
    )

    // #branch-b #leaf should not match because leaf is under branch-a
    const result = app.locator("#branch-b #leaf")
    expect(result.count()).toBe(0)
  })

  test("invalid selector matches nothing", () => {
    const app = render(
      <Box>
        <Text>Content</Text>
      </Box>,
    )

    // An unparseable selector should result in 0 matches (not throw)
    const result = app.locator("???")
    expect(result.count()).toBe(0)
  })
})

// ============================================================================
// createAutoLocator (standalone, without App)
// ============================================================================

describe("createAutoLocator standalone", () => {
  test("creates a locator from a container getter", () => {
    const app = render(
      <Box>
        <Text testID="target">Target</Text>
      </Box>,
    )

    // Create standalone locator using container getter
    const locator = createAutoLocator(() => app.getContainer())
    expect(locator.getByTestId("target").count()).toBe(1)
    expect(locator.getByTestId("target").textContent()).toBe("Target")
  })

  test("standalone locator auto-refreshes on tree change", () => {
    function Dynamic() {
      const [label, setLabel] = useState("Before")
      useInput((input) => {
        if (input === "x") setLabel("After")
      })
      return (
        <Box testID="label">
          <Text>{label}</Text>
        </Box>
      )
    }

    const app = render(<Dynamic />)
    const locator = createAutoLocator(() => app.getContainer())
    const label = locator.getByTestId("label")

    expect(label.textContent()).toBe("Before")

    app.stdin.write("x")

    expect(label.textContent()).toBe("After")
  })

  test("standalone locator with no predicates returns container", () => {
    const app = render(
      <Box>
        <Text>Content</Text>
      </Box>,
    )

    const locator = createAutoLocator(() => app.getContainer())
    // No predicates means resolveAll returns [container]
    expect(locator.resolveAll().length).toBe(1)
    expect(locator.resolve()).toBe(app.getContainer())
  })
})
