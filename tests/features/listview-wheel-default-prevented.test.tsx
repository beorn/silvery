/**
 * ListView wheel ownership.
 *
 * Production mouse dispatch sends wheel events through component handlers
 * first, then through the app-level `term:mouse` handler unless a component
 * calls `preventDefault()`. A scrollable ListView must claim the wheel event
 * so app-level fallback scroll code cannot become a second authority.
 */

import React, { act } from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "../../src/index.js"
import {
  createMouseEventProcessor,
  processMouseEvent,
} from "../../packages/ag-term/src/mouse-events"
import { ListView } from "../../packages/ag-react/src/ui/components/ListView"

describe("ListView wheel ownership", () => {
  test("scrollable ListView prevents default wheel fallthrough", () => {
    const items = Array.from({ length: 30 }, (_, i) => `row-${i}`)
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <ListView
        items={items}
        height={8}
        width={30}
        estimateHeight={1}
        getKey={(item) => item}
        renderItem={(item) => (
          <Box height={1} flexShrink={0}>
            <Text>{item}</Text>
          </Box>
        )}
      />,
    )
    const mouse = createMouseEventProcessor()
    let prevented = false

    act(() => {
      prevented = processMouseEvent(
        mouse,
        {
          button: 0,
          x: 2,
          y: 2,
          coordinateMode: "cell",
          action: "wheel",
          delta: 1,
          shift: false,
          meta: false,
          ctrl: false,
        },
        app.getContainer(),
      )
    })

    expect(prevented).toBe(true)
  })
})
