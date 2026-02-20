/**
 * Mouse Event Visualizer
 *
 * Interactive demo showing mouse interactions in real-time.
 * Demonstrates SGR mouse protocol (mode 1006) with click, drag, scroll.
 *
 * Features:
 * - Click detection with position
 * - Button identification (left/middle/right)
 * - Scroll wheel events
 * - Drag tracking
 * - Modifier+click combos (⌃ ⇧ ⌥)
 *
 * Run: bun vendor/beorn-inkx/examples/mouse-demo.tsx
 */

import React, { useState, useRef, useEffect } from "react"
import {
  render,
  Box,
  Text,
  useInput,
  useApp,
  useStdin,
  createTerm,
  parseMouseSequence,
  isMouseSequence,
  enableMouse,
  disableMouse,
  type Key,
  type ParsedMouse,
} from "../../src/index.js"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Mouse Event Visualizer",
  description: "Interactive mouse event inspector with SGR protocol support",
  features: ["parseMouseSequence()", "isMouseSequence()", "enableMouse()", "SGR mode 1006"],
}

const BUTTON_NAMES = ["Left", "Middle", "Right"]
const BUTTON_COLORS = ["blue", "yellow", "red"] as const

interface MouseEvent {
  index: number
  parsed: ParsedMouse
  timestamp: number
}

interface ClickMarker {
  x: number
  y: number
  button: number
  age: number
}

function MouseDemo(): JSX.Element {
  const { exit } = useApp()
  const { stdin } = useStdin()
  const [events, setEvents] = useState<MouseEvent[]>([])
  const [latest, setLatest] = useState<ParsedMouse | null>(null)
  const [markers, setMarkers] = useState<ClickMarker[]>([])
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const counterRef = useRef(0)

  // Enable mouse tracking
  useEffect(() => {
    process.stdout.write(enableMouse())
    return () => {
      process.stdout.write(disableMouse())
    }
  }, [])

  // Listen for mouse events on stdin
  useEffect(() => {
    const onData = (data: Buffer) => {
      const raw = data.toString()
      if (!isMouseSequence(raw)) return

      const parsed = parseMouseSequence(raw)
      if (!parsed) return

      counterRef.current++
      const event: MouseEvent = {
        index: counterRef.current,
        parsed,
        timestamp: Date.now(),
      }

      setLatest(parsed)
      setEvents((prev) => [...prev.slice(-15), event])

      // Track clicks for visual markers
      if (parsed.action === "down") {
        setDragStart({ x: parsed.x, y: parsed.y })
        setIsDragging(false)
        setMarkers((prev) => [...prev.slice(-8), { x: parsed.x, y: parsed.y, button: parsed.button, age: 0 }])
      } else if (parsed.action === "move" && dragStart) {
        setIsDragging(true)
      } else if (parsed.action === "up") {
        setDragStart(null)
        setIsDragging(false)
      }
    }

    stdin.on("data", onData)
    return () => {
      stdin.off("data", onData)
    }
  }, [stdin, dragStart])

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) exit()
    if (input === "c") {
      setEvents([])
      setMarkers([])
      setLatest(null)
      counterRef.current = 0
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Box gap={4}>
        {/* Left: Current event details */}
        <Box flexDirection="column" width={45}>
          <Text bold color="cyan">
            Current Event
          </Text>
          <Box height={1} />
          {latest ? <MouseDetails mouse={latest} isDragging={isDragging} dragStart={dragStart} /> : <Text dim>Click anywhere...</Text>}

          {/* Visual legend */}
          <Box flexDirection="column" marginTop={1}>
            <Text bold dim>
              Button Legend
            </Text>
            <Box gap={2}>
              <Text color="blue">Left</Text>
              <Text color="yellow">Middle</Text>
              <Text color="red">Right</Text>
            </Box>
          </Box>

          {/* Click markers */}
          {markers.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold dim>
                Click History
              </Text>
              {markers.map((m, i) => (
                <Text key={i} color={BUTTON_COLORS[m.button] ?? "white"} dimColor={i < markers.length - 1}>
                  {BUTTON_NAMES[m.button] ?? `Btn${m.button}`} at ({m.x}, {m.y})
                </Text>
              ))}
            </Box>
          )}
        </Box>

        {/* Right: Event log */}
        <Box flexDirection="column" width={45}>
          <Text bold color="cyan">
            Event Log ({counterRef.current} total){" "}
            <Text dim>c=clear</Text>
          </Text>
          <Box height={1} />
          {events.length === 0 ? (
            <Text dim>No events yet</Text>
          ) : (
            events.map((e, i) => (
              <Text key={i} dimColor={i < events.length - 1}>
                #{e.index} {formatMouseEvent(e.parsed)}
              </Text>
            ))
          )}
        </Box>
      </Box>
    </Box>
  )
}

