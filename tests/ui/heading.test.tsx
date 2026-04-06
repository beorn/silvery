/**
 * Heading Component Tests
 *
 * Verifies the Heading component with OSC 66 text sizing:
 * - Renders correct text content
 * - Each level maps to the correct textSize scale
 * - Default level is 1
 * - All levels render bold
 * - Color defaults per level
 * - Custom color override
 */

import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Heading } from "../../packages/ag-react/src/ui/components/Heading"
import type { HeadingLevel } from "../../packages/ag-react/src/ui/components/Heading"
import type { StyleProps } from "@silvery/ag/types"

const render = createRenderer({ cols: 80, rows: 10 })

// =============================================================================
// Scale mapping reference:
//   h1: 2.0, h2: 1.5, h3: 1.25, h4: 1.0, h5: 0.9, h6: 0.8
// =============================================================================

const EXPECTED_SCALES: Record<HeadingLevel, number> = {
  1: 2.0,
  2: 1.5,
  3: 1.25,
  4: 1.0,
  5: 0.9,
  6: 0.8,
}

const EXPECTED_COLORS: Record<HeadingLevel, string | undefined> = {
  1: "$primary",
  2: "$accent",
  3: "$primary",
  4: undefined,
  5: undefined,
  6: "$muted",
}

// =============================================================================
// Tests
// =============================================================================

describe("Heading", () => {
  test("renders with correct text content", () => {
    const app = render(<Heading>Hello World</Heading>)
    expect(app.text).toContain("Hello World")
  })

  test("default level is 1 with textSize 2.0", () => {
    const app = render(<Heading>Title</Heading>)
    const node = app.getByText("Title").resolve()
    expect(node).not.toBeNull()
    const props = node!.props as StyleProps
    expect(props.textSize).toBe(2.0)
  })

  test("h1 has textSize 2.0", () => {
    const app = render(<Heading level={1}>H1</Heading>)
    const node = app.getByText("H1").resolve()
    expect(node).not.toBeNull()
    expect((node!.props as StyleProps).textSize).toBe(2.0)
  })

  test("h2 has textSize 1.5", () => {
    const app = render(<Heading level={2}>H2</Heading>)
    const node = app.getByText("H2").resolve()
    expect(node).not.toBeNull()
    expect((node!.props as StyleProps).textSize).toBe(1.5)
  })

  test("h3 has textSize 1.25", () => {
    const app = render(<Heading level={3}>H3</Heading>)
    const node = app.getByText("H3").resolve()
    expect(node).not.toBeNull()
    expect((node!.props as StyleProps).textSize).toBe(1.25)
  })

  test("h4 has textSize 1.0", () => {
    const app = render(<Heading level={4}>H4</Heading>)
    const node = app.getByText("H4").resolve()
    expect(node).not.toBeNull()
    expect((node!.props as StyleProps).textSize).toBe(1.0)
  })

  test("h5 has textSize 0.9", () => {
    const app = render(<Heading level={5}>H5</Heading>)
    const node = app.getByText("H5").resolve()
    expect(node).not.toBeNull()
    expect((node!.props as StyleProps).textSize).toBe(0.9)
  })

  test("h6 has textSize 0.8", () => {
    const app = render(<Heading level={6}>H6</Heading>)
    const node = app.getByText("H6").resolve()
    expect(node).not.toBeNull()
    expect((node!.props as StyleProps).textSize).toBe(0.8)
  })

  test("all levels render bold", () => {
    for (const level of [1, 2, 3, 4, 5, 6] as HeadingLevel[]) {
      const app = render(<Heading level={level}>Bold{level}</Heading>)
      const node = app.getByText(`Bold${level}`).resolve()
      expect(node).not.toBeNull()
      expect((node!.props as StyleProps).bold).toBe(true)
    }
  })

  test("each level has expected scale", () => {
    for (const level of [1, 2, 3, 4, 5, 6] as HeadingLevel[]) {
      const app = render(<Heading level={level}>Scale{level}</Heading>)
      const node = app.getByText(`Scale${level}`).resolve()
      expect(node).not.toBeNull()
      expect((node!.props as StyleProps).textSize).toBe(EXPECTED_SCALES[level])
    }
  })

  test("h1 defaults to $primary color", () => {
    const app = render(<Heading level={1}>Primary</Heading>)
    const node = app.getByText("Primary").resolve()
    expect((node!.props as StyleProps).color).toBe("$primary")
  })

  test("h2 defaults to $accent color", () => {
    const app = render(<Heading level={2}>Accent</Heading>)
    const node = app.getByText("Accent").resolve()
    expect((node!.props as StyleProps).color).toBe("$accent")
  })

  test("h6 defaults to $muted color", () => {
    const app = render(<Heading level={6}>Muted</Heading>)
    const node = app.getByText("Muted").resolve()
    expect((node!.props as StyleProps).color).toBe("$muted")
  })

  test("custom color overrides default", () => {
    const app = render(
      <Heading level={1} color="$success">
        Custom
      </Heading>,
    )
    const node = app.getByText("Custom").resolve()
    expect((node!.props as StyleProps).color).toBe("$success")
  })
})
