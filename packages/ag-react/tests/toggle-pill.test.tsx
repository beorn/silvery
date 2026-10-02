/**
 * TogglePill / TogglePillGroup — a clickable dim-idle / hover-bright toggle pill
 * matching ag code's bottom-bar mode toggles (focus / fast): very dim when idle,
 * the group lifts together on hover, the pill under the pointer is brightest and
 * carries a hover background, and clicking toggles. A pill always renders its
 * label, so the row never reflows on hover.
 *
 * Realistic fixture (per the silvery new-prop test rule): the yrd queue-watch
 * FILTER row `FILTER  [p]ending [r]unning [f]ailed [d]one`. Runs through the
 * render pipeline at SILVERY_STRICT=2 in CI.
 */
import React, { useState } from "react"
import { describe, expect, test, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { TogglePill, TogglePillGroup, togglePillColor } from "../src/ui/components/TogglePill"
import * as agReact from "../src/index"

describe("TogglePill public barrel", () => {
  // Regression guard: adding a component to ui/components.ts is not enough — the
  // curated exports.ts surface (what `import … from "silvery"` resolves) must
  // re-export it too, or consumers get an undefined element at render.
  test("TogglePill / TogglePillGroup / togglePillColor are reachable from the @silvery/ag-react barrel", () => {
    expect(typeof agReact.TogglePill, "TogglePill on the public barrel").toBe("function")
    expect(typeof agReact.TogglePillGroup, "TogglePillGroup on the public barrel").toBe("function")
    expect(typeof agReact.togglePillColor, "togglePillColor on the public barrel").toBe("function")
  })
})

describe("togglePillColor ladder", () => {
  const color = (o: { active: boolean; groupHovered: boolean; itemHovered: boolean }) =>
    togglePillColor({ ...o, activeColor: "$fg", activeHoverColor: "$fg-accent" })

  test("idle is very dim; group-hover lifts active; item-hover is brightest", () => {
    // Idle (group not hovered): inactive at the extra-muted border tone, active
    // dim-but-readable. "On" always reads brighter than "off".
    expect(color({ active: false, groupHovered: false, itemHovered: false })).toBe(
      "$border-default",
    )
    expect(color({ active: true, groupHovered: false, itemHovered: false })).toBe("$fg-muted")
    // Group hovered: active lifts to activeColor; inactive stays dim.
    expect(color({ active: true, groupHovered: true, itemHovered: false })).toBe("$fg")
    expect(color({ active: false, groupHovered: true, itemHovered: false })).toBe("$border-default")
    // Item hovered inside a hovered group: active reaches activeHoverColor,
    // inactive only brightens to the readable-muted tone.
    expect(color({ active: true, groupHovered: true, itemHovered: true })).toBe("$fg-accent")
    expect(color({ active: false, groupHovered: true, itemHovered: true })).toBe("$fg-muted")
  })

  // 27064 row 8 (@cto 25e0c7c7): an active pill whose state must stay visible at rest (hab's `fast`, which costs
  // more) names its own idle colour; without it the idle active tone is unchanged, and the inactive ladder never moves.
  test("idleActiveColor colours an idle active pill; omitted, the idle active tone stays $fg-muted", () => {
    const lit = (o: { active: boolean; groupHovered: boolean; itemHovered: boolean }) =>
      togglePillColor({
        ...o,
        activeColor: "$fg-warning",
        activeHoverColor: "$fg-warning",
        idleActiveColor: "$fg-warning",
      })
    expect(lit({ active: true, groupHovered: false, itemHovered: false })).toBe("$fg-warning")
    expect(lit({ active: true, groupHovered: true, itemHovered: false })).toBe("$fg-warning")
    expect(lit({ active: false, groupHovered: false, itemHovered: false })).toBe("$border-default")
    expect(lit({ active: false, groupHovered: true, itemHovered: true })).toBe("$fg-muted")
    expect(color({ active: true, groupHovered: false, itemHovered: false })).toBe("$fg-muted")
  })
})

function FilterRow({ onDone }: { onDone?: () => void } = {}) {
  const [buckets, setBuckets] = useState({
    pending: true,
    running: true,
    failed: true,
    done: false,
  })
  const toggle = (key: keyof typeof buckets) =>
    setBuckets((prev) => ({ ...prev, [key]: !prev[key] }))
  return (
    <TogglePillGroup label="FILTER">
      <TogglePill label="[p]ending" active={buckets.pending} onToggle={() => toggle("pending")} />
      <TogglePill label="[r]unning" active={buckets.running} onToggle={() => toggle("running")} />
      <TogglePill label="[f]ailed" active={buckets.failed} onToggle={() => toggle("failed")} />
      <TogglePill
        label="[d]one"
        active={buckets.done}
        onToggle={() => {
          toggle("done")
          onDone?.()
        }}
      />
    </TogglePillGroup>
  )
}

describe("TogglePill in the FILTER row", () => {
  const locate = (app: { lines: readonly string[] }, needle: string) => {
    const row = app.lines.findIndex((line) => line.includes(needle))
    return { row, col: app.lines[row]?.indexOf(needle) ?? -1 }
  }

  test("renders every pill on one row and never reflows on hover", async () => {
    const render = createRenderer({ cols: 60, rows: 6 })
    const app = render(<FilterRow />)
    for (const label of ["FILTER", "[p]ending", "[r]unning", "[f]ailed", "[d]one"]) {
      expect(app.text).toContain(label)
    }
    const { row, col } = locate(app, "[p]ending")
    expect(row).toBeGreaterThanOrEqual(0)
    const layoutBefore = app.text
    await app.hover(col, row)
    expect(app.text, "hover recolours but never reflows the row").toBe(layoutBefore)
  })

  test("idle is dim, hovering the pill brightens it and shows a hover background", async () => {
    const render = createRenderer({ cols: 60, rows: 6 })
    const app = render(<FilterRow />)
    const { row, col } = locate(app, "[p]ending")
    const idleFg = app.cell(col, row).fg
    expect(app.cell(col, row).bg, "no background when idle").toBeNull()

    await app.hover(col, row)
    expect(app.cell(col, row).bg, "the hovered pill carries $bg-surface-hover").not.toBeNull()
    expect(
      app.cell(col, row).fg,
      "the hovered active pill brightens out of its dim idle tone",
    ).not.toEqual(idleFg)
  })

  test("clicking a pill fires onToggle and flips its rendered state", async () => {
    const onDone = vi.fn()
    const render = createRenderer({ cols: 60, rows: 6 })
    const app = render(<FilterRow onDone={onDone} />)
    const { row, col } = locate(app, "[d]one")
    // [d]one starts inactive; hover it first so we compare like-for-like
    // (same item-hover state) before and after the toggle.
    await app.hover(col, row)
    const inactiveHoveredFg = app.cell(col, row).fg

    await app.click(col, row)
    expect(onDone, "click invokes onToggle").toHaveBeenCalledTimes(1)
    expect(app.text, "the label is unchanged — only its state").toContain("[d]one")
    expect(
      app.cell(col, row).fg,
      "a now-active pill reads brighter than the inactive one at the same hover state",
    ).not.toEqual(inactiveHoveredFg)
  })
})

describe("TogglePill boldFirstLetter", () => {
  function BoldRow() {
    return (
      <TogglePillGroup>
        <TogglePill label="pending" boldFirstLetter active onToggle={() => {}} />
        <TogglePill label="running" boldFirstLetter={false} active onToggle={() => {}} />
      </TogglePillGroup>
    )
  }

  test("bolds only the first character of the label and never reflows on hover", async () => {
    const render = createRenderer({ cols: 60, rows: 6 })
    const app = render(<BoldRow />)
    // The plain word renders with no brackets.
    expect(app.text).toContain("pending")

    const row = app.lines.findIndex((line) => line.includes("pending"))
    const col = app.lines[row]!.indexOf("pending")
    // First character bold, the rest not — the hotkey hint reads inside the word.
    expect(app.cell(col, row).bold, "first character is bold").toBe(true)
    expect(app.cell(col + 1, row).bold, "the second character is not bold").toBe(false)

    // The sibling pill without boldFirstLetter stays fully non-bold.
    const plainRow = app.lines.findIndex((line) => line.includes("running"))
    const plainCol = app.lines[plainRow]!.indexOf("running")
    expect(
      app.cell(plainCol, plainRow).bold,
      "boldFirstLetter=false leaves the first char plain",
    ).toBe(false)

    // Bold weight never changes the cell count, so hover recolours but never reflows.
    const before = app.text
    await app.hover(col, row)
    expect(app.text, "hover does not reflow the bolded pill").toBe(before)
  })
})
