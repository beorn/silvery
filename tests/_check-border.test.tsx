import { describe, test, expect } from "vitest"
import React from "react"
import { Box, Text, ansi16DarkTheme } from "@silvery/ag-react"
import { createRenderer } from "@silvery/test"
import { nord, silveryDark, githubDark } from "@silvery/theme"

function luma(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m?.[1]) return -1
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

describe("border-default color resolution", () => {
  for (const [name, theme] of [
    ["ansi16DarkTheme", ansi16DarkTheme],
    ["nord", nord],
    ["silveryDark", silveryDark],
    ["githubDark", githubDark],
  ] as const) {
    test(`${name} border-default`, () => {
      const renderer = createRenderer({ cols: 40, rows: 5 })
      const app = renderer(
        <Box theme={theme} borderStyle="round" borderColor="$border-default" width={20} height={3}>
          <Text>x</Text>
        </Box>,
      )
      const bc = app.cell(0, 0)
      const t = theme as unknown as Record<string, string>
      console.log(`${name}:`)
      console.log(`  cell(0,0) fg=${bc.fg} bg=${bc.bg}`)
      console.log(`  border-default=${t["border-default"]}`)
      console.log(`  border=${t["border"]}`)
      console.log(`  bg=${t["bg"]} fg=${t["fg"]}`)
      console.log(`  luma(border-default) = ${luma(t["border-default"] || "")}`)
      console.log(`  luma(bg) = ${luma(t["bg"] || "")}`)
      expect(true).toBe(true)
    })
  }
})
