/**
 * Contract: flexGrow inside an auto main-axis container must not undermeasure
 * wrapped descendants.
 *
 * The owning invariant lives in flexily. This silvery contract keeps the
 * integration honest: real <Box>/<Text wrap="wrap"> primitives must reserve
 * the same height they paint, so following siblings cannot overlap wrapped
 * continuations.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

function Bullet({ children }: { children: string }): React.ReactElement {
  return (
    <Box flexDirection="row" gap={1} flexShrink={0}>
      <Text flexShrink={0}>·</Text>
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
        <Text wrap="wrap">{children}</Text>
      </Box>
    </Box>
  )
}

describe("contract: flexGrow in auto main axis with wrapped text", () => {
  test("following sibling starts after all wrapped descendant rows", () => {
    const render = createRenderer({ cols: 90, rows: 24 })
    const app = render(
      <Box flexDirection="column" width={88}>
        <Box flexDirection="row" width={88}>
          <Box width={1} flexShrink={0}>
            <Text>•</Text>
          </Box>
          <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
            <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} id="prose">
              <Box flexDirection="column" flexShrink={0} minWidth={0}>
                <Text wrap="wrap">Implemented both fixes.</Text>
                <Box height={1} flexShrink={0} />
                <Text wrap="wrap">Verification:</Text>
                <Box height={1} flexShrink={0} />
                <Bullet>
                  bun vitest run apps/silvercode/tests/visual/boundary-fakes.test.tsx passed.
                </Bullet>
                <Bullet>Targeted command padding test passed.</Bullet>
                <Bullet>
                  npx tsc --noEmit --incremental false --pretty false still fails on existing unrelated
                  repo-wide TypeScript errors, mostly in agent-harness/vendor silvery plus StatusGlyph.tsx error.
                </Bullet>
              </Box>
            </Box>
          </Box>
        </Box>
        <Text id="next">NEXT</Text>
      </Box>,
    )

    const prose = app.locator("#prose").boundingBox()
    const next = app.locator("#next").boundingBox()
    expect(prose).not.toBeNull()
    expect(next).not.toBeNull()
    expect(prose!.height).toBeGreaterThanOrEqual(8)
    expect(next!.y).toBeGreaterThanOrEqual(prose!.y + prose!.height)
    expect(app.lines.find((line) => line.includes("StatusGlyph") && line.includes("NEXT"))).toBeUndefined()
  })
})
