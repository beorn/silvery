/**
 * `renderString` must end each pass at a layout COMMIT BOUNDARY, exactly as
 * the interactive runtimes do.
 *
 * Without it the committed rect signals never advance, so every
 * `useBoxRect` / `useOnBoxRectCommitted` consumer reads its zero seed forever
 * and a static render silently disagrees with the interactive one for the same
 * tree at the same width. `Content.Table` is the measured casualty: it reads a
 * committed container width to choose between its grid and its stacked form,
 * so it saw 0 at every width and stacked every table in every static render.
 *
 * The assertion is deliberately on the OBSERVER, not on a table: this is a
 * renderer contract, and pinning it to one component's fallback would leave
 * the next committed-rect consumer to rediscover the same hole.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Text, renderString, useOnBoxRectCommitted } from "../../packages/ag-react/src/index"

describe("renderString commit boundary", () => {
  test("a committed-rect observer sees the real width, not its zero seed", async () => {
    const widths: number[] = []

    function Observer(): React.ReactElement {
      const [width, setWidth] = React.useState(0)
      useOnBoxRectCommitted((rect) => {
        widths.push(rect.width)
        setWidth((previous) => (previous === rect.width ? previous : rect.width))
      })
      return <Text>width={width}</Text>
    }

    const output = await renderString(
      <Box width="100%">
        <Observer />
      </Box>,
      { width: 64, height: 6, plain: true },
    )

    // Fired at all — the callback form is what `Content.Table` uses.
    expect(widths).not.toEqual([])
    expect(widths.at(-1)).toBe(64)
    // ...and the resulting state reached the PAINTED frame, so a component
    // that re-renders on the committed width is not one frame stale forever.
    expect(output).toContain("width=64")
  })
})
