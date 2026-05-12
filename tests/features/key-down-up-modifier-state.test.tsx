/**
 * `app.keyDown(key)` / `app.keyUp(key)` — held-state modifier primitives.
 *
 * Pre-existing `app.press(key)` fires a single press+(implicit-release)
 * event, which is correct for shortcut keystrokes (Ctrl+S, Enter) but
 * not for held-modifier scenarios where a popover dwell timer reads the
 * still-held modifier from the input store after the hover event fires.
 * Those tests previously hand-wrote `app.stdin.write("\x1b[57444;9:1u")`
 * to inject the Kitty Left-Super press; this contract pins the new
 * `keyDown(key)` / `keyUp(key)` primitives that replace that pattern.
 *
 * Bead: @km/silvery/keydown-keyup-test-primitives.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, PopoverProvider, Text, useModifierKeys, usePopoverHandlers } from "@silvery/ag-react"

const settle = (ms = 60) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function ModifierProbe({
  onChange,
}: {
  onChange: (v: { super: boolean }) => void
}): React.ReactElement {
  const mods = useModifierKeys({ enabled: true })
  React.useEffect(() => {
    onChange({ super: mods.super })
  }, [mods.super, onChange])
  return <Text>probe</Text>
}

describe("app.keyDown / app.keyUp — modifier state lifecycle", () => {
  test("keyDown('Super') flips useModifierKeys store super=true; keyUp drops it", async () => {
    const seen: Array<{ super: boolean }> = []
    const render = createRenderer({ cols: 40, rows: 4, kittyMode: true })
    const app = render(<ModifierProbe onChange={(v) => seen.push(v)} />)

    // Initial render observes super=false.
    await settle(20)
    expect(seen.at(-1)?.super).toBe(false)

    await app.keyDown("Super")
    await settle(20)
    expect(seen.at(-1)?.super).toBe(true)

    await app.keyUp("Super")
    await settle(50)
    expect(seen.at(-1)?.super).toBe(false)
  })

  test("popover opens when Cmd is held across hover + dwell + assertion", async () => {
    // Canonical replacement for the stdin.write byte-sequence pattern used
    // before keyDown/keyUp existed. The popover provider's dwell timer
    // (~650ms) reads useModifierKeys; the modifier must remain held the
    // entire window — keyDown without auto-release is what makes this work.
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

    const render = createRenderer({ cols: 80, rows: 10, kittyMode: true, autoRender: true })
    const app = render(
      <PopoverProvider>
        <HoverTarget />
      </PopoverProvider>,
    )

    await app.keyDown("Super")
    await app.hover(1, 0)
    await settle(650)
    expect(app.text).toContain("POPOVER-BODY")

    // Popover stays open as long as Cmd is held + cursor is on target.
    await settle(350)
    expect(app.text).toContain("POPOVER-BODY")

    await app.keyUp("Super")
  })
})
