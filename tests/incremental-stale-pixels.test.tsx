/**
 * Incremental Rendering: Stale Pixel Tests
 *
 * Tests that conditionally removing children doesn't leave stale pixels
 * when using incremental rendering (buffer clone + subtree skip).
 *
 * Incremental rendering is now enabled by default. These tests verify
 * the same code path as the live scheduler catches stale pixel bugs.
 */

import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.js"
import { createRenderer, stripAnsi } from "inkx/testing"

const render = createRenderer({ incremental: true })

describe("Incremental rendering: conditional child removal", () => {
  test("removed child text disappears from buffer", () => {
    function App({ show }: { show: boolean }) {
      return (
        <Box flexDirection="column" width={30}>
          <Text>Header</Text>
          {show && <Text>Status message</Text>}
          <Text>Footer</Text>
        </Box>
      )
    }

    const app = render(<App show={true} />)
    expect(app.text).toContain("Status message")
    expect(app.text).toContain("Header")
    expect(app.text).toContain("Footer")

    // Remove the conditional child
    app.rerender(<App show={false} />)
    expect(app.text).not.toContain("Status message")
    expect(app.text).toContain("Header")
    expect(app.text).toContain("Footer")
  })

  test("removed child in flexGrow parent disappears", () => {
    // This is the exact scenario from the bug: a flexGrow=1 parent keeps
    // the same dimensions when a child is removed, so contentDirty never
    // fires on the parent. Without childrenDirty, stale pixels persist.
    function App({ show }: { show: boolean }) {
      return (
        <Box flexDirection="column" width={40}>
          <Box flexDirection="column">
            <Text>Always visible</Text>
            {show && <Text>Temporary status</Text>}
          </Box>
          <Text>Bottom bar</Text>
        </Box>
      )
    }

    const app = render(<App show={true} />)
    expect(app.text).toContain("Temporary status")

    app.rerender(<App show={false} />)
    expect(app.text).not.toContain("Temporary status")
    expect(app.text).toContain("Always visible")
    expect(app.text).toContain("Bottom bar")
  })

  test("sibling content survives when one child is removed", () => {
    function App({ count }: { count: number }) {
      return (
        <Box flexDirection="column" width={30}>
          <Text>Item A</Text>
          {count > 0 && <Text>Item B</Text>}
          {count > 1 && <Text>Item C</Text>}
          <Text>Item D</Text>
        </Box>
      )
    }

    const app = render(<App count={2} />)
    expect(app.text).toContain("Item A")
    expect(app.text).toContain("Item B")
    expect(app.text).toContain("Item C")
    expect(app.text).toContain("Item D")

    // Remove Item C only
    app.rerender(<App count={1} />)
    expect(app.text).toContain("Item A")
    expect(app.text).toContain("Item B")
    expect(app.text).not.toContain("Item C")
    expect(app.text).toContain("Item D")

    // Remove Item B too
    app.rerender(<App count={0} />)
    expect(app.text).toContain("Item A")
    expect(app.text).not.toContain("Item B")
    expect(app.text).not.toContain("Item C")
    expect(app.text).toContain("Item D")
  })

  test("adding a child back after removal works correctly", () => {
    function App({ show }: { show: boolean }) {
      return (
        <Box flexDirection="column" width={30}>
          <Text>Top</Text>
          {show && <Text>Middle</Text>}
          <Text>Bottom</Text>
        </Box>
      )
    }

    const app = render(<App show={true} />)
    expect(app.text).toContain("Middle")

    // Remove
    app.rerender(<App show={false} />)
    expect(app.text).not.toContain("Middle")

    // Add back
    app.rerender(<App show={true} />)
    expect(app.text).toContain("Middle")
    expect(app.text).toContain("Top")
    expect(app.text).toContain("Bottom")
  })
})