function MouseDetails({
  mouse,
  isDragging,
  dragStart,
}: {
  mouse: ParsedMouse
  isDragging: boolean
  dragStart: { x: number; y: number } | null
}): JSX.Element {
  const modifiers: string[] = []
  if (mouse.ctrl) modifiers.push("⌃ Ctrl")
  if (mouse.shift) modifiers.push("⇧ Shift")
  if (mouse.meta) modifiers.push("⌥ Alt")

  return (
    <Box flexDirection="column">
      <Text>
        <Text bold>Action:</Text>{" "}
        <Text color={mouse.action === "down" ? "green" : mouse.action === "up" ? "red" : mouse.action === "wheel" ? "magenta" : "yellow"}>
          {mouse.action}
        </Text>
      </Text>
      <Text>
        <Text bold>Button:</Text>{" "}
        <Text color={BUTTON_COLORS[mouse.button] ?? "white"}>
          {BUTTON_NAMES[mouse.button] ?? `Unknown (${mouse.button})`}
        </Text>
      </Text>
      <Text>
        <Text bold>Position:</Text> ({mouse.x}, {mouse.y})
      </Text>
      {mouse.action === "wheel" && mouse.delta !== undefined && (
        <Text>
          <Text bold>Scroll:</Text>{" "}
          <Text color="magenta">{mouse.delta < 0 ? "up" : "down"}</Text>
        </Text>
      )}
      {isDragging && dragStart && (
        <Text>
          <Text bold>Dragging:</Text>{" "}
          <Text color="yellow">
            from ({dragStart.x}, {dragStart.y}) to ({mouse.x}, {mouse.y})
          </Text>
        </Text>
      )}
      <Text>
        <Text bold>Modifiers:</Text>{" "}
        {modifiers.length > 0 ? modifiers.join("  ") : <Text dim>none</Text>}
      </Text>

      {/* Modifier flags */}
      <Box marginTop={1} gap={2}>
        <ModFlag label="⌃" active={mouse.ctrl} />
        <ModFlag label="⇧" active={mouse.shift} />
        <ModFlag label="⌥" active={mouse.meta} />
      </Box>
    </Box>
  )
}

function ModFlag({ label, active }: { label: string; active: boolean }): JSX.Element {
  return (
    <Text color={active ? "green" : "gray"} bold={active}>
      {label} {active ? "ON" : "off"}
    </Text>
  )
}

function formatMouseEvent(m: ParsedMouse): string {
  const parts: string[] = []
  if (m.ctrl) parts.push("⌃")
  if (m.shift) parts.push("⇧")
  if (m.meta) parts.push("⌥")

  const btn = BUTTON_NAMES[m.button] ?? `Btn${m.button}`

  if (m.action === "wheel") {
    parts.push(`Scroll ${m.delta! < 0 ? "Up" : "Down"} at (${m.x},${m.y})`)
  } else if (m.action === "move") {
    parts.push(`${btn} drag at (${m.x},${m.y})`)
  } else {
    parts.push(`${btn} ${m.action} at (${m.x},${m.y})`)
  }

  return parts.join("")
}

async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="q/Esc quit  c clear">
      <MouseDemo />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()
}

main().catch(console.error)
