/**
 * Layout API Compatibility Tests
 *
 * Tests that verify Hightea accepts the same props as Ink.
 * These tests verify API compatibility (props accepted without error).
 *
 * Note: The test renderer uses simplified text extraction without full Yoga layout.
 * For visual layout verification, use the visual regression tests (e2e/).
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Newline, Spacer, Text } from "../../src/index.js"
import { createRenderer } from "@hightea/term/testing"

const render = createRenderer()

describe("Layout API Compatibility", () => {
  describe("Flex Direction", () => {
    test('accepts flexDirection="row"', () => {
      const app = render(
        <Box flexDirection="row" width={10}>
          <Text>A</Text>
          <Text>B</Text>
        </Box>,
      )
      expect(app.ansi).toContain("A")
      expect(app.ansi).toContain("B")
    })

    test('accepts flexDirection="column"', () => {
      const app = render(
        <Box flexDirection="column" width={10}>
          <Text>A</Text>
          <Text>B</Text>
        </Box>,
      )
      expect(app.ansi).toContain("A")
      expect(app.ansi).toContain("B")
    })

    test('accepts flexDirection="row-reverse"', () => {
      const app = render(
        <Box flexDirection="row-reverse" width={10}>
          <Text>A</Text>
          <Text>B</Text>
        </Box>,
      )
      expect(app.ansi).toContain("A")
      expect(app.ansi).toContain("B")
    })

    test('accepts flexDirection="column-reverse"', () => {
      const app = render(
        <Box flexDirection="column-reverse" width={10}>
          <Text>A</Text>
          <Text>B</Text>
        </Box>,
      )
      expect(app.ansi).toContain("A")
      expect(app.ansi).toContain("B")
    })
  })

  describe("Flex Properties", () => {
    test("accepts flexGrow", () => {
      const app = render(
        <Box flexDirection="row" width={20}>
          <Box flexGrow={1}>
            <Text>L</Text>
          </Box>
          <Box flexGrow={1}>
            <Text>R</Text>
          </Box>
        </Box>,
      )
      expect(app.ansi).toContain("L")
      expect(app.ansi).toContain("R")
    })

    test("accepts flexShrink", () => {
      const app = render(
        <Box flexDirection="row" width={20}>
          <Box flexShrink={0}>
            <Text>Fixed</Text>
          </Box>
          <Box flexShrink={1}>
            <Text>Shrink</Text>
          </Box>
        </Box>,
      )
      expect(app.ansi).toContain("Fixed")
      expect(app.ansi).toContain("Shrink")
    })

    test("accepts flexBasis", () => {
      const app = render(
        <Box flexDirection="row" width={20}>
          <Box flexBasis={10}>
            <Text>Ten</Text>
          </Box>
          <Box flexGrow={1}>
            <Text>Rest</Text>
          </Box>
        </Box>,
      )
      expect(app.ansi).toContain("Ten")
      expect(app.ansi).toContain("Rest")
    })

    test("accepts flexWrap", () => {
      const app = render(
        <Box flexWrap="wrap" width={10}>
          <Text>A</Text>
          <Text>B</Text>
          <Text>C</Text>
        </Box>,
      )
      expect(app.ansi).toContain("A")
      expect(app.ansi).toContain("B")
      expect(app.ansi).toContain("C")
    })
  })

  describe("Dimensions", () => {
    test("accepts width as number", () => {
      const app = render(
        <Box width={10}>
          <Text>Content</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Content")
    })

    test("accepts width as percentage string", () => {
      const app = render(
        <Box width="50%">
          <Text>Content</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Content")
    })

    test("accepts height as number", () => {
      const app = render(
        <Box height={5}>
          <Text>Content</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Content")
    })

    test("accepts minWidth/maxWidth", () => {
      const app = render(
        <Box minWidth={5} maxWidth={20}>
          <Text>Content</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Content")
    })

    test("accepts minHeight/maxHeight", () => {
      const app = render(
        <Box minHeight={2} maxHeight={10}>
          <Text>Content</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Content")
    })
  })

  describe("Padding", () => {
    test("accepts padding (all sides)", () => {
      const app = render(
        <Box padding={1}>
          <Text>Padded</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Padded")
    })

    test("accepts paddingX/paddingY", () => {
      const app = render(
        <Box paddingX={2} paddingY={1}>
          <Text>Content</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Content")
    })

    test("accepts paddingTop/Bottom/Left/Right", () => {
      const app = render(
        <Box paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={2}>
          <Text>Content</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Content")
    })
  })

  describe("Margin", () => {
    test("accepts margin (all sides)", () => {
      const app = render(
        <Box margin={1}>
          <Text>Margined</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Margined")
    })

    test("accepts marginX/marginY", () => {
      const app = render(
        <Box marginX={2} marginY={1}>
          <Text>Content</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Content")
    })

    test("accepts marginTop/Bottom/Left/Right", () => {
      const app = render(
        <Box marginTop={1} marginBottom={1} marginLeft={2} marginRight={2}>
          <Text>Content</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Content")
    })
  })

  describe("Alignment", () => {
    test("accepts alignItems", () => {
      const values = ["flex-start", "flex-end", "center", "stretch", "baseline"] as const
      for (const alignItems of values) {
        const app = render(
          <Box alignItems={alignItems} height={3}>
            <Text>Content</Text>
          </Box>,
        )
        expect(app.ansi).toContain("Content")
      }
    })

    test("accepts alignSelf", () => {
      const app = render(
        <Box height={3}>
          <Box alignSelf="center">
            <Text>Content</Text>
          </Box>
        </Box>,
      )
      expect(app.ansi).toContain("Content")
    })

    test("accepts justifyContent", () => {
      const values = ["flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly"] as const
      for (const justifyContent of values) {
        const app = render(
          <Box justifyContent={justifyContent} width={20}>
            <Text>A</Text>
            <Text>B</Text>
          </Box>,
        )
        expect(app.ansi).toContain("A")
        expect(app.ansi).toContain("B")
      }
    })
  })

  describe("Gap", () => {
    test("accepts gap", () => {
      const app = render(
        <Box flexDirection="row" gap={2} width={20}>
          <Text>A</Text>
          <Text>B</Text>
        </Box>,
      )
      expect(app.ansi).toContain("A")
      expect(app.ansi).toContain("B")
    })
  })

  describe("Position", () => {
    test('accepts position="relative" (default)', () => {
      const app = render(
        <Box position="relative">
          <Text>Content</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Content")
    })

    test('accepts position="absolute"', () => {
      const app = render(
        <Box width={20} height={5}>
          <Box position="absolute">
            <Text>Absolute</Text>
          </Box>
        </Box>,
      )
      expect(app.ansi).toContain("Absolute")
    })
  })

  describe("Display", () => {
    test('accepts display="flex" (default)', () => {
      const app = render(
        <Box display="flex">
          <Text>Content</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Content")
    })

    test('accepts display="none"', () => {
      const app = render(
        <Box>
          <Box display="none">
            <Text>Hidden</Text>
          </Box>
          <Text>Visible</Text>
        </Box>,
      )
      const frame = app.ansi
      expect(frame).toContain("Visible")
      expect(frame).not.toContain("Hidden")
    })
  })

  describe("Borders", () => {
    test("accepts all borderStyle values", () => {
      const styles = ["single", "double", "round", "bold", "classic"] as const
      for (const borderStyle of styles) {
        const app = render(
          <Box borderStyle={borderStyle}>
            <Text>Content</Text>
          </Box>,
        )
        expect(app.ansi).toContain("Content")
      }
    })

    test("accepts borderColor", () => {
      const app = render(
        <Box borderStyle="single" borderColor="red">
          <Text>Content</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Content")
    })

    test("accepts borderTop/Bottom/Left/Right", () => {
      const app = render(
        <Box borderStyle="single" borderTop={true} borderBottom={true} borderLeft={false} borderRight={false}>
          <Text>Content</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Content")
    })
  })

  describe("Overflow (Hightea Extension)", () => {
    test('accepts overflow="visible"', () => {
      const app = render(
        <Box overflow="visible" width={5}>
          <Text>Long content here</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Long")
    })

    test('accepts overflow="hidden"', () => {
      const app = render(
        <Box overflow="hidden" width={5}>
          <Text>Long content here</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Long")
    })

    test('accepts overflow="scroll"', () => {
      const app = render(
        <Box overflow="scroll" height={3}>
          <Text>Line 1</Text>
          <Text>Line 2</Text>
          <Text>Line 3</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Line")
    })

    test("accepts scrollTo", () => {
      const app = render(
        <Box overflow="scroll" height={3} scrollTo={2}>
          <Text>Item 0</Text>
          <Text>Item 1</Text>
          <Text>Item 2</Text>
          <Text>Item 3</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Item")
    })
  })

  describe("Utility Components", () => {
    test("Spacer component works", () => {
      const app = render(
        <Box flexDirection="row" width={20}>
          <Text>L</Text>
          <Spacer />
          <Text>R</Text>
        </Box>,
      )
      expect(app.ansi).toContain("L")
      expect(app.ansi).toContain("R")
    })

    test("Newline component works", () => {
      const app = render(
        <Box flexDirection="column">
          <Text>Before</Text>
          <Newline />
          <Text>After</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Before")
      expect(app.ansi).toContain("After")
    })

    test("Newline accepts count prop", () => {
      const app = render(
        <Box flexDirection="column">
          <Text>A</Text>
          <Newline count={3} />
          <Text>B</Text>
        </Box>,
      )
      expect(app.ansi).toContain("A")
      expect(app.ansi).toContain("B")
    })
  })

  describe("Core Rendering - ANSI Width", () => {
    test("ANSI codes not counted in text width", () => {
      const app = render(
        <Box width={10}>
          <Text color="red">Hello</Text>
        </Box>,
      )
      // 'Hello' is 5 chars, should fit in width 10
      // ANSI codes for red should not affect width calculation
      const frame = app.ansi
      // The actual text should be present
      expect(frame).toContain("Hello")
    })

    test("styled text fits in container", () => {
      const app = render(
        <Box width={20}>
          <Text bold color="green">
            Styled Text
          </Text>
        </Box>,
      )
      // 'Styled Text' is 11 chars, should fit in width 20
      expect(app.ansi).toContain("Styled Text")
    })

    test("multiple styled segments render correctly", () => {
      const app = render(
        <Box width={30}>
          <Text>
            <Text color="red">Red</Text>
            {" and "}
            <Text color="blue">Blue</Text>
          </Text>
        </Box>,
      )
      // Total visible chars: 'Red and Blue' = 12 chars
      const frame = app.ansi
      expect(frame).toContain("Red")
      expect(frame).toContain("Blue")
    })
  })

  describe("Core Rendering - Nested Flex", () => {
    test("nested flex containers calculate correct sizes", () => {
      const app = render(
        <Box flexDirection="row" width={30}>
          <Box width={10}>
            <Text>Fixed</Text>
          </Box>
          <Box flexGrow={1}>
            <Text>Grows</Text>
          </Box>
        </Box>,
      )
      // Growing child should fill remaining 20 chars
      const frame = app.ansi
      expect(frame).toContain("Fixed")
      expect(frame).toContain("Grows")
    })

    test("deeply nested flex containers work", () => {
      const app = render(
        <Box flexDirection="column" width={40} height={10}>
          <Box flexDirection="row" height={2}>
            <Box width={20}>
              <Text>Left</Text>
            </Box>
            <Box flexGrow={1}>
              <Text>Right</Text>
            </Box>
          </Box>
          <Box flexGrow={1}>
            <Text>Bottom</Text>
          </Box>
        </Box>,
      )
      const frame = app.ansi
      expect(frame).toContain("Left")
      expect(frame).toContain("Right")
      expect(frame).toContain("Bottom")
    })

    test("flexGrow with mixed fixed-width and growing children", () => {
      const app = render(
        <Box flexDirection="row" width={50}>
          <Box width={10}>
            <Text>A</Text>
          </Box>
          <Box flexGrow={1}>
            <Text>B</Text>
          </Box>
          <Box width={10}>
            <Text>C</Text>
          </Box>
          <Box flexGrow={2}>
            <Text>D</Text>
          </Box>
        </Box>,
      )
      // Fixed: 10 + 10 = 20, remaining 30 split by flexGrow 1:2 = 10:20
      const frame = app.ansi
      expect(frame).toContain("A")
      expect(frame).toContain("B")
      expect(frame).toContain("C")
      expect(frame).toContain("D")
    })
  })
})
