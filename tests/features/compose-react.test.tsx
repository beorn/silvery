/**
 * Tests for the withReact() compose plugin.
 *
 * Verifies the compose pipeline: create + withAg + withTerm + withReact.
 */
import { describe, test, expect, beforeAll } from "vitest"
import React from "react"
import { create, pipe, withAg, withTerm, withReact, createTerm } from "@silvery/ag-term"
import { ensureLayoutEngine } from "@silvery/ag-term/runtime"
import { Box, Text } from "@silvery/ag-react"

beforeAll(async () => {
  await ensureLayoutEngine()
})

function SimpleApp() {
  return (
    <Box>
      <Text>Hello World</Text>
    </Box>
  )
}

describe("withReact", () => {
  test("mounts React element into ag tree", () => {
    const term = createTerm({ cols: 40, rows: 10 })
    const app = pipe(create(), withAg(), withTerm(term), withReact(<SimpleApp />))

    expect(app.element).toBeDefined()
    // Reconciler should have populated the root with children
    expect(app.ag.root.children.length).toBeGreaterThan(0)
  })

  test("render() produces output after React mount", () => {
    const term = createTerm({ cols: 40, rows: 10 })
    const app = pipe(create(), withAg(), withTerm(term), withReact(<SimpleApp />))

    // Use app.render() which does layout + render + paint
    app.render()

    // Verify via ag.render (need layout first)
    app.ag.layout({ cols: 40, rows: 10 })
    const result = app.ag.render({ fresh: true })
    expect(result.frame.text).toContain("Hello World")
  })
})

describe("full pipeline", () => {
  test("create + withAg + withTerm + withReact end-to-end", () => {
    const term = createTerm({ cols: 80, rows: 24 })
    const app = pipe(create(), withAg(), withTerm(term), withReact(<SimpleApp />))

    // All compose layers present
    expect(app.ag).toBeDefined()
    expect(app.term).toBe(term)
    expect(typeof app.render).toBe("function")
    expect(typeof app.dispatch).toBe("function")
    app.ag.layout({ cols: 80, rows: 24 })
    expect(app.ag.render({ fresh: true }).frame.text).toContain("Hello World")
  })
})
