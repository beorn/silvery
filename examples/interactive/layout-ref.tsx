/**
 * Layout Ref Example
 *
 * Demonstrates imperative access to layout information:
 * - forwardRef on Box and Text components
 * - BoxHandle for accessing layout info imperatively
 * - onLayout callback for responding to size changes
 */

import React, { useRef, useState, useEffect } from "react"
import { render, Box, Text, useInput, useApp, createTerm, type BoxHandle, type Key } from "../../src/index.js"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Layout Ref",
  description: "useContentRect + useScreenRect for imperative layout measurement",
  features: ["forwardRef", "BoxHandle", "onLayout", "getContentRect()"],
}

// ============================================================================
// Components
// ============================================================================

interface LayoutInfo {
  x: number
  y: number
  width: number
  height: number
}

function ResizablePane({
  title,
  color,
  onLayoutChange,
}: {
  title: string
  color: string
  onLayoutChange: (info: LayoutInfo) => void
}) {
  const boxRef = useRef<BoxHandle>(null)

  // onLayout callback fires when this Box's dimensions change
  return (
    <Box
      ref={boxRef}
      flexGrow={1}
      borderStyle="round"
      borderColor={color}
      padding={1}
      onLayout={(layout) => onLayoutChange(layout)}
    >
      <Text bold color={color}>
        {title}
      </Text>
    </Box>
  )
}

function ImperativeAccessDemo() {
  const boxRef = useRef<BoxHandle>(null)
  const [info, setInfo] = useState<string>("Click 'i' to inspect")

  const inspect = () => {
    if (!boxRef.current) {
      setInfo("No ref attached")
      return
    }

    const content = boxRef.current.getContentRect()
    const screen = boxRef.current.getScreenRect()
    const node = boxRef.current.getNode()

    setInfo(
      `Content: ${content?.width}x${content?.height} at (${content?.x},${content?.y})\n` +
        `Screen: ${screen?.width}x${screen?.height} at (${screen?.x},${screen?.y})\n` +
        `Node: ${node ? "available" : "null"}`,
    )
  }

  return (
    <Box ref={boxRef} flexDirection="column" borderStyle="double" borderColor="magenta" padding={1}>
      <Text bold color="magenta">
        Imperative Access (BoxHandle)
      </Text>
      <Text dim>Press 'i' to inspect this box</Text>
      <Box marginTop={1}>
        <Text>{info}</Text>
      </Box>
      {/* Expose inspect function via closure */}
      <InspectTrigger onInspect={inspect} />
    </Box>
  )
}

// Hidden component to trigger inspect on keypress
function InspectTrigger({ onInspect }: { onInspect: () => void }) {
  useInput((input: string) => {
    if (input === "i") {
      onInspect()
    }
  })
  return null
}

export function LayoutRefApp(): JSX.Element {
  const { exit } = useApp()
  const [layouts, setLayouts] = useState<Record<string, LayoutInfo>>({})

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) {
      exit()
    }
  })

  const handleLayoutChange = (pane: string) => (info: LayoutInfo) => {
    setLayouts((prev) => ({ ...prev, [pane]: info }))
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Row of resizable panes with onLayout callbacks */}
      <Box flexDirection="row" gap={1} height={8}>
        <ResizablePane title="Pane A" color="green" onLayoutChange={handleLayoutChange("a")} />
        <ResizablePane title="Pane B" color="blue" onLayoutChange={handleLayoutChange("b")} />
        <ResizablePane title="Pane C" color="cyan" onLayoutChange={handleLayoutChange("c")} />
      </Box>

      {/* Show layout info from onLayout callbacks */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" padding={1}>
        <Box flexDirection="column">
          <Text bold dim>
            onLayout Results:
          </Text>
          {Object.entries(layouts).map(([pane, info]) => (
            <Text key={pane} dim>
              Pane {pane.toUpperCase()}: {info.width}x{info.height} at ({info.x},{info.y})
            </Text>
          ))}
          {Object.keys(layouts).length === 0 && (
            <Text dim italic>
              Waiting for layout...
            </Text>
          )}
        </Box>
      </Box>

      {/* Imperative access demo */}
      <Box flexGrow={1} marginTop={1}>
        <ImperativeAccessDemo />
      </Box>

      <Text dim>
        {" "}
        <Text bold dim>
          i
        </Text>{" "}
        inspect{" "}
        <Text bold dim>
          Esc/q
        </Text>{" "}
        quit
      </Text>
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="i inspect  Esc/q quit">
      <LayoutRefApp />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
