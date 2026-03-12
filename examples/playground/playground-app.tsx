/**
 * Canvas Playground App
 *
 * Interactive demo showcasing silvery's Canvas adapter with multiple preset examples,
 * live resize, and theme controls. Communicates with the host page via window messages.
 */

import React, { useState, useEffect, useCallback } from "react"
import { renderToCanvas, Box, Text, useContentRect } from "../../src/canvas/index.js"

// ============================================================================
// Shared components
// ============================================================================

function SizeDisplay() {
  const { width, height } = useContentRect()
  return (
    <Text color="$success">
      {Math.round(width)}px x {Math.round(height)}px
    </Text>
  )
}

function Divider({ color = "$muted" }: { color?: string }) {
  const { width } = useContentRect()
  const line = "─".repeat(Math.max(1, Math.floor(width / 8)))
  return <Text color={color}>{line}</Text>
}

// ============================================================================
// Preset: Hello World
// ============================================================================

function HelloWorld() {
  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="single" borderColor="$info" padding={1}>
        <Box flexDirection="column">
          <Text bold color="$info">
            Hello from silvery!
          </Text>
          <Text color="$muted">React components rendered to HTML5 Canvas</Text>
          <SizeDisplay />
        </Box>
      </Box>
    </Box>
  )
}

// ============================================================================
// Preset: Text Styles
// ============================================================================

function TextStyles() {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="$warning">
        Text Styles
      </Text>
      <Divider />
      <Box flexDirection="column" marginTop={1}>
        <Box flexDirection="row" gap={2}>
          <Text>Normal</Text>
          <Text bold>Bold</Text>
          <Text italic>Italic</Text>
          <Text bold italic>
            Bold Italic
          </Text>
        </Box>
        <Box flexDirection="row" gap={2} marginTop={1}>
          <Text underline>Underline</Text>
          <Text strikethrough>Strikethrough</Text>
          <Text dim>Dim</Text>
        </Box>
        <Box flexDirection="row" gap={2} marginTop={1}>
          <Text underlineStyle="double" underline>
            Double
          </Text>
          <Text underlineStyle="curly" underlineColor="$error" underline>
            Curly Red
          </Text>
          <Text underlineStyle="dotted" underline>
            Dotted
          </Text>
          <Text underlineStyle="dashed" underline>
            Dashed
          </Text>
        </Box>
      </Box>
    </Box>
  )
}

// ============================================================================
// Preset: Colors & Backgrounds
// ============================================================================

function ColorsAndBackgrounds() {
  const colors = [
    { bg: "red", fg: "white", label: "Red" },
    { bg: "green", fg: "black", label: "Green" },
    { bg: "blue", fg: "white", label: "Blue" },
    { bg: "yellow", fg: "black", label: "Yellow" },
    { bg: "magenta", fg: "white", label: "Magenta" },
    { bg: "cyan", fg: "black", label: "Cyan" },
  ]

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="$warning">
        Colors and Backgrounds
      </Text>
      <Divider />
      <Box flexDirection="row" gap={1} marginTop={1}>
        {colors.map(({ bg, fg, label }) => (
          <Box key={bg} backgroundColor={bg} padding={1}>
            <Text color={fg}>{label}</Text>
          </Box>
        ))}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text color="red">Red text</Text>
        <Text color="green">Green text</Text>
        <Text color="blue">Blue text</Text>
        <Text color="brightYellow">Bright yellow text</Text>
        <Text color="brightCyan">Bright cyan text</Text>
        <Text color="#ff6b6b">Custom hex #ff6b6b</Text>
        <Text color="rgb(147, 130, 220)">Custom RGB</Text>
      </Box>
    </Box>
  )
}

// ============================================================================
// Preset: Flexbox Layout
// ============================================================================

