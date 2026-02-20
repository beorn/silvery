/**
 * Input — Rich Input Showcase
 *
 * Combined keyboard + mouse showcase demonstrating all input features.
 *
 * Features:
 * - Keybinding display using parseHotkey with ⌘ ⌥ ⌃ ⇧ ✦ symbols
 * - Mouse-clickable UI elements
 * - Mode switching (normal/insert)
 * - Event log showing all input events
 * - Kitty auto-detection
 *
 * Run: bun vendor/beorn-inkx/examples/kitty/input.tsx
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
  parseHotkey,
  parseMouseSequence,
  isMouseSequence,
  KittyFlags,
  enableKittyKeyboard,
  disableKittyKeyboard,
  enableMouse,
  disableMouse,
  detectKittyFromStdio,
  type Key,
  type ParsedMouse,
} from "../../src/index.js"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Input",
  description: "Combined keyboard + mouse input showcase",
  features: ["parseHotkey()", "parseMouseSequence()", "⌘ ⌥ ⌃ ⇧ ✦"],
}

type Mode = "normal" | "insert"
type EventEntry = {
  index: number
  type: "key" | "mouse"
  summary: string
  color?: string
}

// Keybinding definitions with macOS symbols
const KEYBINDINGS = [
  { hotkey: "i", action: "Enter insert mode", mode: "normal" as const },
  { hotkey: "Escape", action: "Return to normal mode", mode: "insert" as const },
  { hotkey: "⌃c", action: "Quit", mode: "both" as const },
  { hotkey: "j", action: "Move down", mode: "normal" as const },
  { hotkey: "k", action: "Move up", mode: "normal" as const },
  { hotkey: "⇧J", action: "Move item down", mode: "normal" as const },
  { hotkey: "⇧K", action: "Move item up", mode: "normal" as const },
  { hotkey: "⌘s", action: "Save (Kitty only)", mode: "both" as const },
  { hotkey: "✦⌘x", action: "Special action (Kitty only)", mode: "normal" as const },
  { hotkey: "q", action: "Quit", mode: "normal" as const },
]

const ITEMS = ["Inbox", "Today", "Upcoming", "Projects", "Archive", "Trash"]

function FullInputDemo({ kittySupported }: { kittySupported: boolean }): JSX.Element {
  const { exit } = useApp()
  const { stdin } = useStdin()
  const [mode, setMode] = useState<Mode>("normal")
  const [cursor, setCursor] = useState(0)
  const [events, setEvents] = useState<EventEntry[]>([])
  const [insertText, setInsertText] = useState("")
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)
  const counterRef = useRef(0)

  // Enable mouse tracking
  useEffect(() => {
    process.stdout.write(enableMouse())
    return () => {
      process.stdout.write(disableMouse())
    }
  }, [])

  function addEvent(type: "key" | "mouse", summary: string, color?: string) {
    counterRef.current++
    setEvents((prev) => [
      ...prev.slice(-18),
      { index: counterRef.current, type, summary, color },
    ])
  }

  // Listen to raw stdin for mouse events + Kitty key details
  useEffect(() => {
    const onData = (data: Buffer) => {
      const raw = data.toString()

      if (isMouseSequence(raw)) {
        const parsed = parseMouseSequence(raw)
        if (!parsed) return

        setMousePos({ x: parsed.x, y: parsed.y })

        const mods: string[] = []
        if (parsed.ctrl) mods.push("⌃")
        if (parsed.shift) mods.push("⇧")
        if (parsed.meta) mods.push("⌥")
        const modStr = mods.length > 0 ? mods.join("") + " " : ""

        if (parsed.action === "down") {
          const btn = ["Left", "Middle", "Right"][parsed.button] ?? `Btn${parsed.button}`
          addEvent("mouse", `${modStr}${btn} click at (${parsed.x},${parsed.y})`, "blue")
        } else if (parsed.action === "wheel") {
          addEvent("mouse", `${modStr}Scroll ${parsed.delta! < 0 ? "up" : "down"} at (${parsed.x},${parsed.y})`, "magenta")
        }
      }
    }

    stdin.on("data", onData)
    return () => {
      stdin.off("data", onData)
    }
  }, [stdin])

  useInput((input: string, key: Key) => {
    // Always: Ctrl+C or q (in normal mode) to quit
    if (key.ctrl && input === "c") {
      addEvent("key", "⌃C  Quit", "red")
      exit()
      return
    }

    if (mode === "normal") {
      if (input === "q") {
        addEvent("key", "q  Quit", "red")
        exit()
        return
      }
      if (input === "i") {
        setMode("insert")
        setInsertText("")
        addEvent("key", "i  Enter insert mode", "green")
        return
      }
      if (input === "j" || key.downArrow) {
        setCursor((c) => Math.min(c + 1, ITEMS.length - 1))
        addEvent("key", `${input === "j" ? "j" : "Arrow"}  Move down`)
        return
      }
      if (input === "k" || key.upArrow) {
        setCursor((c) => Math.max(c - 1, 0))
        addEvent("key", `${input === "k" ? "k" : "Arrow"}  Move up`)
        return
      }
      if (input === "J" && key.shift) {
        addEvent("key", "⇧J  Move item down", "yellow")
        return
      }
      if (input === "K" && key.shift) {
        addEvent("key", "⇧K  Move item up", "yellow")
        return
      }
      // Kitty-only: Super modifier
      if (key.super && input === "s") {
        addEvent("key", "⌘S  Save", "green")
        return
      }
      if (key.hyper && key.super && input === "x") {
        addEvent("key", "✦⌘X  Special action!", "magenta")
        return
      }

      // Log unhandled keys
      if (input && input >= " ") {
        addEvent("key", `${input}  (unbound)`, "gray")
      }
    } else if (mode === "insert") {
      if (key.escape) {
        setMode("normal")
        addEvent("key", "Esc  Normal mode", "green")
        return
      }
      if (key.backspace) {
        setInsertText((t) => t.slice(0, -1))
        addEvent("key", "Backspace", "gray")
        return
      }
      if (input && input >= " ") {
        setInsertText((t) => t + input)
        addEvent("key", `'${input}'`, "gray")
        return
      }
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      {/* Top bar */}
      <Box gap={2} marginBottom={1}>
        <Text>
          <Text bold>Mode:</Text>{" "}
          <Text color={mode === "normal" ? "cyan" : "green"} bold>
            {mode.toUpperCase()}
          </Text>
        </Text>
        <Text>
          <Text bold>Kitty:</Text>{" "}
          {kittySupported ? <Text color="green">yes</Text> : <Text color="yellow">no</Text>}
        </Text>
        {mousePos && (
          <Text>
            <Text bold>Mouse:</Text> ({mousePos.x},{mousePos.y})
          </Text>
        )}
      </Box>

      <Box gap={2}>
        {/* Left: List + keybindings */}
        <Box flexDirection="column" width={35}>
          {/* Interactive list */}
          <Text bold color="cyan">
            Items
          </Text>
          <Box flexDirection="column" marginTop={1}>
            {ITEMS.map((item, i) => (
              <Text key={i}>
                <Text color={i === cursor ? "cyan" : "white"} bold={i === cursor}>
                  {i === cursor ? ">" : " "} {item}
                </Text>
              </Text>
            ))}
          </Box>

          {/* Insert mode text */}
          {mode === "insert" && (
            <Box marginTop={1} borderStyle="single" borderColor="green" paddingX={1}>
              <Text>
                <Text bold color="green">
                  Input:
                </Text>{" "}
                {insertText}
                <Text color="green">|</Text>
              </Text>
            </Box>
          )}

          {/* Keybinding reference */}
          <Box flexDirection="column" marginTop={1}>
            <Text bold dim>
              Keybindings
            </Text>
            {KEYBINDINGS.filter(
              (kb) => kb.mode === "both" || kb.mode === mode,
            ).map((kb, i) => {
              const parsed = parseHotkey(kb.hotkey)
              const hotkeyDisplay = formatHotkey(kb.hotkey, parsed)
              const needsKitty = kb.hotkey.includes("⌘") || kb.hotkey.includes("✦")
              return (
                <Text key={i} dimColor={needsKitty && !kittySupported}>
                  <Text bold color="yellow">
                    {hotkeyDisplay.padEnd(10)}
                  </Text>{" "}
                  {kb.action}
                  {needsKitty && !kittySupported ? <Text dim> (needs Kitty)</Text> : ""}
                </Text>
              )
            })}
          </Box>
        </Box>

        {/* Right: Event log */}
        <Box flexDirection="column" width={45}>
          <Text bold color="cyan">
            All Events ({counterRef.current})
          </Text>
          <Box height={1} />
          {events.length === 0 ? (
            <Text dim>Interact to see events...</Text>
          ) : (
            events.map((e, i) => (
              <Text key={i} dimColor={i < events.length - 1}>
                <Text color={e.type === "key" ? "cyan" : "blue"}>
                  {e.type === "key" ? "KEY" : "PTR"}
                </Text>{" "}
                <Text color={(e.color ?? "white") as any}>{e.summary}</Text>
              </Text>
            ))
          )}
        </Box>
      </Box>
    </Box>
  )
}

