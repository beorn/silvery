import { describe, test, expect } from "vitest"
import { createRenderer } from "inkx/testing"
import { Box, Text, VirtualList, useContentRectCallback, useScreenRectCallback } from "inkx"
import React from "react"

describe("VirtualList variable height", () => {
  test("items with different heights render correctly (basic)", () => {
    const render = createRenderer({ cols: 40, rows: 12 })
    const items = ["a", "b", "c", "d", "e"]
    const app = render(
      <VirtualList
        items={items}
        height={10}
        itemHeight={(item, index) => index === 0 ? 2 : 1}
        renderItem={(item, index) => (
          index === 0 ? (
            <Box key={item} flexDirection="column" height={2}>
              <Text>{item}</Text>
              <Box height={1} />
            </Box>
          ) : (
            <Text key={item}>{item}</Text>
          )
        )}
      />
    )
    const lines = app.text.split("\n")
    expect(lines[0]).toContain("a")
    expect(lines[1]?.trim()).toBe("")
    expect(lines[2]).toContain("b")
    expect(lines[3]).toContain("c")
    expect(lines[4]).toContain("d")
  })

  test("height={2} on first item with useContentRectCallback + useScreenRectCallback", () => {
    const render = createRenderer({ cols: 50, rows: 20 })
    const items = ["body1", "body2", "task-a", "task-b"]

    // Wrapper that mimics CardLayoutTracker (useContentRectCallback)
    function CardTracker({ children }: { children: React.ReactNode }) {
      useContentRectCallback(() => {})
      return <Box flexDirection="column">{children}</Box>
    }

    // Wrapper that mimics HeadRow > HeadLayoutRegistrar (useScreenRectCallback)
    function HeadRow({ children }: { children: React.ReactNode }) {
      return (
        <Box flexDirection="column">
          <HeadRegistrar />
          {children}
        </Box>
      )
    }

    function HeadRegistrar(): null {
      useScreenRectCallback(() => {})
      return null
    }

    const app = render(
      <Box flexDirection="column" width={50} height={20}>
        <Box height={1} flexShrink={0} />
        <Box flexDirection="row" flexGrow={1}>
          <Box flexDirection="column" width={50} height={19} overflow="hidden">
            <Box flexDirection="column" height={2} flexShrink={0}>
              <Text bold>Column Header</Text>
              <Text dimColor>{"─".repeat(50)}</Text>
            </Box>
            <VirtualList
              items={items}
              height={17}
              overscan={20}
              maxRendered={100}
              itemHeight={(item, index) => index === 0 ? 2 : 1}
              renderItem={(item, index) => (
                <Box key={item} paddingLeft={1}>
                  <CardTracker>
                    <Box flexDirection="column" height={index === 0 ? 2 : 1} overflow="hidden">
                      <HeadRow>
                        <Box flexDirection="row" alignItems="flex-start">
                          <Text>{item}</Text>
                        </Box>
                      </HeadRow>
                    </Box>
                  </CardTracker>
                </Box>
              )}
            />
          </Box>
        </Box>
      </Box>
    )

    const lines = app.text.split("\n")
    const sepIdx = lines.findIndex((l) => l.includes("───"))
    const contentLines = lines.slice(sepIdx + 1)

    const body1Idx = contentLines.findIndex((l) => l.includes("body1"))
    const body2Idx = contentLines.findIndex((l) => l.includes("body2"))
    const taskAIdx = contentLines.findIndex((l) => l.includes("task-a"))
    const taskBIdx = contentLines.findIndex((l) => l.includes("task-b"))

    const bodySpacing = body2Idx - body1Idx
    const structuralSpacing = taskBIdx - taskAIdx

    // body1 has height=2 so body2 should be 2 rows later
    expect(bodySpacing).toBe(2)
    // task-a and task-b both have height=1 so should be adjacent
    expect(structuralSpacing).toBe(1)
  })
})
