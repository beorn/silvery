import React from "react"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import {
  addWriter,
  getDebugFilter,
  getLogLevel,
  setDebugFilter,
  setLogLevel,
  setSuppressConsole,
  type Event,
  type LogEvent,
  type LogLevel,
} from "loggily"
import { createRenderer } from "@silvery/test"
import { Box } from "../src/components/Box"
import { Text } from "../src/components/Text"
import { ListView } from "../src/ui/components/ListView"

const ITEMS = ["alpha", "beta", "gamma"]

describe("silvery:mount debug stream", () => {
  let events: LogEvent[] = []
  let unsubscribe: (() => void) | null = null
  let previousDebugFilter: string[] | null = null
  let previousLogLevel: LogLevel

  beforeEach(() => {
    events = []
    previousDebugFilter = getDebugFilter()
    previousLogLevel = getLogLevel()
    setDebugFilter(["silvery:mount"])
    setLogLevel("debug")
    setSuppressConsole(true)
    unsubscribe = addWriter(
      { ns: "silvery:mount", level: "debug" },
      (_formatted: string, _level: string, _namespace: string, event: Event) => {
        if (event.kind === "log") events.push(event)
      },
    )
  })

  afterEach(() => {
    unsubscribe?.()
    unsubscribe = null
    setDebugFilter(previousDebugFilter)
    setLogLevel(previousLogLevel)
    setSuppressConsole(false)
  })

  test("logs a real ListView mount with a grep-friendly component name", () => {
    const render = createRenderer({ cols: 40, rows: 8 })

    const app = render(
      <ListView items={ITEMS} height={4} renderItem={(item) => <Text>{item}</Text>} />,
    )

    const listEvent = events.find((event) => event.message === "mount ListView")
    expect(listEvent).toBeDefined()
    expect(listEvent?.props).toMatchObject({
      component: "ListView",
      event: "mount",
      type: "silvery-box",
    })
    expect(listEvent?.props?.props).toMatchObject({
      overflow: "scroll",
      onWheel: true,
    })

    app.unmount()
  })

  test("logs unmounts for removed subtrees", () => {
    function App({ show }: { show: boolean }) {
      return (
        <Box>
          {show && <Text testID="transient">Transient row</Text>}
          <Text>Persistent row</Text>
        </Box>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App show={true} />)

    events = []
    app.rerender(<App show={false} />)

    expect(events.some((event) => event.message === "unmount Text#transient")).toBe(true)

    app.unmount()
  })

  test("logs host updates with compact identifying props", () => {
    function App({ width }: { width: number }) {
      return (
        <Box testID="pane" width={width}>
          <Text>Resizable</Text>
        </Box>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App width={10} />)

    events = []
    app.rerender(<App width={12} />)

    const updateEvent = events.find((event) => event.message === "update Box#pane")
    expect(updateEvent).toBeDefined()
    expect(updateEvent?.props).toMatchObject({
      component: "Box#pane",
      event: "update",
      props: {
        testID: "pane",
        width: 12,
      },
      type: "silvery-box",
    })

    app.unmount()
  })
})
