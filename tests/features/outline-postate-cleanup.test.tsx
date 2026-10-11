/**
 * Outline cleanup — post-state survival across frames
 *
 * Phase 2 Step 5 of paint-clear-invariant L5 (km-silvery.paint-clear-l5-bufferssink-retire).
 *
 * The decoration phase needs the previous frame's outline snapshots to clear stale
 * outline cells before drawing new ones. Historically these snapshots lived as
 * mutable state on `TerminalBuffer.outlineSnapshots` and were carried forward via
 * `buffer.clone()`. Step 5 hoists snapshots off the buffer so the decoration phase
 * runs against the PlanSink-committed buffer.
 *
 * This test is the regression guard: it exercises the outline cleanup path across
 * many frames with realistic scale (50+ nodes) and proves SILVERY_STRICT=2
 * incremental == fresh after every frame. If the post-state carrier loses the
 * snapshots between frames, the next frame fails to clear stale outline cells and
 * STRICT diverges immediately.
 *
 * Locks in CURRENT behavior before the refactor; must keep passing after.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { deriveLinkTarget } from "@silvery/ansi"
import { Box, Text } from "@silvery/ag-react"

describe("outline cleanup — post-state survives across frames", () => {
  test("realistic-scale outline migration across 10 frames preserves cleanup state", () => {
    // 5×12 = 60 nodes, well past the 50-node realistic-scale threshold.
    const render = createRenderer({ cols: 80, rows: 30 })

    function App({ outlinedIdx }: { outlinedIdx: number | null }) {
      return (
        <Box flexDirection="row">
          {Array.from({ length: 5 }).map((_, colIdx) => (
            <Box key={colIdx} flexDirection="column" width={16}>
              {Array.from({ length: 12 }).map((_, cardIdx) => {
                const idx = colIdx * 12 + cardIdx
                return (
                  <Box
                    key={cardIdx}
                    id={`card-${idx}`}
                    outlineStyle={outlinedIdx === idx ? "round" : undefined}
                    outlineColor="cyan"
                    width={14}
                    height={1}
                  >
                    <Text>card-{idx}</Text>
                  </Box>
                )
              })}
            </Box>
          ))}
        </Box>
      )
    }

    // Frame 0: no outlines (establishes prev buffer with no snapshots).
    const app = render(<App outlinedIdx={null} />)
    expect(app.text).toContain("card-0")
    expect(app.text).toContain("card-59")

    // Frames 1-10: walk the outline through ten different cards. Each
    // transition requires the previous frame's snapshots to clear stale
    // outline cells, then capture fresh snapshots for the next frame.
    // SILVERY_STRICT=2 (default) verifies incremental == fresh every frame.
    const sequence = [0, 5, 12, 19, 25, 33, 40, 47, 53, 59]
    for (const idx of sequence) {
      app.rerender(<App outlinedIdx={idx} />)
      expect(app.text).toContain(`card-${idx}`)
    }

    // Final frame: clear all outlines. The last snapshot set must be
    // honored so card-59's outline cells get restored.
    app.rerender(<App outlinedIdx={null} />)
    // All cards still readable, no stale outline pixels intruding.
    expect(app.text).toContain("card-0")
    expect(app.text).toContain("card-59")
  })

  test("outline toggled on then off twenty times in a row — no leaked snapshots", () => {
    // Cumulative test: on/off oscillation is the worst case for snapshot
    // tracking — every frame the previous snapshots must be applied AND
    // a fresh set must be captured (or, on off frames, an empty set).
    // Pinned width/height with reservedHeight that accounts for outline
    // expansion (round outline adds 2 rows above + below).
    const render = createRenderer({ cols: 30, rows: 16 })

    function App({ outlined }: { outlined: boolean }) {
      return (
        <Box flexDirection="column" padding={1} gap={2} width={30} height={16}>
          <Box id="card-1" outlineStyle={outlined ? "round" : undefined} width={10} height={3}>
            <Text>One</Text>
          </Box>
          <Box id="card-2" width={10} height={3}>
            <Text>Two</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App outlined={false} />)

    for (let i = 0; i < 20; i++) {
      app.rerender(<App outlined={true} />)
      expect(app.text).toContain("One")
      expect(app.text).toContain("Two")
      app.rerender(<App outlined={false} />)
      expect(app.text).toContain("One")
      expect(app.text).toContain("Two")
    }
  })
})

const LINK_TARGETS = Array.from({ length: 60 }, (_, i) =>
  deriveLinkTarget(`file:///tmp/card-${i}.ts`),
)

function LinkedOutlineCards({ outlined }: { outlined: boolean }) {
  return (
    <Box width={80} height={30} flexDirection="row">
      {Array.from({ length: 5 }, (_, col) => (
        <Box key={col} width={16} flexDirection="column">
          {Array.from({ length: 12 }, (_, row) => {
            const i = col * 12 + row
            return (
              <Box
                key={row}
                width={14}
                height={1}
                outlineStyle={outlined && i === 0 ? "round" : undefined}
              >
                <Text internal_hyperlink={LINK_TARGETS[i]}>card-{i}</Text>
              </Box>
            )
          })}
        </Box>
      ))}
    </Box>
  )
}

test("outline removal restores producer provenance underneath a clean linked row", () => {
  const render = createRenderer({ cols: 80, rows: 30 })
  const app = render(<LinkedOutlineCards outlined={true} />)
  expect(app.lines[1]).toContain("──")
  app.rerender(<LinkedOutlineCards outlined={false} />)
  expect(app.lines[1]).toContain("card-1")
  expect(app.cell(0, 1).hyperlink).toBe("file:///tmp/card-1.ts")
  expect(app.ansi).toContain("file:///tmp/card-1.ts")
  app.unmount()
})

test("an outline covering a wide continuation restores its whole generated-link pair", () => {
  const render = createRenderer({ cols: 80, rows: 30 })
  const target = deriveLinkTarget("file:///tmp/wide.ts")
  const scene = (outlined: boolean) => (
    <Box width={80} height={30} flexDirection="column">
      <Text>header</Text>
      <Text internal_hyperlink={target}>a界z</Text>
      {Array.from({ length: 55 }, (_, i) => (
        <Text key={i}>row-{i}</Text>
      ))}
      <Box
        position="absolute"
        left={3}
        top={1}
        width={8}
        height={1}
        outlineStyle={outlined ? "round" : undefined}
      />
    </Box>
  )
  const app = render(scene(true))
  app.rerender(scene(false))
  expect(app.cell(1, 1).char).toBe("界")
  expect(app.cell(1, 1).wide).toBe(true)
  expect(app.cell(2, 1).continuation).toBe(true)
  expect(app.ansi).toContain("file:///tmp/wide.ts")
  app.unmount()
})

test("overlapping outlines restore clean generated links after sequential removal", () => {
  const render = createRenderer({ cols: 80, rows: 30 })
  const target = deriveLinkTarget("file:///tmp/overlap.ts")
  const scene = (first: boolean, second: boolean) => (
    <Box width={80} height={30} flexDirection="column">
      {Array.from({ length: 30 }, (_, i) => (
        <Text key={i} internal_hyperlink={target}>
          row-{i}-abcdefghijklmnopqrstuv
        </Text>
      ))}
      <Box
        position="absolute"
        left={2}
        top={2}
        width={10}
        height={2}
        outlineColor="red"
        outlineStyle={first ? "round" : undefined}
      />
      <Box
        position="absolute"
        left={5}
        top={3}
        width={10}
        height={2}
        outlineColor="blue"
        outlineStyle={second ? "single" : undefined}
      />
    </Box>
  )
  const app = render(scene(true, true))
  app.rerender(scene(true, false))
  app.rerender(scene(false, false))
  expect(app.lines[1]).toContain("row-1-abcdefghijklmnopqrstuv")
  expect(app.lines[2]).toContain("row-2-abcdefghijklmnopqrstuv")
  expect(app.ansi).toContain("file:///tmp/overlap.ts")
  app.unmount()
})
