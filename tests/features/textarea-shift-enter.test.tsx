/**
 * Shift+Enter universally inserts a newline regardless of submitKey.
 *
 * Standard chat-input convention: plain Enter submits when submitKey="enter",
 * but Shift+Enter always inserts a newline so users can compose multi-line
 * messages. Previously the submit guards in useTextArea didn't check
 * `key.shift`, so Shift+Enter triggered submit when submitKey="enter".
 *
 * Companion bead: km-silvercode.shift-enter-newline.
 */

import React, { useState } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, TextArea } from "@silvery/ag-react"

describe("TextArea Shift+Enter", () => {
  test('Shift+Enter inserts newline when submitKey="enter"', async () => {
    let submitted: string | null = null
    function App() {
      const [value, setValue] = useState("")
      return (
        <Box width={40} height={5}>
          <TextArea
            value={value}
            onChange={setValue}
            submitKey="enter"
            onSubmit={(v) => {
              submitted = v
            }}
            fieldSizing="fixed"
            rows={4}
          />
        </Box>
      )
    }
    const r = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = r(<App />)
    await app.type("hi")
    await app.press("Shift+Enter")
    await app.type("yo")
    expect(submitted).toBeNull()
    expect(app.text).toContain("hi")
    expect(app.text).toContain("yo")
  })

  test('plain Enter still submits when submitKey="enter"', async () => {
    let submitted: string | null = null
    function App() {
      const [value, setValue] = useState("")
      return (
        <Box width={40} height={5}>
          <TextArea
            value={value}
            onChange={setValue}
            submitKey="enter"
            onSubmit={(v) => {
              submitted = v
            }}
            fieldSizing="fixed"
            rows={4}
          />
        </Box>
      )
    }
    const r = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = r(<App />)
    await app.type("hello")
    await app.press("Enter")
    expect(submitted).toBe("hello")
  })
})
