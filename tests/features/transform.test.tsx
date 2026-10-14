/**
 * Transform component tests
 */
import { describe, test, expect } from "vitest"
import { createRenderer, compareBuffers } from "@silvery/test"
import { Box, Text } from "silvery"
import { Transform } from "../../packages/ink/src/ink"

const render = createRenderer({ cols: 80, rows: 10 })

describe("Transform", () => {
  // @failure Active transformed text leaves old overflow after content/layout changes.
  // @level l3
  // @consumer Transform consumers updating retained terminal frames.
  // Mount-only tests miss old transformed ink outside the owning Text rect.
  // Nested removal retains the transformed ancestor; removing the whole
  // transformed subtree cannot detect a missed ancestor witness at detach.
  test.each(["text shrink", "ancestor resize", "subtree removal", "nested child removal"])(
    "clears retained transformed overflow on %s",
    (operation) => {
      const prefix = (line: string, index: number) =>
        `${operation === "nested child removal" ? 0 : index}→${line}`
      const frame = (next: boolean) => (
        <Box width={40} height={60} flexDirection="column">
          <Text height={1} flexShrink={0}>
            ANCHOR
          </Text>
          {Array.from({ length: 24 }, (_, i) => (
            <Box key={i} height={2} flexShrink={0}>
              <Box
                width={next && operation === "ancestor resize" ? 2 : 1}
                height={next && operation === "ancestor resize" ? 1 : 3}
                flexShrink={0}
              >
                {next && operation === "subtree removal" ? null : (
                  <Text
                    wrap="hard"
                    width={operation === "nested child removal" ? 1 : undefined}
                    height={operation === "nested child removal" ? 3 : undefined}
                    color="#ffffff"
                    internal_transform={prefix}
                  >
                    {operation === "nested child removal" ? (
                      <>
                        <Text key="first">Hello </Text>
                        {next ? null : <Text key="second">world</Text>}
                      </>
                    ) : next && operation === "text shrink" ? (
                      "a"
                    ) : (
                      "Hello world"
                    )}
                  </Text>
                )}
              </Box>
              <Text width={20} wrap="truncate">
                <Text bold={i % 2 === 0}>{` row ${i}`}</Text>
              </Text>
            </Box>
          ))}
        </Box>
      )
      const app = createRenderer({ cols: 40, rows: 60 })(frame(false))
      let oracle: ReturnType<ReturnType<typeof createRenderer>> | undefined
      try {
        expect(app.text).toContain("ANCHOR")
        app.rerender(frame(true)) // STRICT compares all cells with a fresh pass.
        expect(app.text).toContain("ANCHOR")
        oracle = createRenderer({ cols: 40, rows: 60 })(frame(true))
        expect(compareBuffers(app.lastBuffer()!, oracle.lastBuffer()!)).toBeNull()
      } finally {
        app.unmount()
        oracle?.unmount()
      }
    },
  )
  test("transforms single text child", () => {
    const app = render(
      <Transform transform={(output) => `[${output}]`}>
        <Text>hello</Text>
      </Transform>,
    )
    expect(app.text).toBe("[hello]")
  })

  test("transforms concatenated children text", () => {
    const app = render(
      <Transform transform={(output) => `[${output}]`}>
        <Text>hello </Text>
        <Text>world</Text>
      </Transform>,
    )
    expect(app.text).toBe("[hello world]")
  })

  test("transforms each line separately", () => {
    const app = render(
      <Transform transform={(line, index) => `${index}: ${line}`}>
        <Text>{"first\nsecond"}</Text>
      </Transform>,
    )
    expect(app.text).toBe("0: first\n1: second")
  })

  test("transforms uppercase", () => {
    const app = render(
      <Transform transform={(output) => output.toUpperCase()}>
        <Text>hello </Text>
        <Text>world</Text>
      </Transform>,
    )
    expect(app.text).toBe("HELLO WORLD")
  })

  // @failure Removing a line transform leaves its old overflow pixels behind.
  // @level l3
  // @consumer Transform consumers updating constrained text in a retained frame.
  // Existing transform cases mount once; this needs a retained buffer and 50+
  // nodes so overlapping row paint exercises the real cleanup ordering.
  test.each([
    { text: "Hello world", wrap: "hard" as const, before: 1, after: 2, staleX: 2, staleY: 49 },
    {
      text: "alpha/beta.gamma_delta:path",
      wrap: undefined,
      before: 6,
      after: 12,
      staleX: 6,
      staleY: 50,
    },
  ])(
    "removes transformed overflow when $wrap text widens",
    ({ text, wrap, before, after, staleX, staleY }) => {
      const prefix = (line: string, index: number) => `${index}→${line}`
      const frame = (transformed: boolean) => (
        <Box width={40} height={60} flexDirection="column">
          <Text height={1} flexShrink={0}>
            ANCHOR
          </Text>
          {Array.from({ length: 24 }, (_, index) => (
            <Box key={index} height={2} flexShrink={0}>
              <Box width={transformed ? before : after} height={transformed ? 3 : 1} flexShrink={0}>
                <Text
                  wrap={wrap}
                  color="#ffffff"
                  internal_transform={transformed ? prefix : undefined}
                >
                  {text}
                </Text>
              </Box>
              <Text wrap="truncate" width={20}>
                <Text bold={index % 2 === 0}>{` row ${index}`}</Text>
              </Text>
            </Box>
          ))}
        </Box>
      )
      const app = createRenderer({ cols: 40, rows: 60 })(frame(true))
      try {
        app.rerender(frame(false))
        const cell = app.cell(staleX, staleY)
        expect(cell.char).toBe(" ")
        expect(cell.fg).toBeNull()
      } finally {
        app.unmount()
      }
    },
  )
})
