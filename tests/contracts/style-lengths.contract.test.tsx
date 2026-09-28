/**
 * @failure Dimension math strings are accepted by Box types but silently ignored.
 * @level l2
 * @consumer Box layout through the public React renderer.
 * @testonly none
 *
 * #15111: math dimensions must lay out like their numeric equivalent.
 * Existing engine math tests assign Value directly and miss this string seam.
 */
import React from "react"
import { expect, test } from "vitest"
import { Box, Text } from "@silvery/ag-react"
import { createRenderer } from "@silvery/test"

test("Box math width reaches layout like its numeric equivalent", () => {
  const render = createRenderer({ cols: 40, rows: 2 })
  const app = render(
    <Box width={40} height={2} flexDirection="column" alignItems="flex-start">
      <Box id="math" width="max(10ch, 50%)" height={1} flexShrink={0}>
        <Text>M</Text>
      </Box>
      <Box id="numeric" width={20} height={1} flexShrink={0}>
        <Text>P</Text>
      </Box>
    </Box>,
  )
  expect(app.locator("#numeric").boundingBox()!.width).toBe(20)
  expect(app.locator("#math").boundingBox()!.width).toBe(20)
})
