/**
 * Static component write-once semantics tests
 */
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"
import { Static } from "../../packages/ink/src/ink"

const render = createRenderer({ cols: 80, rows: 10 })

describe("Static", () => {
  test("renders items above dynamic content", () => {
    const app = render(
      <Box flexDirection="column">
        <Static items={["A", "B", "C"]}>{(item) => <Text key={item}>{item}</Text>}</Static>
        <Text>X</Text>
      </Box>,
    )
    expect(app.text).toBe("A\nB\nC\nX")
  })

  test("renders items in order", () => {
    const app = render(
      <Static items={["first", "second", "third"]}>
        {(item) => <Text key={item}>{item}</Text>}
      </Static>,
    )
    expect(app.text).toBe("first\nsecond\nthird")
  })

  test("only renders new items when items array grows", () => {
    // Track render calls
    const rendered: string[] = []
    function TrackingItem({ item }: { item: string }) {
      rendered.push(item)
      return <Text>{item}</Text>
    }

    const app = render(
      <Box flexDirection="column">
        <Static items={["A", "B"]}>{(item) => <TrackingItem key={item} item={item} />}</Static>
        <Text>dynamic</Text>
      </Box>,
    )
    expect(app.text).toBe("A\nB\ndynamic")

    // Clear tracking
    rendered.length = 0

    // Add a new item - only "C" should be rendered, not A and B
    app.rerender(
      <Box flexDirection="column">
        <Static items={["A", "B", "C"]}>{(item) => <TrackingItem key={item} item={item} />}</Static>
        <Text>dynamic</Text>
      </Box>,
    )
    expect(app.text).toBe("A\nB\nC\ndynamic")
    // Only the new item should have been rendered
    expect(rendered).toEqual(["C"])
  })
})
