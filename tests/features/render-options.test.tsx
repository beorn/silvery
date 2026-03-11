/**
 * Tests for render() options: wrapRoot, stdin, autoRender, onFrame
 */
import React, { createContext, useContext } from "react"
import { describe, test, expect } from "vitest"
import { render, ensureEngine } from "@silvery/term/renderer"
import { Box, Text } from "silvery"

await ensureEngine()

describe("wrapRoot", () => {
  test("wraps root element with additional providers", () => {
    const TestContext = createContext("default")

    function App() {
      const value = useContext(TestContext)
      return <Text>{value}</Text>
    }

    const app = render(<App />, {
      cols: 40,
      rows: 5,
      wrapRoot: (el) => React.createElement(TestContext.Provider, { value: "wrapped" }, el),
    })

    expect(app.text).toContain("wrapped")
    app.unmount()
  })

  test("wrapRoot is applied on rerender too", () => {
    const TestContext = createContext("default")

    function App({ label }: { label: string }) {
      const value = useContext(TestContext)
      return (
        <Text>
          {label}: {value}
        </Text>
      )
    }

    const app = render(<App label="first" />, {
      cols: 40,
      rows: 5,
      wrapRoot: (el) => React.createElement(TestContext.Provider, { value: "injected" }, el),
    })

    expect(app.text).toContain("first: injected")

    app.rerender(<App label="second" />)
    expect(app.text).toContain("second: injected")

    app.unmount()
  })

  test("wrapRoot receives silvery contexts", () => {
    // The wrapper is applied INSIDE silvery's contexts,
    // so components inside wrapRoot can use silvery hooks
    const app = render(<Text>hello</Text>, {
      cols: 40,
      rows: 5,
      wrapRoot: (el) =>
        React.createElement(Box, { flexDirection: "column" }, React.createElement(Text, null, "header"), el),
    })

    expect(app.text).toContain("header")
    expect(app.text).toContain("hello")
    app.unmount()
  })
})

describe("onFrame", () => {
  test("fires after initial render", () => {
    const frames: string[] = []
    const app = render(<Text>hello</Text>, {
      cols: 40,
      rows: 5,
      onFrame: (frame) => frames.push(frame),
    })

    expect(frames.length).toBe(1)
    expect(frames[0]).toContain("hello")
    app.unmount()
  })

  test("fires after rerender", () => {
    const frames: string[] = []
    const app = render(<Text>first</Text>, {
      cols: 40,
      rows: 5,
      onFrame: (frame) => frames.push(frame),
    })

    app.rerender(<Text>second</Text>)
    expect(frames.length).toBe(2)
    expect(frames[1]).toContain("second")
    app.unmount()
  })
})
