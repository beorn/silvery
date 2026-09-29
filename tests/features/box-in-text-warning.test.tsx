import { describe, test, expect, vi, beforeEach } from "vitest"

// The warning latches once per module instance, so each test takes fresh modules through the public entries
// instead of a reset export (E-1, 25632).
let render: ReturnType<typeof import("@silvery/test").createRenderer>
let Box: typeof import("silvery").Box
let Text: typeof import("silvery").Text

describe("Box inside Text warning", () => {
  beforeEach(async () => {
    vi.resetModules()
    const { createRenderer } = await import("@silvery/test")
    ;({ Box, Text } = await import("silvery"))
    render = createRenderer({ cols: 40, rows: 10 })
  })

  test("Box inside Text produces console.warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    render(
      <Text>
        hello
        <Box>world</Box>
      </Text>,
    )

    // loggily emits `console.warn(prefix, message, ...args)` — assert the
    // message appears in any argument of the call (first or second).
    expect(warnSpy).toHaveBeenCalled()
    const matched = warnSpy.mock.calls.some((args) =>
      args.some(
        (a) =>
          typeof a === "string" &&
          a.includes(
            "<Box> cannot be nested inside <Text>. This produces undefined layout behavior.",
          ),
      ),
    )
    expect(matched).toBe(true)

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
