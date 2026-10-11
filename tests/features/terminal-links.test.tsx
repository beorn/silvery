import { deriveLinkTarget } from "@silvery/ansi"
import { TerminalBuffer } from "@silvery/ag-term/buffer"
import { resolveTerminalLinkAt } from "@silvery/ag-term/terminal-links"
/**
 * withTerminalLinks — visible-cell link production through the shared
 * `link:open` event rail.
 *
 * The runtime owns gesture arbitration. Link production therefore runs only
 * after selection and component dispatch: drag wins, and preventDefault()
 * suppresses the terminal-cell fallback.
 */

import React, { useContext, useEffect, type ReactNode } from "react"
import { describe, expect, test, vi } from "vitest"
import { createTermless } from "@silvery/test"
import { ChainAppContext, Text } from "@silvery/ag-react"
import { withTerminalLinks } from "@silvery/create"
import { run } from "../../packages/ag-term/src/runtime/run"

const settle = (ms = 80) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function CaptureLinkOpens({
  children,
  onOpen,
}: {
  children: ReactNode
  onOpen: (href: string) => void
}): React.ReactElement {
  const chain = useContext(ChainAppContext)
  useEffect(() => chain?.events.on("link:open", (href) => onOpen(String(href))), [chain, onOpen])
  return <>{children}</>
}

async function holdCommand(term: ReturnType<typeof createTermless>): Promise<void> {
  // Kitty left-super press through the production input pipeline. Termless's
  // raw-input method is intentionally the runtime test seam (see key-release).
  ;(term as unknown as { sendInput(input: string): void }).sendInput("\x1b[57444;9:1u")
  await settle()
}

describe("withTerminalLinks", () => {
  test("composes by injecting one terminalLinks option into run", () => {
    const detect = vi.fn(() => [])
    const runApp = vi.fn()
    const app = withTerminalLinks({ detect })({ run: runApp })

    app.run("element", { mouse: true })

    expect(runApp).toHaveBeenCalledWith("element", {
      mouse: true,
      terminalLinks: { detect },
    })
  })

  test("opens an explicit visible-cell URI only on an unconsumed Cmd-click", async () => {
    using term = createTermless({ cols: 40, rows: 5 })
    const onOpen = vi.fn()
    const handle = await run(
      <CaptureLinkOpens onOpen={onOpen}>
        <Text internal_hyperlink="https://explicit.example/">explicit</Text>
      </CaptureLinkOpens>,
      term,
      { mouse: true, kitty: true, terminalLinks: {} },
    )
    await settle()

    await term.mouse.click(2, 0)
    await settle()
    expect(onOpen).not.toHaveBeenCalled()

    await holdCommand(term)
    term.out.clear()
    await term.mouse.move(2, 0)
    await settle()
    expect(term.out.containsOutput("\x1b]22;pointer\x07")).toBe(true)

    await term.mouse.click(2, 0)
    await settle()
    expect(onOpen).toHaveBeenCalledOnce()
    expect(onOpen).toHaveBeenCalledWith("https://explicit.example/")

    handle.unmount()
  })

  test("detects only the pointed visible row and explicit cell URIs win", async () => {
    using term = createTermless({ cols: 50, rows: 5 })
    const onOpen = vi.fn()
    const detect = vi.fn((text: string) => {
      const start = text.indexOf("ticket-42")
      return start < 0
        ? []
        : [{ start, end: start + "ticket-42".length, href: "km://bead/detected" }]
    })
    const handle = await run(
      <CaptureLinkOpens onOpen={onOpen}>
        <Text>other row</Text>
        <Text internal_hyperlink={deriveLinkTarget("km://bead/explicit")}>ticket-42</Text>
      </CaptureLinkOpens>,
      term,
      { mouse: true, kitty: true, terminalLinks: { detect } },
    )
    await settle()
    await holdCommand(term)

    await term.mouse.click(2, 1)
    await settle()

    expect(onOpen).toHaveBeenCalledWith("km://bead/explicit")
    expect(detect).not.toHaveBeenCalled()

    handle.unmount()
  })

  test("projects an injected detection without scanning unrelated rows", async () => {
    using term = createTermless({ cols: 50, rows: 5 })
    const onOpen = vi.fn()
    const detect = vi.fn((text: string) => {
      const start = text.indexOf("ticket-42")
      return start < 0
        ? []
        : [{ start, end: start + "ticket-42".length, href: "km://bead/detected" }]
    })
    const handle = await run(
      <CaptureLinkOpens onOpen={onOpen}>
        <Text>unrelated row</Text>
        <Text>ticket-42</Text>
      </CaptureLinkOpens>,
      term,
      { mouse: true, kitty: true, terminalLinks: { detect } },
    )
    await settle()
    await holdCommand(term)

    await term.mouse.click(2, 1)
    await settle()

    expect(onOpen).toHaveBeenCalledWith("km://bead/detected")
    expect(detect).toHaveBeenCalledOnce()
    expect(detect).toHaveBeenCalledWith(expect.stringContaining("ticket-42"))
    expect(detect).not.toHaveBeenCalledWith(expect.stringContaining("unrelated row"))

    handle.unmount()
  })

  test("component prevention and selection drag both win over link opening", async () => {
    using term = createTermless({ cols: 50, rows: 5 })
    const onOpen = vi.fn()
    const onClick = vi.fn((event: { preventDefault(): void }) => event.preventDefault())
    const handle = await run(
      <CaptureLinkOpens onOpen={onOpen}>
        <Text internal_hyperlink="https://consumed.example/" onClick={onClick}>
          consumed-link
        </Text>
      </CaptureLinkOpens>,
      term,
      { mouse: true, kitty: true, selection: true, terminalLinks: {} },
    )
    await settle()
    await holdCommand(term)

    await term.mouse.click(2, 0)
    await settle()
    expect(onClick).toHaveBeenCalledOnce()
    expect(onOpen).not.toHaveBeenCalled()

    onClick.mockClear()
    await term.mouse.drag({ from: [1, 0], to: [8, 0] })
    await settle()
    expect(onClick).not.toHaveBeenCalled()
    expect(onOpen).not.toHaveBeenCalled()

    handle.unmount()
  })
})

test("explicit cell activation authenticates derived targets and keeps URI payloads", () => {
  const b = new TerminalBuffer(4, 1)
  b.setCell(0, 0, { char: "a", hyperlink: "file:///tmp/example.ts" })
  b.setCell(1, 0, { char: "b", hyperlink: deriveLinkTarget("file:///tmp/example.ts") })
  b.setCell(2, 0, { char: "c", hyperlink: "https://example.com/" })
  expect(resolveTerminalLinkAt(b, 0, 0, {})).toBeUndefined()
  expect(resolveTerminalLinkAt(b, 1, 0, {})).toBe("file:///tmp/example.ts")
  expect(resolveTerminalLinkAt(b, 2, 0, {})).toBe("https://example.com/")
})
