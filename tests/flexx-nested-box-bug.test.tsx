import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.js"
/**
 * Comprehensive tests for flexx nested Box bug (km-flexx-improve.11)
 *
 * Bug: When a column-direction container has fixed height (e.g., height=20)
 * and contains a child with flexShrink=0, that child should size to its content.
 * However, if that child contains a row with Box children (not direct Text children),
 * the parent unexpectedly expands to fill the entire container height.
 *
 * Expected: flexShrink=0 child sizes to content (height=1 for single line)
 * Actual: flexShrink=0 child expands to container height (height=20)
 */
import { createRenderer } from "inkx/testing"

const render = createRenderer({ cols: 80, rows: 24 })

describe("flexx nested Box bug (km-flexx-improve.11)", () => {
  describe("1. Minimal reproduction", () => {
    test("row containing Box>Text expands unexpectedly", () => {
      // Simplest case that triggers the bug:
      // - Column container with fixed height
      // - Child with flexShrink=0 (should size to content)
      // - Contains a row with a Box wrapping Text
      const app = render(
        <Box flexDirection="column" height={20}>
          <Box flexDirection="column" flexShrink={0} id="card">
            <Box flexDirection="row">
              <Box>
                <Text>content</Text>
              </Box>
            </Box>
          </Box>
        </Box>,
      )

      const card = app.locator("#card").boundingBox()

      // Expected: height should be 1 (content-based sizing)
      // Actual: height is 20 (full container height) - BUG
      expect(card?.height).toBe(1)
    })

    test("row containing Box>Text with flexGrow expands unexpectedly", () => {
      // Same as above but Box has flexGrow - also triggers bug
      const app = render(
        <Box flexDirection="column" height={20}>
          <Box flexDirection="column" flexShrink={0} id="card">
            <Box flexDirection="row">
              <Box flexGrow={1}>
                <Text>content</Text>
              </Box>
            </Box>
          </Box>
        </Box>,
      )

      const card = app.locator("#card").boundingBox()

      expect(card?.height).toBe(1)
    })
  })

  describe("2. With borders", () => {
    test("bordered card with nested Box>Text expands unexpectedly", () => {
      const app = render(
        <Box flexDirection="column" height={20}>
          <Box flexDirection="column" flexShrink={0} borderStyle="round" id="card">
            <Box flexDirection="row">
              <Box>
                <Text>content</Text>
              </Box>
            </Box>
          </Box>
        </Box>,
      )

      const card = app.locator("#card").boundingBox()

      // Expected: height should be 3 (1 content + 2 border)
      // Actual: height is 20 (full container) - BUG
      expect(card?.height).toBe(3)
    })
  })

  describe("3. With overflow=scroll", () => {
    test("scroll container with nested Box>Text card expands unexpectedly", () => {
      // Matches VirtualizedCardList structure
      const app = render(
        <Box flexDirection="column" height={20} overflow="scroll">
          <Box flexDirection="column" flexShrink={0} borderStyle="round" id="card">
            <Box flexDirection="row">
              <Box flexShrink={0}>
                <Text>*</Text>
              </Box>
              <Box flexGrow={1} flexShrink={1}>
                <Text>Card content</Text>
              </Box>
            </Box>
          </Box>
        </Box>,
      )

      const card = app.locator("#card").boundingBox()

      // Expected: height should be 3 (1 content + 2 border)
      // Actual: height is 20 (full container) - BUG
      expect(card?.height).toBe(3)
    })
  })

  describe("4. Multiple children", () => {
    test("only first child expands, others shrink to nothing", () => {
      // When there are multiple children, the bug causes the first
      // to expand and consume all space, shrinking others
      const app = render(
        <Box flexDirection="column" height={20}>
          <Box flexDirection="column" flexShrink={0} id="card1">
            <Box flexDirection="row">
              <Box>
                <Text>Card 1</Text>
              </Box>
            </Box>
          </Box>
          <Box flexDirection="column" flexShrink={0} id="card2">
            <Box flexDirection="row">
              <Box>
                <Text>Card 2</Text>
              </Box>
            </Box>
          </Box>
          <Box flexDirection="column" flexShrink={0} id="card3">
            <Box flexDirection="row">
              <Box>
                <Text>Card 3</Text>
              </Box>
            </Box>
          </Box>
        </Box>,
      )

      const card1 = app.locator("#card1").boundingBox()
      const card2 = app.locator("#card2").boundingBox()
      const card3 = app.locator("#card3").boundingBox()

      // Expected: all cards should have height 1
      // Actual: first card expands, others may be 0 or 1 - BUG
      expect(card1?.height).toBe(1)
      expect(card2?.height).toBe(1)
      expect(card3?.height).toBe(1)

      // Expected: cards should be stacked at y positions 0, 1, 2
      expect(card1?.y).toBe(0)
      expect(card2?.y).toBe(1)
      expect(card3?.y).toBe(2)
    })

    test("bordered cards - first expands, others shrink", () => {
      const app = render(
        <Box flexDirection="column" height={20}>
          <Box flexDirection="column" flexShrink={0} borderStyle="round" id="card1">
            <Box flexDirection="row">
              <Box>
                <Text>Card 1</Text>
              </Box>
            </Box>
          </Box>
          <Box flexDirection="column" flexShrink={0} borderStyle="round" id="card2">
            <Box flexDirection="row">
              <Box>
                <Text>Card 2</Text>
              </Box>
            </Box>
          </Box>
        </Box>,
      )

      const card1 = app.locator("#card1").boundingBox()
      const card2 = app.locator("#card2").boundingBox()

      // Expected: both cards height 3 (1 content + 2 border)
      expect(card1?.height).toBe(3)
      expect(card2?.height).toBe(3)

      // Expected: stacked at y=0 and y=3
      expect(card1?.y).toBe(0)
      expect(card2?.y).toBe(3)
    })
  })

  describe("5. Working case comparison", () => {
    test("direct Text child works correctly", () => {
      // Same structure but with direct Text instead of Box>Text
      // This should PASS - demonstrates the correct behavior
      const app = render(
        <Box flexDirection="column" height={20}>
          <Box flexDirection="column" flexShrink={0} id="card">
            <Box flexDirection="row">
              <Text>content</Text>
            </Box>
          </Box>
        </Box>,
      )

      const card = app.locator("#card").boundingBox()

      // This SHOULD pass - direct Text works correctly
      expect(card?.height).toBe(1)
    })

    test("Text without row wrapper works correctly", () => {
      // Even simpler - no row wrapper at all
      const app = render(
        <Box flexDirection="column" height={20}>
          <Box flexDirection="column" flexShrink={0} id="card">
            <Text>content</Text>
          </Box>
        </Box>,
      )

      const card = app.locator("#card").boundingBox()

      // This SHOULD pass
      expect(card?.height).toBe(1)
    })

    test("multiple cards with direct Text work correctly", () => {
      const app = render(
        <Box flexDirection="column" height={20}>
          <Box flexDirection="column" flexShrink={0} id="card1">
            <Box flexDirection="row">
              <Text>Card 1</Text>
            </Box>
          </Box>
          <Box flexDirection="column" flexShrink={0} id="card2">
            <Box flexDirection="row">
              <Text>Card 2</Text>
            </Box>
          </Box>
          <Box flexDirection="column" flexShrink={0} id="card3">
            <Box flexDirection="row">
              <Text>Card 3</Text>
            </Box>
          </Box>
        </Box>,
      )

      const card1 = app.locator("#card1").boundingBox()
      const card2 = app.locator("#card2").boundingBox()
      const card3 = app.locator("#card3").boundingBox()

      // These SHOULD all pass
      expect(card1?.height).toBe(1)
      expect(card2?.height).toBe(1)
      expect(card3?.height).toBe(1)

      expect(card1?.y).toBe(0)
      expect(card2?.y).toBe(1)
      expect(card3?.y).toBe(2)
    })

    test("bordered cards with direct Text work correctly", () => {
      const app = render(
        <Box flexDirection="column" height={20}>
          <Box flexDirection="column" flexShrink={0} borderStyle="round" id="card1">
            <Text>Card 1</Text>
          </Box>
          <Box flexDirection="column" flexShrink={0} borderStyle="round" id="card2">
            <Text>Card 2</Text>
          </Box>
        </Box>,
      )

      const card1 = app.locator("#card1").boundingBox()
      const card2 = app.locator("#card2").boundingBox()

      // These SHOULD pass
      expect(card1?.height).toBe(3)
      expect(card2?.height).toBe(3)
      expect(card1?.y).toBe(0)
      expect(card2?.y).toBe(3)
    })
  })
})
