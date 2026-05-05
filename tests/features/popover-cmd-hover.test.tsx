import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, PopoverProvider, Text, usePopoverHandlers } from "@silvery/ag-react"

const settle = (ms = 60) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function HoverTarget(): React.ReactElement {
  const popover = usePopoverHandlers({
    body: <Text>POPOVER-BODY</Text>,
    maxWidth: 40,
    flushTop: true,
  })
  return (
    <Box flexDirection="column">
      <Box onMouseEnter={popover.onMouseEnter} onMouseLeave={popover.onMouseLeave}>
        <Text>Hover target</Text>
      </Box>
      <Text>Other row</Text>
    </Box>
  )
}

describe("Popover Cmd hover", () => {
  test("plain hover does not open cmd-hover popovers", async () => {
    const render = createRenderer({ cols: 80, rows: 10, kittyMode: true })
    const app = render(
      <PopoverProvider>
        <HoverTarget />
      </PopoverProvider>,
    )

    await app.hover(1, 0)
    await settle(650)

    expect(app.text).not.toContain("POPOVER-BODY")
  })

  test("stays open after the dwell timer while Cmd is still held", async () => {
    // `autoRender: true` is required so the setTimeout-driven `popover.show`
    // setState in the Provider triggers a doRender via the React commit hook
    // — without it the React tree updates but the buffer is never repainted,
    // and `app.text` keeps returning the pre-show snapshot.
    const render = createRenderer({ cols: 80, rows: 10, kittyMode: true, autoRender: true })
    const app = render(
      <PopoverProvider>
        <HoverTarget />
      </PopoverProvider>,
    )

    await app.hover(1, 0)
    app.stdin.write("\x1b[57444;9:1u")
    await settle(650)

    expect(app.text).toContain("POPOVER-BODY")

    await settle(350)
    expect(app.text).toContain("POPOVER-BODY")
  })
})