function FlexboxLayout() {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="$warning">
        Flexbox Layout
      </Text>
      <Divider />

      <Text color="$muted" marginTop={1}>
        Row (gap=1):
      </Text>
      <Box flexDirection="row" gap={1}>
        <Box borderStyle="single" borderColor="$error" padding={1} flexGrow={1}>
          <Text color="$error">Col 1</Text>
        </Box>
        <Box borderStyle="single" borderColor="$success" padding={1} flexGrow={2}>
          <Text color="$success">Col 2 (grow=2)</Text>
        </Box>
        <Box borderStyle="single" borderColor="$primary" padding={1} flexGrow={1}>
          <Text color="$primary">Col 3</Text>
        </Box>
      </Box>

      <Text color="$muted" marginTop={1}>
        Nested columns:
      </Text>
      <Box flexDirection="row" gap={1}>
        <Box
          borderStyle="round"
          borderColor="$accent"
          padding={1}
          flexGrow={1}
          flexDirection="column"
        >
          <Text bold color="$accent">
            Panel A
          </Text>
          <Text>Item 1</Text>
          <Text>Item 2</Text>
          <Text>Item 3</Text>
        </Box>
        <Box
          borderStyle="round"
          borderColor="$info"
          padding={1}
          flexGrow={1}
          flexDirection="column"
        >
          <Text bold color="$info">
            Panel B
          </Text>
          <Text>Item A</Text>
          <Text>Item B</Text>
        </Box>
      </Box>
    </Box>
  )
}

// ============================================================================
// Preset: Border Styles
// ============================================================================

