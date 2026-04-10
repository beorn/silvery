/**
 * Tests for createAg() — era2a Phase 3.
 *
 * createAg is validated through 4636+ existing tests via executeRender
 * delegation. These tests verify the direct API + integration contract.
 */

import { describe, test, expect } from "vitest"
import { createAg } from "@silvery/ag-term/ag"
import { detectPipelineFeatures } from "@silvery/ag-term/pipeline"
import { createRenderer } from "@silvery/test"
import React from "react"
import { Box, Text } from "silvery"
import type { AgNode } from "@silvery/ag/types"
import { INITIAL_EPOCH } from "@silvery/ag/epoch"

/** Minimal AgNode for feature detection tests (no layout engine needed). */
function makeNode(type: string, props: Record<string, unknown>, children: AgNode[]): AgNode {
  return {
    type: type as AgNode["type"],
    props,
    children,
    parent: null,
    layoutNode: null,
    boxRect: null,
    scrollRect: null,
    screenRect: null,
    prevLayout: null,
    prevScrollRect: null,
    prevScreenRect: null,
    layoutChangedThisFrame: INITIAL_EPOCH,
    layoutDirty: false,
    contentDirtyEpoch: INITIAL_EPOCH,
    stylePropsDirtyEpoch: INITIAL_EPOCH,
    bgDirtyEpoch: INITIAL_EPOCH,
    subtreeDirtyEpoch: INITIAL_EPOCH,
    childrenDirtyEpoch: INITIAL_EPOCH,
    absoluteChildMutatedEpoch: INITIAL_EPOCH,
    descendantOverflowChangedEpoch: INITIAL_EPOCH,
    layoutSubscribers: new Set(),
  }
}

describe("createAg", () => {
  describe("executeRender delegation (integration)", () => {
    test("simple text renders correctly", () => {
      const render = createRenderer({ cols: 40, rows: 10 })
      const app = render(<Text>Hello World</Text>)
      expect(app.text).toContain("Hello World")
    })

    test("incremental rendering works through delegation", () => {
      const render = createRenderer({ cols: 40, rows: 10 })
      const app = render(<Text>Before</Text>)
      expect(app.text).toContain("Before")

      app.rerender(<Text>After</Text>)
      expect(app.text).toContain("After")
      expect(app.text).not.toContain("Before")
    })

    test("box layout works through delegation", () => {
      const render = createRenderer({ cols: 40, rows: 10 })
      const app = render(
        <Box flexDirection="column">
          <Text>Line 1</Text>
          <Text>Line 2</Text>
        </Box>,
      )
      expect(app.text).toContain("Line 1")
      expect(app.text).toContain("Line 2")
    })

    test("borders work through delegation", () => {
      const render = createRenderer({ cols: 40, rows: 10 })
      const app = render(
        <Box borderStyle="single">
          <Text>Bordered</Text>
        </Box>,
      )
      expect(app.text).toContain("┌")
      expect(app.text).toContain("Bordered")
    })
  })

  describe("API contract", () => {
    test("createAg is exported from @silvery/ag-term", () => {
      expect(typeof createAg).toBe("function")
    })

    test("ag has layout, render, and resetBuffer methods", () => {
      const mockRoot = {} as any
      const ag = createAg(mockRoot)
      expect(typeof ag.layout).toBe("function")
      expect(typeof ag.render).toBe("function")
      expect(typeof ag.resetBuffer).toBe("function")
      expect(ag.root).toBe(mockRoot)
    })
  })

  describe("pipeline feature detection", () => {
    test("detectPipelineFeatures: no scroll/sticky in simple tree", () => {
      const root = makeNode("silvery-box", {}, [makeNode("silvery-text", {}, [])])
      const features = detectPipelineFeatures(root)
      expect(features.hasScroll).toBe(false)
      expect(features.hasSticky).toBe(false)
    })

    test("detectPipelineFeatures: detects overflow=scroll", () => {
      const root = makeNode("silvery-box", {}, [
        makeNode("silvery-box", { overflow: "scroll" }, [makeNode("silvery-text", {}, [])]),
      ])
      const features = detectPipelineFeatures(root)
      expect(features.hasScroll).toBe(true)
      expect(features.hasSticky).toBe(false)
    })

    test("detectPipelineFeatures: detects position=sticky", () => {
      const root = makeNode("silvery-box", {}, [makeNode("silvery-box", { position: "sticky", stickyBottom: 0 }, [])])
      const features = detectPipelineFeatures(root)
      expect(features.hasScroll).toBe(false)
      expect(features.hasSticky).toBe(true)
    })

    test("detectPipelineFeatures: detects both scroll and sticky", () => {
      const root = makeNode("silvery-box", {}, [
        makeNode("silvery-box", { overflow: "scroll" }, [makeNode("silvery-box", { position: "sticky" }, [])]),
      ])
      const features = detectPipelineFeatures(root)
      expect(features.hasScroll).toBe(true)
      expect(features.hasSticky).toBe(true)
    })

    test("simple app renders identically with phase skipping (STRICT)", () => {
      // This test is primarily validated by SILVERY_STRICT=1 which
      // verifies incremental === fresh render. If phase skipping
      // produced different output, STRICT would catch it.
      const render = createRenderer({ cols: 40, rows: 10 })
      const app = render(
        <Box flexDirection="column">
          <Text>Header</Text>
          <Box flexDirection="row">
            <Box width={20}>
              <Text>Left</Text>
            </Box>
            <Box width={20}>
              <Text>Right</Text>
            </Box>
          </Box>
          <Text>Footer</Text>
        </Box>,
      )
      expect(app.text).toContain("Header")
      expect(app.text).toContain("Left")
      expect(app.text).toContain("Right")
      expect(app.text).toContain("Footer")

      // Rerender to exercise incremental path
      app.rerender(
        <Box flexDirection="column">
          <Text>Header Updated</Text>
          <Box flexDirection="row">
            <Box width={20}>
              <Text>Left</Text>
            </Box>
            <Box width={20}>
              <Text>Right</Text>
            </Box>
          </Box>
          <Text>Footer</Text>
        </Box>,
      )
      expect(app.text).toContain("Header Updated")
    })

    test("scroll container renders correctly after dynamic mount", () => {
      // Verifies one-way flag behavior: app starts without scroll,
      // then a scroll container appears. Phase must start running.
      function DynamicApp({ showScroll }: { showScroll: boolean }) {
        return (
          <Box flexDirection="column" height={10}>
            <Text>Header</Text>
            {showScroll ? (
              <Box overflow="scroll" height={5}>
                <Text>Item 1</Text>
                <Text>Item 2</Text>
                <Text>Item 3</Text>
                <Text>Item 4</Text>
                <Text>Item 5</Text>
                <Text>Item 6</Text>
              </Box>
            ) : (
              <Text>No scroll yet</Text>
            )}
          </Box>
        )
      }

      const render = createRenderer({ cols: 40, rows: 10 })
      const app = render(<DynamicApp showScroll={false} />)
      expect(app.text).toContain("No scroll yet")

      // Now mount a scroll container — phases must activate
      app.rerender(<DynamicApp showScroll={true} />)
      expect(app.text).toContain("Item 1")
    })
  })
})
