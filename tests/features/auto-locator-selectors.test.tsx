/**
 * Tests for AutoLocator CSS selector enhancements:
 * - Multi-level combinator chains (#a > #b > #c)
 * - General sibling combinator (~)
 * - Pseudo-selectors (:first-child, :last-child, :nth-child, :empty)
 */

import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import React from "react"
import { Box, Text } from "silvery"

function TestTree() {
  return (
    <Box id="root" flexDirection="column">
      <Box id="col1" flexDirection="column">
        <Box id="task1">
          <Text>Task 1</Text>
        </Box>
        <Box id="task2">
          <Text>Task 2</Text>
        </Box>
        <Box id="task3">
          <Text>Task 3</Text>
        </Box>
      </Box>
      <Box id="col2" flexDirection="column">
        <Box id="task4">
          <Text>Task 4</Text>
        </Box>
      </Box>
      <Box id="empty-col" flexDirection="column" />
    </Box>
  )
}

describe("AutoLocator selector enhancements", () => {
  const render = createRenderer({ cols: 80, rows: 24 })

  describe("existing selectors still work", () => {
    test("single ID selector", () => {
      const app = render(<TestTree />)
      expect(app.locator("#task1").count()).toBe(1)
      expect(app.locator("#task1").textContent()).toBe("Task 1")
    })

    test("attribute selector", () => {
      const app = render(<TestTree />)
      expect(app.locator("[id]").count()).toBeGreaterThan(0)
    })

    test("two-level child combinator", () => {
      const app = render(<TestTree />)
      expect(app.locator("#col1 > #task1").count()).toBe(1)
      expect(app.locator("#col1 > #task1").textContent()).toBe("Task 1")
    })

    test("two-level descendant combinator", () => {
      const app = render(<TestTree />)
      expect(app.locator("#root #task1").count()).toBe(1)
      expect(app.locator("#root #task1").textContent()).toBe("Task 1")
    })

    test("adjacent sibling combinator", () => {
      const app = render(<TestTree />)
      expect(app.locator("#task1 + #task2").count()).toBe(1)
      expect(app.locator("#task1 + #task2").textContent()).toBe("Task 2")
    })
  })

  describe("multi-level child chains", () => {
    test("3-level child chain: #root > #col1 > #task1", () => {
      const app = render(<TestTree />)
      expect(app.locator("#root > #col1 > #task1").count()).toBe(1)
      expect(app.locator("#root > #col1 > #task1").textContent()).toBe("Task 1")
    })

    test("3-level child chain: #root > #col1 > #task3", () => {
      const app = render(<TestTree />)
      expect(app.locator("#root > #col1 > #task3").count()).toBe(1)
      expect(app.locator("#root > #col1 > #task3").textContent()).toBe("Task 3")
    })

    test("3-level child chain with wrong parent returns 0", () => {
      const app = render(<TestTree />)
      // task1 is not a child of col2
      expect(app.locator("#root > #col2 > #task1").count()).toBe(0)
    })

    test("3-level child chain: #root > #col2 > #task4", () => {
      const app = render(<TestTree />)
      expect(app.locator("#root > #col2 > #task4").count()).toBe(1)
      expect(app.locator("#root > #col2 > #task4").textContent()).toBe("Task 4")
    })
  })

  describe("multi-level descendant chains", () => {
    test("3-level descendant chain: #root #col1 #task1", () => {
      const app = render(<TestTree />)
      expect(app.locator("#root #col1 #task1").count()).toBe(1)
      expect(app.locator("#root #col1 #task1").textContent()).toBe("Task 1")
    })

    test("descendant skips intermediate levels", () => {
      const app = render(<TestTree />)
      // task1 is a descendant of root (through col1)
      expect(app.locator("#root #task1").count()).toBe(1)
    })
  })

  describe("mixed combinator chains", () => {
    test("child then descendant: #root > #col1 #task2", () => {
      const app = render(<TestTree />)
      expect(app.locator("#root > #col1 #task2").count()).toBe(1)
      expect(app.locator("#root > #col1 #task2").textContent()).toBe("Task 2")
    })

    test("descendant then child: #root #col1 > #task3", () => {
      const app = render(<TestTree />)
      expect(app.locator("#root #col1 > #task3").count()).toBe(1)
      expect(app.locator("#root #col1 > #task3").textContent()).toBe("Task 3")
    })
  })

  describe("general sibling combinator (~)", () => {
    test("#task1 ~ #task3 matches (task3 is a later sibling of task1)", () => {
      const app = render(<TestTree />)
      expect(app.locator("#task1 ~ #task3").count()).toBe(1)
      expect(app.locator("#task1 ~ #task3").textContent()).toBe("Task 3")
    })

    test("#task1 ~ #task2 matches (task2 is immediately after task1)", () => {
      const app = render(<TestTree />)
      expect(app.locator("#task1 ~ #task2").count()).toBe(1)
      expect(app.locator("#task1 ~ #task2").textContent()).toBe("Task 2")
    })

    test("#task3 ~ #task1 does not match (task1 comes before task3)", () => {
      const app = render(<TestTree />)
      expect(app.locator("#task3 ~ #task1").count()).toBe(0)
    })

    test("#col1 ~ #col2 matches (col2 is a later sibling of col1)", () => {
      const app = render(<TestTree />)
      expect(app.locator("#col1 ~ #col2").count()).toBe(1)
    })
  })

  describe("pseudo-selectors", () => {
    test(":first-child matches first child of parent", () => {
      const app = render(<TestTree />)
      // First child of col1 is task1
      expect(app.locator("#col1 > :first-child").count()).toBe(1)
      expect(app.locator("#col1 > :first-child").textContent()).toBe("Task 1")
    })

    test(":last-child matches last child of parent", () => {
      const app = render(<TestTree />)
      // Last child of col1 is task3
      expect(app.locator("#col1 > :last-child").count()).toBe(1)
      expect(app.locator("#col1 > :last-child").textContent()).toBe("Task 3")
    })

    test(":nth-child(2) matches second child", () => {
      const app = render(<TestTree />)
      expect(app.locator("#col1 > :nth-child(2)").count()).toBe(1)
      expect(app.locator("#col1 > :nth-child(2)").textContent()).toBe("Task 2")
    })

    test(":nth-child(1) matches first child", () => {
      const app = render(<TestTree />)
      expect(app.locator("#col1 > :nth-child(1)").count()).toBe(1)
      expect(app.locator("#col1 > :nth-child(1)").textContent()).toBe("Task 1")
    })

    test(":nth-child(3) matches third child", () => {
      const app = render(<TestTree />)
      expect(app.locator("#col1 > :nth-child(3)").count()).toBe(1)
      expect(app.locator("#col1 > :nth-child(3)").textContent()).toBe("Task 3")
    })

    test(":empty matches nodes with no children", () => {
      const app = render(<TestTree />)
      expect(app.locator("#empty-col:empty").count()).toBe(1)
    })

    test(":empty does not match nodes with children", () => {
      const app = render(<TestTree />)
      expect(app.locator("#col1:empty").count()).toBe(0)
    })
  })

  describe("combined pseudo + attribute selectors", () => {
    test(":first-child with ID", () => {
      const app = render(<TestTree />)
      // First child of col1 that also has id=task1
      expect(app.locator("#col1 > #task1:first-child").count()).toBe(1)
    })

    test(":last-child with ID", () => {
      const app = render(<TestTree />)
      // task2 is NOT the last child, so this should match 0
      expect(app.locator("#col1 > #task2:last-child").count()).toBe(0)
      // task3 IS the last child
      expect(app.locator("#col1 > #task3:last-child").count()).toBe(1)
    })

    test("pseudo with attribute selector", () => {
      const app = render(
        <Box id="parent" flexDirection="column">
          <Box id="a" data-cursor="true">
            <Text>A</Text>
          </Box>
          <Box id="b">
            <Text>B</Text>
          </Box>
        </Box>,
      )
      // First child with data-cursor attribute
      expect(app.locator("#parent > :first-child[data-cursor]").count()).toBe(1)
      expect(app.locator("#parent > :first-child[data-cursor]").textContent()).toBe("A")
    })
  })

  describe("edge cases", () => {
    test("universal selector still works", () => {
      const app = render(<TestTree />)
      expect(app.locator("*").count()).toBeGreaterThan(0)
    })

    test("attribute selector with space in value", () => {
      const app = render(
        <Box id="test" data-label="hello world">
          <Text>Content</Text>
        </Box>,
      )
      expect(app.locator("[data-label='hello world']").count()).toBe(1)
    })

    test("selector with no matches returns 0", () => {
      const app = render(<TestTree />)
      expect(app.locator("#nonexistent").count()).toBe(0)
    })

    test("deeply nested multi-level", () => {
      const app = render(
        <Box id="l1">
          <Box id="l2">
            <Box id="l3">
              <Box id="l4">
                <Text>Deep</Text>
              </Box>
            </Box>
          </Box>
        </Box>,
      )
      expect(app.locator("#l1 > #l2 > #l3 > #l4").count()).toBe(1)
      expect(app.locator("#l1 > #l2 > #l3 > #l4").textContent()).toBe("Deep")
      // Descendant also works through all levels
      expect(app.locator("#l1 #l4").count()).toBe(1)
    })
  })
})