function formatHotkey(
  raw: string,
  parsed: ReturnType<typeof parseHotkey>,
): string {
  // Use the raw string if it already uses symbols
  if (/[⌘⌥⌃⇧✦]/.test(raw)) return raw
  // Otherwise build from parsed
  const parts: string[] = []
  if (parsed.ctrl) parts.push("⌃")
  if (parsed.shift) parts.push("⇧")
  if (parsed.alt) parts.push("⌥")
  if (parsed.super) parts.push("⌘")
  if (parsed.hyper) parts.push("✦")
  parts.push(parsed.key)
  return parts.join("")
}

async function main() {
  // Detect Kitty support
  const kittyResult = await detectKittyFromStdio(process.stdout, process.stdin)

  // Enable Kitty with full flags if supported
  if (kittyResult.supported) {
    const flags =
      KittyFlags.DISAMBIGUATE |
      KittyFlags.REPORT_EVENTS |
      KittyFlags.REPORT_ALTERNATE |
      KittyFlags.REPORT_ALL_KEYS |
      KittyFlags.REPORT_TEXT
    process.stdout.write(enableKittyKeyboard(flags))
  }

  using term = createTerm()
  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="i insert  Esc normal  j/k navigate  q quit">
      <FullInputDemo kittySupported={kittyResult.supported} />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()

  // Cleanup
  if (kittyResult.supported) {
    process.stdout.write(disableKittyKeyboard())
  }
}

if (import.meta.main) {
  main().catch(console.error)
}
