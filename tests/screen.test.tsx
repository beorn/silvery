/**
 * Screen Component Tests
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { Text } from "../src/components/Text.js"
import { Box } from "../src/components/Box.js"
import { Screen } from "../src/components/Screen.js"
import { createRenderer } from "inkx/testing"

const render = createRenderer({ cols: 80, rows: 24 })

describe("Screen", () => {
  test("renders children", () => {
    const app = render(
      <Screen>
        <Text>Hello World</Text>
      </Screen>,
    )
    expect(app.text).toContain("Hello World")
  })

  test("uses column flex direction by default", () => {
    const app = render(
      <Screen>
        <Text>Top</Text>
        <Text>Bottom</Text>
      </Screen>,
    )
    expect(app.text).toContain("Top")
    expect(app.text).toContain("Bottom")
  })

  test("accepts custom flex direction", () => {
    const app = render(
      <Screen flexDirection="row">
        <Box width={10}>
          <Text>Left</Text>
        </Box>
        <Box width={10}>
          <Text>Right</Text>
        </Box>
      </Screen>,
    )
    expect(app.text).toContain("Left")
    expect(app.text).toContain("Right")
  })

  test("can nest VirtualScrollView-like content", () => {
    const app = render(
      <Screen>
        <Box height={1}>
          <Text>Header</Text>
        </Box>
        <Box flexGrow={1}>
          <Text>Content Area</Text>
        </Box>
        <Box height={1}>
          <Text>Footer</Text>
        </Box>
      </Screen>,
    )
    expect(app.text).toContain("Header")
    expect(app.text).toContain("Content Area")
    expect(app.text).toContain("Footer")
  })
})
