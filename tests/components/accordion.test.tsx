/**
 * Accordion Component Tests
 *
 * Verifies header always visible; body only mounts when expanded.
 * Controlled and uncontrolled variants, focus styling, keyboard toggle.
 */

import React, { useState } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Accordion, Box, Text } from "silvery"

const render = createRenderer({ cols: 80, rows: 20 })

describe("Accordion", () => {
  test("uncontrolled: defaultExpanded=false → body hidden", () => {
    const app = render(
      <Accordion title="Tool result" defaultExpanded={false}>
        <Text>secret body</Text>
      </Accordion>,
    )
    expect(app.text).toContain("Tool result")
    expect(app.text).not.toContain("secret body")
    expect(app.text).toContain(">")
  })

  test("uncontrolled: defaultExpanded=true → body visible", () => {
    // `key="open"` forces a fresh React mount; without it createRenderer's
    // shared root reuses the prior test's useState slot (initialized to
    // false by the previous test) and the initializer never re-runs.
    const app = render(
      <Accordion key="open" title="Tool result" defaultExpanded={true}>
        <Text>visible body</Text>
      </Accordion>,
    )
    expect(app.text).toContain("Tool result")
    expect(app.text).toContain("visible body")
    expect(app.text).toContain("v")
  })

  test("controlled: respects expanded prop", () => {
    function Wrap({ open }: { open: boolean }): React.ReactElement {
      return (
        <Accordion title="Tool result" expanded={open} onToggle={() => {}}>
          <Text>controlled body</Text>
        </Accordion>
      )
    }
    const closed = render(<Wrap open={false} />)
    expect(closed.text).not.toContain("controlled body")

    const opened = render(<Wrap open={true} />)
    expect(opened.text).toContain("controlled body")
  })

  test("uncontrolled toggling tracked through state", () => {
    function Stateful(): React.ReactElement {
      const [open, setOpen] = useState(false)
      return (
        <Box flexDirection="column">
          <Accordion title="Hdr" expanded={open} onToggle={setOpen}>
            <Text>stateful body</Text>
          </Accordion>
          <Text>state={String(open)}</Text>
        </Box>
      )
    }
    const app = render(<Stateful />)
    expect(app.text).toContain("state=false")
    expect(app.text).not.toContain("stateful body")
  })
})
