import { describe, test, expect, vi, beforeEach } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"
import { _resetBoxInsideTextWarning } from "@silvery/ag-react/reconciler/host-config"

const render = createRenderer({ cols: 40, rows: 10 })

describe("Box inside Text warning", () => {
  beforeEach(() => {
    _resetBoxInsideTextWarning()
  })

  test("Box inside Text produces console.warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    render(
      <Text>
        hello
        <Box>world</Box>
      </Text>,
    )

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("<Box> cannot be nested inside <Text>. This produces undefined layout behavior."),
    )

    warnSpy.mockRestore()
  })

  test("normal Box/Text nesting does NOT warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    render(
      <Box>
        <Text>hello</Text>
        <Box>
          <Text>world</Text>
        </Box>
      </Box>,
    )

    expect(warnSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  test("warning only fires once", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    render(
      <Text>
        <Box>first</Box>
      </Text>,
    )

    render(
      <Text>
        <Box>second</Box>
      </Text>,
    )

    expect(warnSpy).toHaveBeenCalledTimes(1)

    warnSpy.mockRestore()
  })
})
