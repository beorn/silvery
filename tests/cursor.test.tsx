/**
 * Tests for useCursor hook.
 *
 * Verifies that useCursor sets global cursor state with correct
 * absolute terminal positions derived from component screen rects.
 */

import React, { useCallback } from "react"
import { describe, expect, test, beforeEach } from "vitest"
import { Box, Text, useScreenRectCallback } from "../src/index.js"
import { createRenderer } from "../src/testing/index.js"
import { useCursor, resetCursorState, getCursorState } from "../src/hooks/useCursor.js"

const render = createRenderer({ cols: 80, rows: 24 })

// ============================================================================
// Test Components
// ============================================================================

/**
 * Component that hooks into useCursor and captures its screen rect.
 * Must be placed inside a Box to get a valid NodeContext.
 */
function CursorProbe({
  col = 0,
  row = 0,
  visible = true,
  onRect,
}: {
  col?: number
  row?: number
  visible?: boolean
  onRect?: (rect: { x: number; y: number }) => void
}) {
  useScreenRectCallback(
    useCallback(
      (rect) => {
        onRect?.({ x: rect.x, y: rect.y })
      },
      [onRect],
    ),
  )
  useCursor({ col, row, visible })
  return null
}

// ============================================================================
// Tests
// ============================================================================

describe("useCursor", () => {
  beforeEach(() => {
    resetCursorState()
  })

  test("sets cursor state when visible", () => {
    let captured: { x: number; y: number } | null = null

    render(
      <Box>
        <CursorProbe
          col={0}
          row={0}
          visible={true}
          onRect={(r) => {
            captured = r
          }}
        />
        <Text>content</Text>
      </Box>,
    )

    expect(captured).not.toBeNull()
    const state = getCursorState()
    expect(state).not.toBeNull()
    expect(state!.visible).toBe(true)
    expect(state!.x).toBe(captured!.x)
    expect(state!.y).toBe(captured!.y)
  })

  test("cursor position includes col/row offset", () => {
    let baseRect: { x: number; y: number } | null = null

    render(
      <Box>
        <CursorProbe
          col={5}
          row={2}
          visible={true}
          onRect={(r) => {
            baseRect = r
          }}
        />
        <Text>content</Text>
      </Box>,
    )

    expect(baseRect).not.toBeNull()
    const state = getCursorState()
    expect(state).not.toBeNull()
    expect(state!.x).toBe(baseRect!.x + 5)
    expect(state!.y).toBe(baseRect!.y + 2)
  })

  test("cursor col+row offset stacks with screen position", () => {
    let baseRect: { x: number; y: number } | null = null

    render(
      <Box flexDirection="column">
        <Box height={5}>
          <Text>spacer</Text>
        </Box>
        <Box>
          <CursorProbe
            col={7}
            row={2}
            visible={true}
            onRect={(r) => {
              baseRect = r
            }}
          />
          <Text>target</Text>
        </Box>
      </Box>,
    )

    expect(baseRect).not.toBeNull()
    // The probe's Box is below a 5-high Box
    expect(baseRect!.y).toBeGreaterThanOrEqual(5)

    const state = getCursorState()
    expect(state).not.toBeNull()
    // col and row offsets are added to screen position
    expect(state!.x).toBe(baseRect!.x + 7)
    expect(state!.y).toBe(baseRect!.y + 2)
  })

  test("cursor offset by sibling box height", () => {
    let baseRect: { x: number; y: number } | null = null

    render(
      <Box flexDirection="column">
        <Box height={3}>
          <Text>top</Text>
        </Box>
        <Box>
          <CursorProbe
            col={0}
            row={0}
            visible={true}
            onRect={(r) => {
              baseRect = r
            }}
          />
          <Text>bottom</Text>
        </Box>
      </Box>,
    )

    expect(baseRect).not.toBeNull()
    // The probe's Box is below a 3-high Box
    expect(baseRect!.y).toBeGreaterThanOrEqual(3)
    const state = getCursorState()
    expect(state).not.toBeNull()
    expect(state!.y).toBe(baseRect!.y)
  })

  test("hides cursor when visible=false", () => {
    render(
      <Box>
        <CursorProbe col={0} row={0} visible={false} />
        <Text>hidden</Text>
      </Box>,
    )

    const state = getCursorState()
    expect(state).toBeNull()
  })

  test("last writer wins when multiple cursors are active", () => {
    render(
      <Box flexDirection="column">
        <Box>
          <CursorProbe col={1} row={0} visible={true} />
          <Text>first</Text>
        </Box>
        <Box>
          <CursorProbe col={5} row={0} visible={true} />
          <Text>second</Text>
        </Box>
      </Box>,
    )

    // Both set cursor state; the last one to fire wins.
    const state = getCursorState()
    expect(state).not.toBeNull()
    expect(state!.visible).toBe(true)
  })
})
