/**
 * Ink compat test: measureElement (from ink/test/measure-element.tsx)
 *
 * Tests that measureElement returns correct values after state changes,
 * not stale/zero values.
 */
import React, { useState, useRef, useEffect, useLayoutEffect } from "react"
import { test, expect, beforeAll } from "vitest"
import { stripAnsi } from "@silvery/test"
import { Box, Text, render, measureElement, type DOMElement } from "../../../packages/compat/src/ink"
import createStdout from "./helpers/create-stdout"
import { initLayoutEngine } from "./helpers/render-to-string"

beforeAll(async () => {
  await initLayoutEngine()
})

test("measure element", async () => {
  const stdout = createStdout()

  function Test() {
    const [width, setWidth] = useState(0)
    const ref = useRef<DOMElement>(null)

    useEffect(() => {
      if (!ref.current) return
      setWidth(measureElement(ref.current).width)
    }, [])

    return (
      <Box ref={ref}>
        <Text>Width: {width}</Text>
      </Box>
    )
  }

  const { unmount } = render(<Test />, { stdout, debug: true })
  await new Promise((r) => setTimeout(r, 100))

  // After effects run and re-render, should show actual width
  expect(stripAnsi(stdout.get())).toContain("Width: 100")
  unmount()
})

test("measure element after state update", async () => {
  const stdout = createStdout()
  let setTestItems!: (items: string[]) => void

  function Test() {
    const [items, setItems] = useState<string[]>([])
    const [height, setHeight] = useState(0)
    const ref = useRef<DOMElement>(null)

    setTestItems = setItems

    useEffect(() => {
      if (!ref.current) return
      setHeight(measureElement(ref.current).height)
    }, [items.length])

    return (
      <Box flexDirection="column">
        <Box ref={ref} flexDirection="column">
          {items.map((item) => (
            <Text key={item}>{item}</Text>
          ))}
        </Box>
        <Text>Height: {height}</Text>
      </Box>
    )
  }

  render(<Test />, { stdout, debug: true })
  await new Promise((r) => setTimeout(r, 50))

  setTestItems(["line 1", "line 2", "line 3"])
  await new Promise((r) => setTimeout(r, 50))

  expect(stripAnsi(stdout.get()).trim()).toContain("Height: 3")
})

test("measure element after multiple state updates", async () => {
  const stdout = createStdout()
  let setTestItems!: (items: string[]) => void

  function Test() {
    const [items, setItems] = useState<string[]>([])
    const [height, setHeight] = useState(0)
    const ref = useRef<DOMElement>(null)

    setTestItems = setItems

    useEffect(() => {
      if (!ref.current) return
      setHeight(measureElement(ref.current).height)
    }, [items.length])

    return (
      <Box flexDirection="column">
        <Box ref={ref} flexDirection="column">
          {items.map((item) => (
            <Text key={item}>{item}</Text>
          ))}
        </Box>
        <Text>Height: {height}</Text>
      </Box>
    )
  }

  render(<Test />, { stdout, debug: true })
  await new Promise((r) => setTimeout(r, 50))

  setTestItems(["line 1", "line 2", "line 3"])
  await new Promise((r) => setTimeout(r, 50))

  setTestItems(["line 1"])
  await new Promise((r) => setTimeout(r, 50))

  expect(stripAnsi(stdout.get()).trim()).toContain("Height: 1")
})

test("measure element in useLayoutEffect after state update", async () => {
  const stdout = createStdout()
  let setTestItems!: (items: string[]) => void

  function Test() {
    const [items, setItems] = useState<string[]>([])
    const [height, setHeight] = useState(0)
    const ref = useRef<DOMElement>(null)

    setTestItems = setItems

    useLayoutEffect(() => {
      if (!ref.current) return
      setHeight(measureElement(ref.current).height)
    }, [items.length])

    return (
      <Box flexDirection="column">
        <Box ref={ref} flexDirection="column">
          {items.map((item) => (
            <Text key={item}>{item}</Text>
          ))}
        </Box>
        <Text>Height: {height}</Text>
      </Box>
    )
  }

  render(<Test />, { stdout, debug: true })
  await new Promise((r) => setTimeout(r, 50))

  setTestItems(["line 1", "line 2", "line 3"])
  await new Promise((r) => setTimeout(r, 50))

  expect(stripAnsi(stdout.get()).trim()).toContain("Height: 3")
})