function BorderStyles() {
  const styles: Array<{ style: string; color: string }> = [
    { style: "single", color: "$info" },
    { style: "double", color: "$warning" },
    { style: "round", color: "$success" },
    { style: "bold", color: "$accent" },
  ]

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="$warning">
        Border Styles
      </Text>
      <Divider />
      <Box flexDirection="row" gap={1} marginTop={1}>
        {styles.map(({ style, color }) => (
          <Box key={style} borderStyle={style as any} borderColor={color} padding={1} flexGrow={1}>
            <Box flexDirection="column">
              <Text bold color={color}>
                {style}
              </Text>
              <Text>border</Text>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

// ============================================================================
// Preset: Dashboard
// ============================================================================

function Dashboard() {
  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="single" borderColor="$info" padding={1}>
        <Text bold color="$info">
          System Dashboard
        </Text>
      </Box>
      <Box flexDirection="row" gap={1} marginTop={1}>
        <Box
          borderStyle="round"
          borderColor="$success"
          padding={1}
          flexGrow={1}
          flexDirection="column"
        >
          <Text bold color="$success">
            CPU
          </Text>
          <Text color="$success">|||||||....</Text>
          <Text>65%</Text>
        </Box>
        <Box
          borderStyle="round"
          borderColor="$warning"
          padding={1}
          flexGrow={1}
          flexDirection="column"
        >
          <Text bold color="$warning">
            Memory
          </Text>
          <Text color="$warning">|||||||||..</Text>
          <Text>82%</Text>
        </Box>
        <Box
          borderStyle="round"
          borderColor="$error"
          padding={1}
          flexGrow={1}
          flexDirection="column"
        >
          <Text bold color="$error">
            Disk
          </Text>
          <Text color="$error">||||||||||.</Text>
          <Text>91%</Text>
        </Box>
      </Box>
      <Box
        borderStyle="single"
        borderColor="$muted"
        padding={1}
        marginTop={1}
        flexDirection="column"
      >
        <Text bold>Recent Events</Text>
        <Text color="$success"> OK api-server healthy</Text>
        <Text color="$success"> OK database connected</Text>
        <Text color="$warning"> WARN cache miss rate high</Text>
        <Text color="$error"> ERR disk space low on /var</Text>
      </Box>
    </Box>
  )
}

// ============================================================================
// Preset: Responsive
// ============================================================================

function Responsive() {
  const { width } = useContentRect()
  const isWide = width > 350

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="$warning">
        Responsive Layout
      </Text>
      <Text color="$muted">Resize the canvas to see layout adapt ({Math.round(width)}px wide)</Text>
      <Divider />
      <Box flexDirection={isWide ? "row" : "column"} gap={1} marginTop={1}>
        <Box
          borderStyle="single"
          borderColor="$info"
          padding={1}
          flexGrow={1}
          flexDirection="column"
        >
          <Text bold color="$info">
            Main Content
          </Text>
          <Text>This panel takes available space.</Text>
          <Text>Layout: {isWide ? "horizontal" : "vertical"}</Text>
          <SizeDisplay />
        </Box>
        <Box
          borderStyle="single"
          borderColor="$accent"
          padding={1}
          flexDirection="column"
          {...(isWide ? { width: 180 } : {})}
        >
          <Text bold color="$accent">
            Sidebar
          </Text>
          <Text>Fixed width when wide,</Text>
          <Text>full width when narrow.</Text>
        </Box>
      </Box>
    </Box>
  )
}

// ============================================================================
// Presets Registry
// ============================================================================

const PRESETS: Record<string, { label: string; component: React.FC }> = {
  hello: { label: "Hello World", component: HelloWorld },
  text: { label: "Text Styles", component: TextStyles },
  colors: { label: "Colors", component: ColorsAndBackgrounds },
  flexbox: { label: "Flexbox", component: FlexboxLayout },
  borders: { label: "Borders", component: BorderStyles },
  dashboard: { label: "Dashboard", component: Dashboard },
  responsive: { label: "Responsive", component: Responsive },
}

// ============================================================================
// Root App
// ============================================================================

function App({ preset: initialPreset }: { preset: string }) {
  const [currentPreset, setPreset] = useState(initialPreset)

  useEffect(() => {
    // Listen for preset changes from host page
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === "set-preset" && PRESETS[e.data.preset]) {
        setPreset(e.data.preset)
      }
    }
    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [])

  const Component = PRESETS[currentPreset]?.component ?? HelloWorld
  return <Component />
}

// ============================================================================
// Mount
// ============================================================================

const canvas = document.getElementById("canvas") as HTMLCanvasElement
if (canvas) {
  // Read initial preset from URL hash
  const hash = window.location.hash.slice(1)
  const initialPreset = PRESETS[hash] ? hash : "hello"

  let instance = renderToCanvas(<App preset={initialPreset} />, canvas, {
    fontSize: 14,
    fontFamily: "monospace",
  })

  // Handle resize
  function handleResize() {
    const container = canvas.parentElement
    if (!container) return
    const rect = container.getBoundingClientRect()
    const newWidth = Math.floor(rect.width)
    const newHeight = Math.max(300, Math.floor(rect.height))
    if (canvas.width !== newWidth || canvas.height !== newHeight) {
      canvas.width = newWidth
      canvas.height = newHeight
      // Re-render with new dimensions
      instance.unmount()
      const hash = window.location.hash.slice(1)
      const preset = PRESETS[hash] ? hash : "hello"
      instance = renderToCanvas(<App preset={preset} />, canvas, {
        fontSize: 14,
        fontFamily: "monospace",
        width: newWidth,
        height: newHeight,
      })
    }
  }

  // Listen for preset changes and re-render
  window.addEventListener("message", (e) => {
    if (e.data?.type === "set-preset" && PRESETS[e.data.preset]) {
      window.location.hash = e.data.preset
      instance.unmount()
      const container = canvas.parentElement
      const w = container ? Math.floor(container.getBoundingClientRect().width) : canvas.width
      const h = container
        ? Math.max(300, Math.floor(container.getBoundingClientRect().height))
        : canvas.height
      canvas.width = w
      canvas.height = h
      instance = renderToCanvas(<App preset={e.data.preset} />, canvas, {
        fontSize: 14,
        fontFamily: "monospace",
        width: w,
        height: h,
      })
    }
  })

  const resizeObserver = new ResizeObserver(handleResize)
  const container = canvas.parentElement
  if (container) resizeObserver.observe(container)

  // Initial size
  handleResize()

  // Expose for debugging
  ;(window as any).silveryInstance = instance
  ;(window as any).PRESETS = Object.keys(PRESETS)
}

// Export presets list for the host page
;(window as any).PRESET_LIST = Object.entries(PRESETS).map(([id, { label }]) => ({
  id,
  label,
}))
