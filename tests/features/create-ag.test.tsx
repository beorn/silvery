/**
 * Tests for createAg() — era2a Phase 3.
 *
 * createAg is the sole pipeline entry point, validated through 4636+ existing tests.
 * These tests verify the direct API + integration contract.
 */

import { describe, test, expect, vi } from "vitest"
import { createAg } from "@silvery/ag-term/ag"
import * as agModule from "@silvery/ag-term/ag"
import { IncrementalRenderMismatchError } from "@silvery/ag-term/errors"
import { CONTENT_BIT, setDirty } from "@silvery/ag/epoch"
import { detectPipelineFeatures } from "@silvery/ag-term/pipeline"
import { createRenderer, compareBuffers } from "@silvery/test"
import React from "react"
import { Box, Text } from "silvery"
import type { AgNode } from "@silvery/ag/types"
import { INITIAL_EPOCH, createEpochOwner, type EpochOwner } from "@silvery/ag/epoch"

/**
 * Every node in a tree shares one epoch owner — dirty bits are epoch stamps
 * read against it, so a node answering to a different owner than its parent
 * reads clean at the wrong moments. Production keeps this by construction (the
 * reconciler builds each node into its container's tree); these fixtures
 * assemble bottom-up, so the parent adopts its children's subtrees instead.
 */
function adoptIntoTree(node: AgNode, epochOwner: EpochOwner): void {
  node.epochOwner = epochOwner
  for (const child of node.children) adoptIntoTree(child, epochOwner)
}

/** Minimal AgNode for feature detection tests (no layout engine needed). */
function makeNode(type: string, props: Record<string, unknown>, children: AgNode[]): AgNode {
  // One owner per tree: the children were built first, so this node adopts them
  // (production builds each node into its container's tree instead).
  const epochOwner = createEpochOwner()
  for (const child of children) adoptIntoTree(child, epochOwner)
  return {
    type: type as AgNode["type"],
    props,
    children,
    parent: null,
    epochOwner,
    layoutNode: null,
    boxRect: null,
    scrollRect: null,
    screenRect: null,
    prevLayout: null,
    prevScrollRect: null,
    prevScreenRect: null,
    layoutChangedThisFrame: INITIAL_EPOCH,
    dirtyBits: 0,
    dirtyEpoch: INITIAL_EPOCH,
  }
}

