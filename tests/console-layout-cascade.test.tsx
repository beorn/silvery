/**
 * Incremental Rendering: Console Layout Cascade
 *
 * Bug: When a component at the bottom grows (like Console receiving debug output),
 * the flexGrow sibling shrinks. The incremental renderer clears the root region
 * (because childPositionChanged=true) but then children must correctly re-render.
 *
 * Reproduces km-inkx.debug-blank: blank screen when debug logging causes Console
 * component to grow, triggering layout cascade in incremental renderer.
 */

import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.js"
import { bufferToText } from "../src/buffer.js"
import { createRenderer } from "../src/testing/index.js"
import { compareBuffers, formatMismatch } from "../src/testing/compare-buffers.js"

const render = createRenderer({ incremental: true })

function assertBuffersMatch(app: ReturnType<typeof render>): void {
  const fresh = app.freshRender()
  const current = app.lastBuffer()!
  const mismatch = compareBuffers(current, fresh)
  if (mismatch) {
    const msg = formatMismatch(mismatch, {
      incrementalText: bufferToText(current),
      freshText: bufferToText(fresh),
    })
    expect.fail(`Incremental/fresh mismatch:\n${msg}`)
  }
}

describe("Incremental rendering: console layout cascade", () => {
  /**
   * CORE CASE: Header + flexGrow body + footer.
   * Footer grows by one line → body shrinks → verify no blank screen.
   */
  test("footer growth triggers correct re-render of all siblings", () => {
    let setLines: (lines: string[]) => void

    function App() {
      const [lines, _setLines] = useState<string[]>([])
      setLines = _setLines

      return (
        <Box flexDirection="column" width={40} height={20}>
          {/* Fixed header */}
          <Box>
            <Text backgroundColor="white" color="black">
              {"Header: Status Bar Content Here!"}
            </Text>
          </Box>

          {/* FlexGrow body (like Board content) */}
          <Box flexDirection="column" flexGrow={1}>
            <Text>Body line 1: Hello World</Text>
            <Text>Body line 2: More content here</Text>
            <Text>Body line 3: Even more stuff</Text>
          </Box>

          {/* Footer that grows (like Console component) */}
          <Box flexDirection="column">
            <Text>Footer</Text>
            {lines.map((line, i) => (
              <Text key={i}>{line}</Text>
            ))}
          </Box>
        </Box>
      )
    }

    const app = render(<App />)

    // Render #1: initial full render
    assertBuffersMatch(app)

    // Render #2: footer grows by one line (simulates debug output)
    setLines!(["DEBUG: some debug output"])
    assertBuffersMatch(app)

    // Render #3: footer grows again
    setLines!(["DEBUG: some debug output", "DEBUG: more debug output"])
    assertBuffersMatch(app)
  })

  /**
   * Same as above but with dimColor on body text (the dimColor fix scenario).
   * Body text uses dimColor which was previously missing from styleProps.
   */
  test("footer growth + dimColor change on body text", () => {
    let setLines: (lines: string[]) => void
    let setDim: (dim: boolean) => void

    function App() {
      const [lines, _setLines] = useState<string[]>([])
      const [dim, _setDim] = useState(false)
      setLines = _setLines
      setDim = _setDim

      return (
        <Box flexDirection="column" width={40} height={20}>
          <Box>
            <Text backgroundColor="white" color="black">
              {"Header: Status Bar"}
            </Text>
          </Box>

          <Box flexDirection="column" flexGrow={1}>
            <Text dimColor={dim}>Body: card content</Text>
            <Text dimColor={dim}>Body: more card text</Text>
          </Box>

          <Box flexDirection="column">
            <Text>Footer</Text>
            {lines.map((line, i) => (
              <Text key={i}>{line}</Text>
            ))}
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    assertBuffersMatch(app)

    // Simultaneous: footer grows + body gets dimmed (like cursor move + debug)
    setLines!(["DEBUG: output"])
    setDim!(true)
    assertBuffersMatch(app)
  })

  /**
   * Multiple children move: footer grows, sibling positions shift.
   * Tests childPositionChanged cascade on parent.
   */
  test("footer growth shifts middle siblings correctly", () => {
    let setLines: (lines: string[]) => void

    function App() {
      const [lines, _setLines] = useState<string[]>([])
      setLines = _setLines

      return (
        <Box flexDirection="column" width={40} height={20}>
          <Box>
            <Text>Top bar</Text>
          </Box>

          <Box flexDirection="column" flexGrow={1}>
            <Text>Main content area</Text>
          </Box>

          <Box>
            <Text>Status: OK</Text>
          </Box>

          <Box flexDirection="column">
            <Text>Console:</Text>
            {lines.map((line, i) => (
              <Text key={i}>{line}</Text>
            ))}
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    assertBuffersMatch(app)

    // Console grows → Status bar moves up → body shrinks
    setLines!(["line 1"])
    assertBuffersMatch(app)

    setLines!(["line 1", "line 2"])
    assertBuffersMatch(app)

    setLines!(["line 1", "line 2", "line 3"])
    assertBuffersMatch(app)
  })

  /**
   * Edge case: rapid consecutive growth (multiple lines at once).
   */
  test("rapid footer growth (multiple lines at once)", () => {
    let setLines: (lines: string[]) => void

    function App() {
      const [lines, _setLines] = useState<string[]>([])
      setLines = _setLines

      return (
        <Box flexDirection="column" width={60} height={15}>
          <Box backgroundColor="blue">
            <Text color="white">Header</Text>
          </Box>

          <Box flexDirection="column" flexGrow={1} backgroundColor="cyan">
            <Text>Body content with background</Text>
          </Box>

          <Box flexDirection="column">
            {lines.map((line, i) => (
              <Text key={i}>{line}</Text>
            ))}
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    assertBuffersMatch(app)

    // Jump from 0 to 5 lines at once
    setLines!(["a", "b", "c", "d", "e"])
    assertBuffersMatch(app)
  })

  /**
   * SCROLL CONTAINER: Board uses overflow="scroll" for its content.
   * When Console grows, the scroll container shrinks. This tests the
   * scroll container rendering path specifically.
   */
  test("scroll container sibling shrinks when footer grows", () => {
    let setLines: (lines: string[]) => void

    function App() {
      const [lines, _setLines] = useState<string[]>([])
      setLines = _setLines

      return (
        <Box flexDirection="column" width={60} height={30}>
          {/* Header */}
          <Box>
            <Text backgroundColor="white" color="black">
              Header Bar
            </Text>
          </Box>

          {/* Scrollable body (like km Board) */}
          <Box flexDirection="column" flexGrow={1} overflow="scroll">
            {Array.from({ length: 50 }, (_, i) => (
              <Box key={i} borderStyle="single" width={58}>
                <Text>{`Card ${i}: Some content text here`}</Text>
              </Box>
            ))}
          </Box>

          {/* Bottom bar */}
          <Box>
            <Text>Status: OK</Text>
          </Box>

          {/* Console footer that grows */}
          <Box flexDirection="column">
            {lines.map((line, i) => (
              <Text key={i}>{line}</Text>
            ))}
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    assertBuffersMatch(app)

    // Console grows → scroll container viewport shrinks
    setLines!(["DEBUG: first line"])
    assertBuffersMatch(app)

    setLines!(["DEBUG: first line", "DEBUG: second line"])
    assertBuffersMatch(app)
  })

  /**
   * SCROLL CONTAINER + BORDER COLOR CHANGE: Simulates cursor move + debug output.
   * This is the exact km scenario: cursor moves between cards (borderColor changes)
   * while Console receives debug output (layout cascade).
   */
  test("scroll container with borderColor change + footer growth", () => {
    let setLines: (lines: string[]) => void
    let setSelected: (idx: number) => void

    function App() {
      const [lines, _setLines] = useState<string[]>([])
      const [selected, _setSelected] = useState(0)
      setLines = _setLines
      setSelected = _setSelected

      return (
        <Box flexDirection="column" width={60} height={30}>
          <Box>
            <Text backgroundColor="white" color="black">
              Header
            </Text>
          </Box>

          <Box flexDirection="column" flexGrow={1} overflow="scroll">
            {Array.from({ length: 20 }, (_, i) => (
              <Box key={i} borderStyle="single" borderColor={i === selected ? "yellow" : "blackBright"} width={58}>
                <Text dimColor={i !== selected}>{`Card ${i}: content text`}</Text>
              </Box>
            ))}
          </Box>

          <Box>
            <Text>Status</Text>
          </Box>

          <Box flexDirection="column">
            {lines.map((line, i) => (
              <Text key={i}>{line}</Text>
            ))}
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    assertBuffersMatch(app)

    // Cursor move + debug output simultaneously
    setSelected!(1)
    setLines!(["DEBUG: cursor moved"])
    assertBuffersMatch(app)

    // Another cursor move + more debug
    setSelected!(2)
    setLines!(["DEBUG: cursor moved", "DEBUG: layout recalc"])
    assertBuffersMatch(app)
  })
})
