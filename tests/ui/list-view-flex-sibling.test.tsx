/**
 * ListView flex-sibling regression test.
 *
 * Originally reported as: ListView with explicit `height={N}` absorbs all
 * rows below flex-shrink:0 siblings (Composer never renders).
 *
 * Root cause (discovered via `apps/km-agent-view` smoke):
 *   In the `run(element, term)` path, `createApp` constructed the
 *   TermContext's Term via `createTerm({ color: "truecolor" })`, which
 *   routes to `createNodeTerm` and reads `term.size` from
 *   `process.stdout.columns/rows` — the HOST's stdout, not the emulator's
 *   dims. `useWindowSize()` reported 80×24 even when the termless/
 *   emulator viewport was 120×20. Apps that did
 *   `<Box height={termRows}>` then oversized their column, pushing
 *   `flexShrink={0}` sibling rows below the visible viewport.
 *
 * Fix: seed the mock Term with the app's actual dims so it routes through
 * `createHeadlessTerm` + `createFixedSize`. Resize events are bridged to
 * `size.update(cols, rows)` so useTerm subscribers still re-render.
 *
 * Bead: km-silvery.listview-flex-sibling
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, createTermless } from "@silvery/test"
import { Box, Text, useWindowSize } from "@silvery/ag-react"
import { run } from "@silvery/ag-term/runtime"
import { ListView } from "../../packages/ag-react/src/ui/components/ListView"

interface Item {
  id: string
  title: string
}

function makeItems(n: number): Item[] {
  return Array.from({ length: n }, (_, i) => ({ id: `item-${i}`, title: `Item ${i}` }))
}

describe("ListView — flex sibling coexistence", () => {
  test("header + ListView + footer all render when column height is fixed", () => {
    const rows = 20
    const r = createRenderer({ cols: 40, rows })
    const items = makeItems(50)

    // Column sized to the terminal. Header + footer pinned to 1 row each.
    // ListView gets the remaining 18 rows. This is the km-agent-view repro.
    const listHeight = rows - 2

    const app = r(
      <Box flexDirection="column" height={rows} width="100%">
        <Box flexShrink={0} height={1} width="100%">
          <Text>HEADER-ROW</Text>
        </Box>
        <ListView
          items={items}
          height={listHeight}
          nav
          cursorKey={items.length - 1}
          getKey={(it) => it.id}
          renderItem={(item, _i, meta) => (
            <Text>
              {meta.isCursor ? "> " : "  "}
              {item.title}
            </Text>
          )}
        />
        <Box flexShrink={0} width="100%">
          <Text>FOOTER-ROW</Text>
        </Box>
      </Box>,
    )

    // Header MUST be on the first row.
    expect(app.lines[0]).toContain("HEADER-ROW")

    // Footer MUST be visible somewhere on screen — the repro claim is that
    // Composer (with flexShrink=0 and NO explicit height — auto-sized from
    // text content) never shows up because ListView's scroll container
    // absorbs all the rows below the header.
    const footerFound = app.lines.some((line) => line.includes("FOOTER-ROW"))
    expect(footerFound).toBe(true)

    // And it should be at the bottom since 1+18+1 = 20 = rows exactly.
    expect(app.lines[rows - 1]).toContain("FOOTER-ROW")
  })

  test("header + ListView + footer all render when outer column height is omitted", () => {
    // No explicit height on outer column — relies on flex math from the
    // terminal's natural size. This is the "just render a layout" case.
    const rows = 20
    const r = createRenderer({ cols: 40, rows })
    const items = makeItems(50)

    const app = r(
      <Box flexDirection="column" width="100%">
        <Box flexShrink={0} height={1} width="100%">
          <Text>HEADER-ROW</Text>
        </Box>
        <ListView
          items={items}
          height={rows - 2}
          renderItem={(item) => <Text>{item.title}</Text>}
        />
        <Box flexShrink={0} height={1} width="100%">
          <Text>FOOTER-ROW</Text>
        </Box>
      </Box>,
    )

    expect(app.lines[0]).toContain("HEADER-ROW")
    // Footer should be at row index = headerRow + listHeight = 1 + 18 = 19.
    expect(app.lines[rows - 1]).toContain("FOOTER-ROW")
  })

  test("termless: header + ListView + auto-height footer all render (real runtime)", async () => {
    // Real runtime path through the 5-phase pipeline. This matches the
    // km-agent-view scenario exactly — if the createRenderer path works
    // but this one doesn't, the bug is in runtime composition, not layout.
    //
    // Crucially, the footer here has NO explicit height (auto-sized from
    // its Text child) — the same shape as km-agent-view's Composer. With
    // `flexShrink={0}` it MUST still be preserved.
    using term = createTermless({ cols: 40, rows: 20 })
    const items = makeItems(50)

    function AppUnderTest(): React.ReactElement {
      return (
        <Box flexDirection="column" height={20} width="100%">
          <Box flexShrink={0} height={1} width="100%">
            <Text>HEADER-ROW</Text>
          </Box>
          <ListView
            items={items}
            height={18}
            nav
            cursorKey={items.length - 1}
            getKey={(it) => it.id}
            renderItem={(item, _i, meta) => (
              <Text>
                {meta.isCursor ? "> " : "  "}
                {item.title}
              </Text>
            )}
          />
          <Box flexDirection="row" flexShrink={0} width="100%">
            <Text>FOOTER-PIN</Text>
          </Box>
        </Box>
      )
    }

    const handle = await run(<AppUnderTest />, term)

    const text = term.screen.getText()
    expect(text).toContain("HEADER-ROW")
    // The core claim of the bug: FOOTER-PIN never appears because
    // ListView's inner scroll container consumed all rows below.
    expect(text).toContain("FOOTER-PIN")

    handle.unmount()
  })

  test("termless: useWindowSize reports ACTUAL emulator dims (regression)", async () => {
    // The real fix. `run(element, term)` must thread the emulator's dims
    // into TermContext.term.size — otherwise useWindowSize() returns the
    // HOST process's stdout dims (often 80×24 in tests), and apps that lay
    // out relative to termRows size themselves wrong.
    using term = createTermless({ cols: 120, rows: 20 })

    let capturedCols = -1
    let capturedRows = -1

    function DimsProbe(): React.ReactElement {
      const { columns, rows } = useWindowSize()
      capturedCols = columns
      capturedRows = rows
      return (
        <Box flexDirection="column">
          <Text>
            dims={columns}x{rows}
          </Text>
        </Box>
      )
    }

    const handle = await run(<DimsProbe />, term)

    expect(capturedCols).toBe(120)
    expect(capturedRows).toBe(20)

    handle.unmount()
  })

  test("termless: flex-column with header + ListView + auto-height footer, via useWindowSize", async () => {
    // End-to-end repro that mirrors km-agent-view v0 scaffold. Before the
    // fix, useWindowSize() returned 80×24 inside a 120×20 emulator, so
    // `listHeight = termRows - 2 = 22` overflowed the viewport and pushed
    // FOOTER-PIN off the bottom. After the fix, termRows=20 / listHeight=18
    // and all three siblings render.
    using term = createTermless({ cols: 120, rows: 20 })
    const items = makeItems(50)

    function AppUnderTest(): React.ReactElement {
      const { rows: termRows } = useWindowSize()
      const listHeight = Math.max(1, termRows - 2)
      return (
        <Box flexDirection="column" height={termRows} width="100%">
          <Box flexShrink={0} height={1} width="100%">
            <Text>HEADER-ROW</Text>
          </Box>
          <ListView
            items={items}
            height={listHeight}
            nav
            cursorKey={items.length - 1}
            getKey={(it) => it.id}
            renderItem={(item, _i, meta) => (
              <Text>
                {meta.isCursor ? "> " : "  "}
                {item.title}
              </Text>
            )}
          />
          <Box flexDirection="row" flexShrink={0} width="100%">
            <Text>FOOTER-PIN</Text>
          </Box>
        </Box>
      )
    }

    const handle = await run(<AppUnderTest />, term)

    const text = term.screen.getText()
    expect(text).toContain("HEADER-ROW")
    expect(text).toContain("FOOTER-PIN")

    handle.unmount()
  })

  test("ListView honors its explicit height when parent has more room", () => {
    // Outer column has 20 rows. ListView asks for only 5. The remaining 15
    // rows should be available for a footer — it must not grow to fill.
    const rows = 20
    const r = createRenderer({ cols: 40, rows })
    const items = makeItems(50)

    const app = r(
      <Box flexDirection="column" height={rows} width="100%">
        <ListView items={items} height={5} renderItem={(item) => <Text>{item.title}</Text>} />
        <Box flexShrink={0} height={1} width="100%">
          <Text>FOOTER-ROW</Text>
        </Box>
      </Box>,
    )

    // Footer should sit at row 5 (right after the 5-row ListView).
    expect(app.lines[5]).toContain("FOOTER-ROW")
  })
})
