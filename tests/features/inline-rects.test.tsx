/**
 * Inline Rects — virtual text nodes (nested <Text>) get screen-space rects
 * computed during text rendering, enabling hit testing and mouse events.
 */

import React from "react"
import { describe, test, expect, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/react"

describe("inline rects", () => {
  test("nested Text gets inlineRects after render", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Text>
        Hello{" "}
        <Text testID="inner" color="blue">
          world
        </Text>
      </Text>,
    )
    const inner = app.getByTestId("inner").resolve()
    expect(inner).not.toBeNull()
    expect(inner!.inlineRects).toBeDefined()
    expect(inner!.inlineRects!.length).toBeGreaterThan(0)
    // "world" starts after "Hello " (6 chars) at x=6
    expect(inner!.inlineRects![0]!.x).toBe(6)
    expect(inner!.inlineRects![0]!.width).toBe(5)
  })

  test("nodeAt finds nested Text via inlineRects", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Text>
        Hello{" "}
        <Text testID="link" color="blue">
          world
        </Text>
      </Text>,
    )
    const hit = app.term.nodeAt(6, 0) // "world" at col 6
    expect(hit).not.toBeNull()
    expect((hit!.props as any).testID).toBe("link")
  })

  test("onMouseEnter fires on nested Text via hover", async () => {
    const onEnter = vi.fn()
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box flexDirection="column">
        <Text>
          Hello <Text onMouseEnter={onEnter}>world</Text>
        </Text>
        <Text>other</Text>
      </Box>,
    )
    await app.hover(6, 0)
    expect(onEnter).toHaveBeenCalled()
  })

  test("onMouseLeave fires when moving away", async () => {
    const onLeave = vi.fn()
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box flexDirection="column">
        <Text>
          Hello <Text onMouseLeave={onLeave}>world</Text>
        </Text>
        <Text>other line</Text>
      </Box>,
    )
    await app.hover(6, 0) // enter
    await app.hover(0, 1) // leave
    expect(onLeave).toHaveBeenCalled()
  })

  test("onClick fires on nested Text", async () => {
    const onClick = vi.fn()
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Text>
        Click <Text onClick={onClick}>here</Text>
      </Text>,
    )
    await app.click(6, 0)
    expect(onClick).toHaveBeenCalled()
  })

  test("all virtual text nodes get inlineRects (unconditional)", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Text>
        <Text testID="plain" bold>
          bold
        </Text>{" "}
        and{" "}
        <Text testID="colored" color="red">
          red
        </Text>
      </Text>,
    )
    const plain = app.getByTestId("plain").resolve()
    const colored = app.getByTestId("colored").resolve()
    expect(plain!.inlineRects).toBeDefined()
    expect(colored!.inlineRects).toBeDefined()
  })
})
