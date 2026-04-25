/**
 * Badge + Toast tone surface (Sterling Phase 2b).
 *
 * Covers the expanded `tone` surface for status-bearing components:
 *   - accent / error / warning / success / info
 *   - destructive (intent alias for error — D1)
 *   - primary / variant (legacy synonyms accepted during 2b/2c)
 *
 * Each tone must resolve to the matching Sterling flat token on the Text
 * node's `color` prop. No visual render assertion — the prop itself is
 * the public contract and the pipeline test passes stress it further.
 *
 * Refs: hub/silvery/design/v10-terminal/design-system.md §"Intent vs role"
 *       hub/silvery/design/v10-terminal/sterling-preflight.md (D1)
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import type { StyleProps } from "@silvery/ag/types"
import { Badge } from "../../packages/ag-react/src/ui/components/Badge"
import { ToastItem } from "../../packages/ag-react/src/ui/components/Toast"

const render = createRenderer({ cols: 80, rows: 24 })

function colorOf(text: string, app: ReturnType<typeof render>): string | undefined {
  const node = app.getByText(text).resolve()
  return (node?.props as StyleProps | undefined)?.color as string | undefined
}

describe("Badge tone surface", () => {
  const cases: Array<[string, string]> = [
    ["default", "$fg"],
    ["accent", "$fg-accent"],
    ["error", "$fg-error"],
    ["warning", "$fg-warning"],
    ["success", "$fg-success"],
    ["info", "$fg-info"],
    ["destructive", "$fg-error"],
    ["primary", "$fg-accent"], // legacy synonym for accent
  ]

  for (const [tone, expected] of cases) {
    test(`tone="${tone}" → ${expected}`, () => {
      const label = `T-${tone}`
      const app = render(<Badge label={label} tone={tone as never} />)
      expect(colorOf(label, app)).toBe(expected)
    })
  }

  test("deprecated tone prop still works (one-cycle alias)", () => {
    const app = render(<Badge label="legacy" tone="success" />)
    expect(colorOf("legacy", app)).toBe("$fg-success")
  })

  test("variant wins over deprecated tone when both are set (Option B)", () => {
    const app = render(<Badge label="both" variant="error" tone="success" />)
    expect(colorOf("both", app)).toBe("$fg-error")
  })

  test("explicit color prop overrides variant mapping", () => {
    const app = render(<Badge label="override" variant="error" color="#ff00ff" />)
    expect(colorOf("override", app)).toBe("#ff00ff")
  })
})

describe("Toast tone surface", () => {
  const cases: Array<[string, string, string]> = [
    // [variant, expected Sterling token, icon glyph]
    ["default", "$fg", "i"],
    ["accent", "$fg-accent", "*"],
    ["success", "$fg-success", "+"],
    ["error", "$fg-error", "x"],
    ["warning", "$fg-warning", "!"],
    ["info", "$fg-info", "i"],
    ["destructive", "$fg-error", "x"],
  ]

  for (const [variant, expected, icon] of cases) {
    test(`variant="${variant}" icon → ${expected}`, () => {
      const app = render(
        <ToastItem
          toast={{
            id: `t-${variant}`,
            title: `title-${variant}`,
            variant: variant as never,
            duration: 0,
          }}
        />,
      )
      // Toast renders the icon as `[<glyph>]`. Locate that node and check its
      // color prop — the icon is the only Text that carries the tone color.
      const node = app.getByText(`[${icon}]`).resolve()
      expect(node, `could not find icon [${icon}] for variant ${variant}`).not.toBeNull()
      expect((node!.props as StyleProps).color).toBe(expected)
    })
  }
})
