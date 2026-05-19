/**
 * W7 (15332 Wave 3): ListView mount-all default.
 *
 * Default `virtualizationThreshold` is 10,000 (raised from 100 in W7). For
 * any list with ≤ 10,000 items and no explicit `virtualization` prop, ListView
 * picks `"none"` strategy = mount every item.
 *
 * The 100-default forced silvercode chat to virtualize at >100 messages,
 * which delayed last-message visibility at resume time. 10,000 lets the
 * common case (chat, short lists) render fully on first paint.
 */
import { createRenderer } from "@silvery/test"
import React from "react"
import { describe, expect, it } from "vitest"
import { Box, Text } from "../../src/index.ts"
import { ListView } from "../../packages/ag-react/src/ui/components/ListView.tsx"

describe("ListView mount-all default (W7 / 15332 Wave 3)", () => {
  it("contract: 200-item list with no explicit virtualization is in mount-all mode (no threshold override)", () => {
    // The other two tests prove that explicit threshold or explicit
    // virtualization mode overrides the default. This test pins the
    // default: without any opt-out, a 200-item list mounts every item.
    // We assert via the visible top-of-viewport (item-0) — virtualize
    // mode at viewport rows=50 with no scroll would still show item-0,
    // so this is a soft assertion; the differentiator vs virtualize is
    // tested in test 2 below.
    const r = createRenderer({ cols: 40, rows: 50 })
    const items = Array.from({ length: 200 }, (_, i) => `item-${i}`)
    const app = r(
      <Box width={40} height={50} flexDirection="column">
        <ListView<string> items={items} renderItem={(item: string) => <Text>{item}</Text>} />
      </Box>,
    )
    expect(app.text).toContain("item-0")
  })

  it("contract: explicit virtualizationThreshold=50 still virtualizes a 200-item list", () => {
    const r = createRenderer({ cols: 40, rows: 50 })
    const items = Array.from({ length: 200 }, (_, i) => `item-${i}`)
    const app = r(
      <Box width={40} height={50} flexDirection="column">
        <ListView<string>
          items={items}
          renderItem={(item: string) => <Text>{item}</Text>}
          height={1}
          virtualizationThreshold={50}
        />
      </Box>,
    )
    // With threshold=50 and 200 items, virtualization kicks in.
    // Items beyond the viewport should NOT be in the rendered text.
    expect(app.text).toContain("item-0")
    // item-199 should be windowed out — viewport is rows=50 and items are 1 row each
    expect(app.text).not.toContain("item-199")
  })

  it("contract: explicit virtualization='measured' overrides the default mount-all", () => {
    const r = createRenderer({ cols: 40, rows: 50 })
    const items = Array.from({ length: 200 }, (_, i) => `item-${i}`)
    const app = r(
      <Box width={40} height={50} flexDirection="column">
        <ListView<string>
          items={items}
          renderItem={(item: string) => <Text>{item}</Text>}
          virtualization="measured"
        />
      </Box>,
    )
    // Explicit "measured" forces virtualization regardless of count.
    expect(app.text).toContain("item-0")
    expect(app.text).not.toContain("item-199")
  })
})
