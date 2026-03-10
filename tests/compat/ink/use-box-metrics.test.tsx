/**
 * Ink compat test: useBoxMetrics (from ink/test/use-box-metrics.tsx)
 *
 * Tests that useBoxMetrics returns actual layout dimensions from silvery's
 * layout pipeline, not stub zeros.
 */
import React, { useRef, useState } from "react"
import { test, expect, beforeAll } from "vitest"
import { stripAnsi } from "@silvery/test"
import { Box, Text, render, useBoxMetrics, type DOMElement } from "../../../packages/compat/src/ink"
import createStdout from "./helpers/create-stdout"
import { initLayoutEngine } from "./helpers/render-to-string"

beforeAll(async () => {
  await initLayoutEngine()
})

test("returns correct size on first render", async () => {
  const stdout = createStdout(100)

  function Test() {
    const ref = useRef<DOMElement>(null)
    const { width, height } = useBoxMetrics(ref)
    return (
      <Box ref={ref}>
        <Text>
          {width}x{height}
        </Text>
      </Box>
    )
  }

  const { waitUntilRenderFlush, unmount } = render(<Test />, { stdout, debug: true })
  await waitUntilRenderFlush()
  await new Promise((r) => setTimeout(r, 50))

  // Width fills terminal (100); single-line text renders as height 1
  expect(stripAnsi(stdout.get())).toContain("100x1")
  unmount()
})

test("returns correct position", async () => {
  const stdout = createStdout(100)

  function Test() {
    const ref = useRef<DOMElement>(null)
    const { left, top } = useBoxMetrics(ref)
    return (
      <Box flexDirection="column">
        <Text>first line</Text>
        <Box ref={ref} marginLeft={5}>
          <Text>
            {left},{top}
          </Text>
        </Box>
      </Box>
    )
  }

  const { waitUntilRenderFlush, unmount } = render(<Test />, { stdout, debug: true })
  await waitUntilRenderFlush()
  await new Promise((r) => setTimeout(r, 50))

  // MarginLeft=5 → left=5; second row → top=1
  expect(stripAnsi(stdout.get())).toContain("5,1")
  unmount()
})

test("updates when sibling content changes", async () => {
  const stdout = createStdout(100)
  let externalSetSiblingText!: (text: string) => void

  function Test() {
    const ref = useRef<DOMElement>(null)
    const [siblingText, setSiblingText] = useState("short")
    const { height } = useBoxMetrics(ref)

    externalSetSiblingText = setSiblingText

    return (
      <Box flexDirection="column">
        <Box ref={ref} flexDirection="column">
          <Text>{siblingText}</Text>
        </Box>
        <Text>Height: {height}</Text>
      </Box>
    )
  }

  const { waitUntilRenderFlush, unmount } = render(<Test />, { stdout, debug: true })
  await waitUntilRenderFlush()
  await new Promise((r) => setTimeout(r, 50))

  expect(stripAnsi(stdout.get())).toContain("Height: 1")

  externalSetSiblingText("line 1\nline 2\nline 3")
  await new Promise((r) => setTimeout(r, 50))

  expect(stripAnsi(stdout.get())).toContain("Height: 3")
  unmount()
})

test("returns zeros when ref is not attached", async () => {
  const stdout = createStdout(100)

  function Test() {
    const ref = useRef<DOMElement>(null)
    const { width, height, left, top, hasMeasured } = useBoxMetrics(ref)
    return (
      <Box>
        <Text>
          {width},{height},{left},{top},{String(hasMeasured)}
        </Text>
      </Box>
    )
  }

  const { waitUntilRenderFlush, unmount } = render(<Test />, { stdout, debug: true })
  await waitUntilRenderFlush()
  await new Promise((r) => setTimeout(r, 50))

  expect(stripAnsi(stdout.get())).toContain("0,0,0,0,false")
  unmount()
})

test("hasMeasured becomes true when tracked element is mounted on initial render", async () => {
  const stdout = createStdout(100)

  function Test() {
    const ref = useRef<DOMElement>(null)
    const { hasMeasured } = useBoxMetrics(ref)

    return (
      <Box ref={ref}>
        <Text>Has measured: {String(hasMeasured)}</Text>
      </Box>
    )
  }

  const { waitUntilRenderFlush, unmount } = render(<Test />, { stdout, debug: true })
  await waitUntilRenderFlush()
  await new Promise((r) => setTimeout(r, 50))

  expect(stripAnsi(stdout.get())).toContain("Has measured: true")
  unmount()
})

test("resets metrics when tracked element unmounts", async () => {
  const stdout = createStdout(100)
  let unmountTrackedElement!: () => void

  function Test() {
    const ref = useRef<DOMElement>(null)
    const [isTrackedElementMounted, setIsTrackedElementMounted] = useState(true)
    const { width, height, left, top, hasMeasured } = useBoxMetrics(ref)

    unmountTrackedElement = () => {
      setIsTrackedElementMounted(false)
    }

    return (
      <Box flexDirection="column">
        {isTrackedElementMounted ? (
          <Box ref={ref} width={10}>
            <Text>1234567890</Text>
          </Box>
        ) : undefined}
        <Text>
          Metrics: {width},{height},{left},{top},{String(hasMeasured)}
        </Text>
      </Box>
    )
  }

  const { waitUntilRenderFlush, unmount } = render(<Test />, { stdout, debug: true })
  await waitUntilRenderFlush()
  await new Promise((r) => setTimeout(r, 50))

  expect(stripAnsi(stdout.get())).toContain("Metrics: 10,1,0,0,true")

  unmountTrackedElement()
  await waitUntilRenderFlush()
  await new Promise((r) => setTimeout(r, 50))

  expect(stripAnsi(stdout.get())).toContain("Metrics: 0,0,0,0,false")
  unmount()
})

test("hasMeasured becomes true after the tracked element is measured", async () => {
  const stdout = createStdout(100)
  let mountTrackedElement!: () => void

  function Test() {
    const ref = useRef<DOMElement>(null)
    const [isTrackedElementMounted, setIsTrackedElementMounted] = useState(false)
    const { hasMeasured } = useBoxMetrics(ref)

    mountTrackedElement = () => {
      setIsTrackedElementMounted(true)
    }

    return (
      <Box flexDirection="column">
        {isTrackedElementMounted ? (
          <Box ref={ref}>
            <Text>Tracked</Text>
          </Box>
        ) : undefined}
        <Text>Has measured: {String(hasMeasured)}</Text>
      </Box>
    )
  }

  const { waitUntilRenderFlush, unmount } = render(<Test />, { stdout, debug: true })
  await waitUntilRenderFlush()
  await new Promise((r) => setTimeout(r, 50))

  expect(stripAnsi(stdout.get())).toContain("Has measured: false")

  mountTrackedElement()
  await waitUntilRenderFlush()
  await new Promise((r) => setTimeout(r, 50))

  expect(stripAnsi(stdout.get())).toContain("Has measured: true")
  unmount()
})
