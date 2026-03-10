import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"
import { DEFAULT_BG, isDefaultBg } from "@silvery/term/buffer"
import { parseColor } from "@silvery/term/pipeline/render-helpers"

describe("$default background", () => {
  test("parseColor('$default') returns DEFAULT_BG sentinel", () => {
    const color = parseColor("$default")
    expect(isDefaultBg(color)).toBe(true)
    expect(color).toBe(DEFAULT_BG)
  })

  test("DEFAULT_BG is not equal to null", () => {
    expect(DEFAULT_BG).not.toBeNull()
    expect(isDefaultBg(null)).toBe(false)
  })

  test("isDefaultBg rejects normal colors", () => {
    expect(isDefaultBg({ r: 0, g: 0, b: 0 })).toBe(false)
    expect(isDefaultBg({ r: 255, g: 255, b: 255 })).toBe(false)
    expect(isDefaultBg(42)).toBe(false)
  })

  const render = createRenderer({ cols: 20, rows: 5 })

  test("Box with $default bg renders text content", () => {
    const app = render(
      <Box backgroundColor="$default" width={20} height={3}>
        <Text>Default BG</Text>
      </Box>,
    )
    expect(app.text).toContain("Default BG")
  })

  test("$default bg produces no 48;2; or 48;5; in ANSI output", () => {
    const app = render(
      <Box backgroundColor="$default" width={20} height={3}>
        <Text>Hello</Text>
      </Box>,
    )
    const ansi = app.ansi
    // $default bg means "use terminal default" — no explicit bg code should be emitted
    expect(ansi).not.toMatch(/48;2;/)
    expect(ansi).not.toMatch(/48;5;/)
  })

  test("$default bg cell has DEFAULT_BG, not null", () => {
    const app = render(
      <Box backgroundColor="$default" width={10} height={1}>
        <Text>X</Text>
      </Box>,
    )
    const buffer = app.lastBuffer()
    expect(buffer).toBeDefined()
    const cell = buffer!.getCell(0, 0)
    expect(isDefaultBg(cell.bg)).toBe(true)
  })

  test("$default bg makes overlay opaque", () => {
    const app = render(
      <Box flexDirection="column" width={20} height={5}>
        <Text>Background text here</Text>
        <Box backgroundColor="$default" position="absolute" width={10} height={1}>
          <Text>Over</Text>
        </Box>
      </Box>,
    )
    // The overlay covers the first 10 columns of row 0
    const buffer = app.lastBuffer()
    expect(buffer).toBeDefined()
    // Cell at (0,0) should have DEFAULT_BG (from overlay), not null (transparent)
    const cell = buffer!.getCell(0, 0)
    expect(isDefaultBg(cell.bg)).toBe(true)
  })
})
