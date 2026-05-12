/**
 * Defaults contract — `ChainableApp` fluent action surface.
 *
 * See tests/contracts/README.md for the convention.
 *
 * Each action method on `App` (press, keyDown, keyUp, pressSequence,
 * type, click, doubleClick, hover, wheel) returns a `ChainableApp` — a
 * `PromiseLike<App>` that exposes the same action methods. The
 * contracts pinned here:
 *
 *   - Chained method calls run in order. `keyDown('Super').keyUp('Super')`
 *     flips super=true then back to false in one expression.
 *   - The chain `.then`s into `App`, so `await app.action(...)` still
 *     resolves to `App` (existing call sites keep working).
 *   - Mid-chain `await` composes — calling additional actions on the
 *     resolved App produces equivalent behavior to a continued chain.
 *   - The Cmd-hover popover recipe (silvercode tool-call image preview
 *     class) collapses to a single chained expression: the popover dwell
 *     timer reads useModifierKeys with Cmd held across the chain.
 *
 * Bead: @km/silvery/test-api-plateau/move-chain-tests-to-contracts
 * (originally landed in tests/features/chainable-actions.test.tsx
 * alongside @km/silvery/fluent-chain-actions; moved here per the
 * defaults-contract convention since the chain is a public surface
 * change, not just a feature behavior).
 *
 * Phase 2 backlog: error propagation through the chain (one method
 * rejects → subsequent chained method skipped vs invoked); type-only
 * assertions that ChainableApp[method] returns ChainableApp; coverage
 * of every action method in a single chain (currently keyDown/keyUp/
 * hover/press are exercised; type/click/doubleClick/wheel/pressSequence
 * not yet covered as chain steps).
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

describe("contract: ChainableApp action methods", () => {
  test("contract: keyDown(...).keyUp(...) chains in order", async () => {
    const seen: Array<{ super: boolean }> = []
    const render = createRenderer({ cols: 40, rows: 4, kittyMode: true })
    const app = render(<ModifierProbe onChange={(v) => seen.push(v)} />)
    await settle(20)

    await app.keyDown("Super").keyUp("Super")
    await settle(20)

    const supers = seen.map((s) => s.super)
    expect(supers).toContain(true)
    expect(supers.at(-1)).toBe(false)
  })

  test("contract: Cmd-hover popover recipe collapses to a single chain", async () => {
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

    await app.keyDown("Super").hover(1, 0)
    await settle(650)
    expect(app.text).toContain("POPOVER-BODY")
    await app.keyUp("Super")
  })

  test("contract: chain `.then` resolves to App", async () => {
    const render = createRenderer({ cols: 40, rows: 4, kittyMode: true })
    const app = render(<Text>x</Text>)

    const resolved = await app.press("a")
    expect(typeof resolved.locator).toBe("function")
    expect(typeof resolved.text).toBe("string")
  })

  test("contract: chain composes with mid-sequence await", async () => {
    const render = createRenderer({ cols: 40, rows: 4, kittyMode: true })
    const app = render(<Text>x</Text>)

    const after = await app.press("a").press("b")
    await after.press("c")
    expect(typeof after.locator).toBe("function")
  })
})
