/**
 * Render-path debug primitive — answers "what's the parent chain of
 * component X?" without grepping source.
 *
 * Bead: @km/silvery/14348-render-path-trace
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"
import {
  findNodesByComponentName,
  formatRenderPath,
  getComponentName,
  getMountTree,
  getRenderPath,
} from "@silvery/ag-react/debug/render-path"

function App() {
  return (
    <Box data-component="App">
      <Box data-component="Header">
        <Text>title</Text>
      </Box>
      <Box data-component="Body">
        <Box data-component="ToolBlock" testID="tool-1">
          <Text>tool output</Text>
        </Box>
      </Box>
      <Box data-component="Footer">
        <Text>foot</Text>
      </Box>
    </Box>
  )
}

describe("render-path debug primitive", () => {
  test("getRenderPath returns parent chain to first matching component", () => {
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(<App />)
    const path = app.renderPath("ToolBlock")
    expect(path.map((n) => n.name)).toEqual(["silvery-root", "App", "Body", "ToolBlock"])
  })

  test("getRenderPath returns [] when component not found", () => {
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(<App />)
    expect(app.renderPath("NotARealComponent")).toEqual([])
  })

  test("findNodesByComponentName returns all matches in DFS pre-order", () => {
    function MultiApp() {
      return (
        <Box data-component="App">
          <Box testID="c1">
            <Text>one</Text>
          </Box>
          <Box testID="c2">
            <Text>two</Text>
          </Box>
          <Box data-component="Wrapper">
            <Box testID="c3">
              <Text>three</Text>
            </Box>
          </Box>
        </Box>
      )
    }
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(<MultiApp />)
    const container = app.getContainer()
    const c2 = findNodesByComponentName(container, "Box#c2")
    expect(c2).toHaveLength(1)
    expect(getComponentName(c2[0]!)).toBe("Box#c2")
    const c3 = findNodesByComponentName(container, "Box#c3")
    expect(c3).toHaveLength(1)
  })

  test("getMountTree dumps the full tree structurally", () => {
    function Tiny() {
      return (
        <Box data-component="Root">
          <Text>hello</Text>
        </Box>
      )
    }
    const r = createRenderer({ cols: 20, rows: 5 })
    const app = r(<Tiny />)
    const tree = app.mountTree()
    expect(tree.name).toBe("silvery-root")
    expect(tree.children).toHaveLength(1)
    expect(tree.children[0]!.name).toBe("Root")
    // Text node holds the string "hello"; it shows up as a virtual text child.
    const root = tree.children[0]!
    expect(root.children.length).toBeGreaterThan(0)
  })

  test("formatRenderPath joins names with ' > '", () => {
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(<App />)
    const formatted = formatRenderPath(app.renderPath("ToolBlock"))
    expect(formatted).toBe("silvery-root > App > Body > ToolBlock")
  })

  test("getComponentName prefers data-component over testID over hostType", () => {
    function Mix() {
      return (
        <Box data-component="ExplicitName">
          <Box testID="by-testid">
            <Box>
              <Text>plain</Text>
            </Box>
          </Box>
        </Box>
      )
    }
    const r = createRenderer({ cols: 30, rows: 5 })
    const app = r(<Mix />)
    const container = app.getContainer()
    expect(findNodesByComponentName(container, "ExplicitName")).toHaveLength(1)
    expect(findNodesByComponentName(container, "Box#by-testid")).toHaveLength(1)
    // The unnamed nested Box has no data-component / testID / id — falls
    // through to bare hostType "Box".
    expect(findNodesByComponentName(container, "Box").length).toBeGreaterThan(0)
  })

  test("renderPath survives rerender — picks up new tree, not stale snapshot", () => {
    function Switching({ show }: { show: "a" | "b" }) {
      return (
        <Box data-component="Switch">
          {show === "a" ? (
            <Box data-component="LaneA">
              <Text>A</Text>
            </Box>
          ) : (
            <Box data-component="LaneB">
              <Text>B</Text>
            </Box>
          )}
        </Box>
      )
    }
    const r = createRenderer({ cols: 20, rows: 5 })
    const app = r(<Switching show="a" />)
    expect(app.renderPath("LaneA").length).toBeGreaterThan(0)
    expect(app.renderPath("LaneB")).toEqual([])
    app.rerender(<Switching show="b" />)
    expect(app.renderPath("LaneA")).toEqual([])
    expect(app.renderPath("LaneB").length).toBeGreaterThan(0)
  })
})