describe("createAg", () => {
  // @failure STRICT cell mismatch omits the observed clean-root transform evidence.
  // @level l3
  // @consumer Maintainers diagnosing retained transform invalidation.
  // Ordinary rendering tests assert correctness; this needs a delegated fault
  // in the actual retained buffer and the existing typed diagnostic boundary.
  test.each([
    { active: true, clean: true, tagged: true },
    { active: true, clean: false, tagged: false },
    { active: false, clean: true, tagged: false },
  ])("STRICT transform evidence active=$active clean=$clean", ({ active, clean, tagged }) => {
    const original = agModule.createAg
    let armed = false
    const spy = vi.spyOn(agModule, "createAg").mockImplementation((root, options) => {
      const ag = original(root, options),
        layout = ag.layout.bind(ag),
        render = ag.render.bind(ag)
      ag.layout = (dims, opts) => {
        const result = layout(dims, opts)
        if (armed && clean) setDirty(root, root.dirtyBits & ~CONTENT_BIT)
        return result
      }
      ag.render = (opts) => {
        const result = render(opts)
        if (armed && !opts?.fresh) result.buffer.setCell(39, 59, { char: "Z" })
        return result
      }
      return ag
    })
    const prefix = (line: string) => `0→${line}`
    const frame = (color: string) => (
      <Box width={40} height={60} flexDirection="column">
        {Array.from({ length: 24 }, (_, i) => (
          <Box key={i} height={2} flexShrink={0}>
            <Text
              width={12}
              height={1}
              color={color}
              internal_transform={active ? prefix : undefined}
            >
              AAAA
            </Text>
            <Text width={12} height={1}>
              BBBB
            </Text>
          </Box>
        ))}
      </Box>
    )
    let app: ReturnType<ReturnType<typeof createRenderer>> | undefined
    try {
      app = createRenderer({ cols: 40, rows: 60 })(frame("#ffffff"))
      expect(app.text).toContain("AAAA")
      armed = true
      let failure: unknown
      try {
        app.rerender(frame("#00ff00"))
      } catch (error) {
        failure = error
      }
      expect(failure).toBeInstanceOf(IncrementalRenderMismatchError)
      expect((failure as Error).message.startsWith("Transform invalidation witness:")).toBe(tagged)
    } finally {
      spy.mockRestore()
      app?.unmount()
    }
  })
  // @failure Imperative content/structure changes retain old cells or free moved nodes.
  // @level l3
  // @consumer Ag callers updating a retained terminal frame.
  // Retained imperative mutations must reach the Text painter even when geometry
  // stays fixed. React rerenders do not exercise this imperative owner.
  test.each(
    [false, true].flatMap((active) =>
      ["text", "color", "virtual-color", "remove", "reorder", "insert", "move"].map((kind) => ({
        active,
        kind,
      })),
    ),
  )("retains imperative $kind output with transform=$active", ({ active, kind }) => {
    const prefix = (line: string) => `0→${line}`
    const frame = (after: boolean) => (
      <Box width={40} height={60} flexDirection="column">
        <Text height={1}>ANCHOR</Text>
        {(after && kind === "move"
          ? [1, 0, ...Array.from({ length: 22 }, (_, i) => i + 2)]
          : Array.from({ length: 24 }, (_, i) => i)
        ).map((i) => (
          <Box key={i} height={2} flexShrink={0}>
            <Text
              width={12}
              height={1}
              wrap="clip"
              color={after && kind === "color" ? "#00ff00" : "#ffffff"}
              internal_transform={active ? prefix : undefined}
            >
              {(after && kind === "reorder"
                ? ["BBBB", "AAAA"]
                : after && kind === "insert"
                  ? [`CCCC${i.toString().padStart(2, "0")}`, "AAAA", "BBBB"]
                  : after && kind === "remove"
                    ? ["AAAA"]
                    : [after && kind === "text" ? "DDDD" : "AAAA", "BBBB"]
              ).map((s) => (
                <Text
                  key={s}
                  color={
                    kind === "virtual-color" && s === "AAAA"
                      ? after
                        ? "#00ff00"
                        : "#ffffff"
                      : undefined
                  }
                >
                  {s}
                </Text>
              ))}
            </Text>
            <Text width={12} height={1} wrap="clip">
              {after && kind === "insert" ? null : (
                <Text>{`CCCC${i.toString().padStart(2, "0")}`}</Text>
              )}
            </Text>
          </Box>
        ))}
      </Box>
    )
    const app = createRenderer({ cols: 40, rows: 60 })(frame(false))
    const oracle = createRenderer({ cols: 40, rows: 60 })(frame(true))
    try {
      const root = app.getContainer(),
        ag = createAg(root)
      ag.layout({ cols: 40, rows: 60 })
      expect(ag.render().frame.text).toContain("AAAABBBB")
      const panel = root.children[0]!,
        rows = panel.children.slice(1)
      expect(rows).toHaveLength(24)
      if (kind === "move") {
        const moving = rows[1]!,
          free = vi.spyOn(moving.layoutNode!, "free")
        ag.insertChild(panel, moving, 1)
        expect(panel.children[1]).toBe(moving)
        expect(free).not.toHaveBeenCalled()
        free.mockRestore()
      } else {
        for (const row of rows) {
          const main = row.children[0]!,
            donor = row.children[1]!
          if (kind === "text") ag.setText(main.children[0]!.children[0]!, "DDDD")
          else if (kind === "color") {
            ag.updateProps(main, { ...main.props, color: "#00ff00" }, { ...main.props })
          } else if (kind === "virtual-color") {
            const virtual = main.children[0]!
            ag.updateProps(virtual, { ...virtual.props, color: "#00ff00" }, { ...virtual.props })
          } else if (kind === "remove") ag.removeChild(main, main.children[1]!)
          else {
            const moving = kind === "insert" ? donor.children[0]! : main.children[1]!
            ag.insertChild(main, moving, 0)
            expect(main.children[0]).toBe(moving)
          }
        }
      }
      ag.layout({ cols: 40, rows: 60 })
      const actual = ag.render(),
        expectedAg = createAg(oracle.getContainer())
      expectedAg.layout({ cols: 40, rows: 60 })
      expect(compareBuffers(actual.buffer, expectedAg.render({ fresh: true }).buffer)).toBeNull()
      expect(actual.frame.text).toContain(
        kind === "text"
          ? "DDDD"
          : kind === "reorder"
            ? "BBBBAAAA"
            : kind === "insert"
              ? "CCCC00AA"
              : kind === "move"
                ? "CCCC01"
                : "AAAA",
      )
    } finally {
      app.unmount()
      oracle.unmount()
    }
  })
  describe("pipeline integration", () => {
    test("simple text renders correctly", () => {
      const render = createRenderer({ cols: 40, rows: 10 })
      const app = render(<Text>Hello World</Text>)
      expect(app.text).toContain("Hello World")
    })

    test("layout works when loggily spans are disabled", () => {
      const prevTrace = process.env.TRACE
      delete process.env.TRACE
      try {
        const render = createRenderer({ cols: 40, rows: 10 })
        const app = render(<Text>No span logger required</Text>)
        expect(app.text).toContain("No span logger required")
      } finally {
        if (prevTrace === undefined) delete process.env.TRACE
        else process.env.TRACE = prevTrace
      }
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
      const root = makeNode("silvery-box", {}, [
        makeNode("silvery-box", { position: "sticky", stickyBottom: 0 }, []),
      ])
      const features = detectPipelineFeatures(root)
      expect(features.hasScroll).toBe(false)
      expect(features.hasSticky).toBe(true)
    })

    test("detectPipelineFeatures: detects both scroll and sticky", () => {
      const root = makeNode("silvery-box", {}, [
        makeNode("silvery-box", { overflow: "scroll" }, [
          makeNode("silvery-box", { position: "sticky" }, []),
        ]),
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
