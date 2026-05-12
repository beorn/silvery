/**
 * `app.press(...).keyDown(...).hover(...)…` fluent chain contract.
 *
 * Each action method returns a `ChainableApp` — a `PromiseLike<App>`
 * that exposes the same action methods. Tests can compose without an
 * `await` between every step, while existing `await app.action(...)`
 * call sites keep returning `App` because the chain `.then`s into it.
 *
 * Bead: @km/silvery/fluent-chain-actions.
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

describe("ChainableApp fluent actions", () => {
  test("keyDown(...).keyUp(...) chains in order", async () => {
    const seen: Array<{ super: boolean }> = []
    const render = createRenderer({ cols: 40, rows: 4, kittyMode: true })
    const app = render(<ModifierProbe onChange={(v) => seen.push(v)} />)
    await settle(20)

    await app.keyDown("Super").keyUp("Super")
    await settle(20)

    // After the chain, super flipped true then back to false.
    const supers = seen.map((s) => s.super)
    expect(supers).toContain(true)
    expect(supers.at(-1)).toBe(false)
  })

  test("chained Cmd-hover popover recipe (keyDown.hover.keyUp)", async () => {
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

    // Single chained expression instead of the four-statement
    // keyDown / hover / settle / keyUp recipe. The popover dwell still
    // fires inside the chain — settle(650) drives the timer; the chain
    // only sequences synthetic events, not real time.
    await app.keyDown("Super").hover(1, 0)
    await settle(650)
    expect(app.text).toContain("POPOVER-BODY")
    await app.keyUp("Super")
  })

  test("chain `.then` resolves to App so existing await call sites keep working", async () => {
    const render = createRenderer({ cols: 40, rows: 4, kittyMode: true })
    const app = render(<Text>x</Text>)

    const resolved = await app.press("a")
    expect(typeof resolved.locator).toBe("function")
    expect(typeof resolved.text).toBe("string")
  })

  test("chain composes with await mid-sequence", async () => {
    const render = createRenderer({ cols: 40, rows: 4, kittyMode: true })
    const app = render(<Text>x</Text>)

    // Mix chained and awaited forms — both must produce the same App.
    const after = await app.press("a").press("b")
    await after.press("c")
    // No assertion needed; absence of throw + correct types is the contract.
    expect(typeof after.locator).toBe("function")
  })
})
