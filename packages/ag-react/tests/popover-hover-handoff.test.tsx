import React, { act } from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, PopoverProvider, Text, usePopoverHandlers } from "../src/index.js"

const settle = (ms = 60) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function HoverTarget({ label, body }: { label: string; body: string }): React.ReactElement {
  const popover = usePopoverHandlers(
    {
      body: <Text>{body}</Text>,
      maxWidth: 32,
    },
    { trigger: "hover" },
  )

  return (
    <Box onMouseEnter={popover.onMouseEnter} onMouseLeave={popover.onMouseLeave}>
      <Text>{label}</Text>
    </Box>
  )
}

describe("Popover hover handoff", () => {
  test("moving from trigger into overlay does not re-anchor to covered rows", async () => {
    const render = createRenderer({ cols: 80, rows: 12, autoRender: true })
    const app = render(
      <PopoverProvider>
        <Box width={80} height={12} flexDirection="column">
          <HoverTarget label="top trigger" body="TOP POPOVER" />
          <Text>spacer</Text>
          <HoverTarget label="covered trigger" body="COVERED POPOVER" />
        </Box>
      </PopoverProvider>,
    )

    await act(async () => {
      await app.hover(0, 0)
      await settle(650)
    })
    expect(app.text).toContain("TOP POPOVER")

    const overlayRow = app.lines.findIndex((line) => line.includes("TOP POPOVER"))
    expect(overlayRow).toBeGreaterThanOrEqual(0)
    const overlayCol = app.lines[overlayRow]!.indexOf("TOP POPOVER")
    expect(overlayCol).toBeGreaterThanOrEqual(0)
    await act(async () => {
      await app.hover(overlayCol, overlayRow)
      await settle(650)
    })

    expect(app.text).toContain("TOP POPOVER")
    expect(app.text).not.toContain("COVERED POPOVER")
  })
})
