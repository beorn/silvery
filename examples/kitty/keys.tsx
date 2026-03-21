/**
 * Key Explorer
 *
 * Interactive key chord tester — press any key combination to see exactly
 * how the terminal reports it. Color-coded modifiers, live event log,
 * and a visual modifier dashboard make it easy to understand what your
 * terminal can do.
 *
 * Features:
 * - Legacy vs Kitty parsing differences
 * - All modifier fields (ctrl, alt, shift, super, hyper, capsLock, numLock)
 * - Event types (press/repeat/release)
 * - shiftedKey, baseLayoutKey, associatedText
 * - macOS symbols in the display (⌘ ⌥ ⌃ ⇧ ✦)
 * - Kitty auto-detection on startup
 *
 * Run: bun vendor/silvery/examples/kitty/key-explorer.tsx
 */

import React, { useState, useRef, useEffect } from "react"
import {
  render,
  Box,
  Text,
  useInput,
  useApp,
  createTerm,
  parseKeypress,
  KittyFlags,
  enableKittyKeyboard,
  disableKittyKeyboard,
  detectKittyFromStdio,
  type Key,
  type ParsedKeypress,
} from "../../src/index.js"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Key Events",
  description: "Interactive key chord tester with color-coded modifiers",
  features: ["parseKeypress()", "detectKittySupport()", "⌘ ⌥ ⌃ ⇧ ✦ symbols", "KittyFlags"],
}

// eventType is already a string ("press" | "repeat" | "release")

interface KeyEvent {
  index: number
  input: string
  key: Key
  parsed: ParsedKeypress
  raw: string
}

/** Modifier definition with display name, symbol, and color */
interface ModDef {
  symbol: string
  label: string
  color: string
}

const MODIFIER_DEFS: ModDef[] = [
  { symbol: "⌃", label: "Ctrl", color: "red" },
  { symbol: "⇧", label: "Shift", color: "yellow" },
  { symbol: "⌥", label: "Alt", color: "blue" },
  { symbol: "⌘", label: "Super", color: "green" },
  { symbol: "✦", label: "Hyper", color: "magenta" },
]

function KeyExplorer({ kittySupported }: { kittySupported: boolean }) {
  const { exit } = useApp()
  const [events, setEvents] = useState<KeyEvent[]>([])
  const [latest, setLatest] = useState<KeyEvent | null>(null)
  const counterRef = useRef(0)
  const stdin = process.stdin

  // Listen to raw stdin for full ParsedKeypress info
  useEffect(() => {
    const onData = (data: Buffer) => {
      const raw = data.toString()
      // Skip mouse sequences
      if (raw.startsWith("\x1b[<")) return

      const parsed = parseKeypress(raw)
      // Don't log the quit key
      if (parsed.name === "escape" || (raw === "q" && !parsed.ctrl && !parsed.meta)) return

      counterRef.current++
      const [input, key] = parseInputKey(raw)
      const event: KeyEvent = {
        index: counterRef.current,
        input,
        key,
        parsed,
        raw,
      }
      setLatest(event)
      setEvents((prev) => [...prev.slice(-14), event])
    }

    stdin.on("data", onData)
    return () => {
      stdin.off("data", onData)
    }
  }, [stdin])

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) {
      exit()
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      {/* Status bar */}
      <Box gap={2} marginBottom={1}>
        <Text>
          <Text bold color="cyan">
            Protocol:
          </Text>{" "}
          {kittySupported ? (
            <Text color="green">Kitty keyboard enabled</Text>
          ) : (
            <Text color="yellow">Legacy mode (terminal does not support Kitty)</Text>
          )}
        </Text>
      </Box>

      <Box gap={4}>
        {/* Left panel: Current key details */}
        <Box flexDirection="column" width={50}>
          <Text bold color="cyan">
            Last Key Pressed
          </Text>
          <Box height={1} />
          {latest ? (
            <KeyDetails event={latest} />
          ) : (
            <Box flexDirection="column">
              <Text color="cyan">Try pressing some key combinations:</Text>
              <Box height={1} />
              <Text> Ctrl+A, Shift+Tab, Alt+Enter...</Text>
              {kittySupported && <Text> Cmd+S, Hyper+X (Kitty-only)</Text>}
              <Box height={1} />
              <Text dim>Each keypress shows its full breakdown here.</Text>
            </Box>
          )}
        </Box>

        {/* Right panel: Event log */}
        <Box flexDirection="column" width={42}>
          <Text bold color="cyan">
            Event Log
          </Text>
          <Text dim>
            {counterRef.current} {counterRef.current === 1 ? "event" : "events"} captured
          </Text>
          <Box height={1} />
          {events.length === 0 ? (
            <Text dim>Waiting for input...</Text>
          ) : (
            events.map((e, i) => (
              <Text key={i} dimColor={i < events.length - 1}>
                <Text dim>#{String(e.index).padStart(3)}</Text> {formatEventSummary(e)}
              </Text>
            ))
          )}
        </Box>
      </Box>
    </Box>
  )
}

function KeyDetails({ event }: { event: KeyEvent }) {
  const { parsed, raw } = event

  // Determine which modifiers are active
  const modActive: boolean[] = [parsed.ctrl, parsed.shift, parsed.meta || parsed.option, parsed.super, parsed.hyper]

  return (
    <Box flexDirection="column">
      {/* Key name - big and prominent */}
      <Text>
        <Text bold>Name:</Text>{" "}
        <Text bold color="white">
          {parsed.name || "(none)"}
        </Text>
      </Text>
      <Text>
        <Text bold>Input:</Text> {JSON.stringify(event.input)}
      </Text>

      {/* Color-coded modifier dashboard */}
      <Box marginTop={1}>
        <Box gap={1}>
          {MODIFIER_DEFS.map((mod, i) => (
            <ModBadge key={mod.symbol} mod={mod} active={modActive[i]!} />
          ))}
        </Box>
      </Box>

      {/* Event type (Kitty-only) */}
      {parsed.eventType && (
        <Box marginTop={1}>
          <Text>
            <Text bold>Event type:</Text> <Text color="magenta">{parsed.eventType}</Text>
          </Text>
        </Box>
      )}

      {/* Kitty-specific fields */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold dim>
          Kitty Extensions
        </Text>
        <KeyField label="shiftedKey" value={parsed.shiftedKey} />
        <KeyField label="baseLayoutKey" value={parsed.baseLayoutKey} />
        <KeyField label="associatedText" value={parsed.associatedText} />
        <KeyField label="capsLock" value={parsed.capsLock} />
        <KeyField label="numLock" value={parsed.numLock} />
      </Box>

      {/* Raw sequence */}
      <Box marginTop={1}>
        <Text>
          <Text bold>Raw:</Text>{" "}
          <Text dim>
            {[...raw]
              .map((c) =>
                c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127
                  ? `\\x${c.charCodeAt(0).toString(16).padStart(2, "0")}`
                  : c,
              )
              .join("")}
          </Text>
        </Text>
      </Box>
      <Text>
        <Text bold>Sequence:</Text> <Text dim>{JSON.stringify(parsed.sequence)}</Text>
      </Text>
    </Box>
  )
}

function ModBadge({ mod, active }: { mod: ModDef; active: boolean }) {
  if (active) {
    return (
      <Text backgroundColor={mod.color as any} color="white" bold>
        {` ${mod.symbol} ${mod.label} `}
      </Text>
    )
  }
  return (
    <Text dim color="gray">
      {`  ${mod.symbol}  `}
    </Text>
  )
}

function KeyField({ label, value }: { label: string; value: string | boolean | undefined }) {
  if (value === undefined) {
    return <Text dim>{label}: --</Text>
  }
  return (
    <Text>
      {label}: <Text color="yellow">{String(value)}</Text>
    </Text>
  )
}

function formatEventSummary(event: KeyEvent): string {
  const parts: string[] = []
  const { parsed } = event
  if (parsed.ctrl) parts.push("⌃")
  if (parsed.shift) parts.push("⇧")
  if (parsed.meta || parsed.option) parts.push("⌥")
  if (parsed.super) parts.push("⌘")
  if (parsed.hyper) parts.push("✦")
  parts.push(parsed.name || JSON.stringify(event.input))
  if (parsed.eventType) parts.push(`(${parsed.eventType})`)
  return parts.join("")
}

/** Parse raw input into [input, Key] using the same logic as the runtime */
function parseInputKey(raw: string): [string, Key] {
  const parsed = parseKeypress(raw)
  const key: Key = {
    upArrow: parsed.name === "up",
    downArrow: parsed.name === "down",
    leftArrow: parsed.name === "left",
    rightArrow: parsed.name === "right",
    pageDown: parsed.name === "pagedown",
    pageUp: parsed.name === "pageup",
    home: parsed.name === "home",
    end: parsed.name === "end",
    return: parsed.name === "return",
    escape: parsed.name === "escape",
    ctrl: parsed.ctrl,
    shift: parsed.shift,
    tab: parsed.name === "tab",
    backspace: parsed.name === "backspace",
    delete: parsed.name === "delete",
    meta: parsed.meta || parsed.option,
    super: parsed.super,
    hyper: parsed.hyper,
    capsLock: parsed.capsLock ?? false,
    numLock: parsed.numLock ?? false,
    eventType: parsed.eventType,
  }

  // For printable chars, input is the character itself
  const input = parsed.name.length === 1 ? parsed.name : ""
  return [input, key]
}

async function main() {
  const cleanup = () => {
    const stdout = process.stdout
    stdout.write("\x1b[?1003l\x1b[?1006l") // Disable mouse
    stdout.write("\x1b[?25h") // Show cursor
    stdout.write("\x1b[?1049l") // Exit alternate screen
    stdout.write("\x1b[0m") // Reset colors
    if (process.stdin.isTTY && process.stdin.isRaw) {
      try {
        process.stdin.setRawMode(false)
      } catch {}
    }
  }
  process.on("uncaughtException", (err) => {
    cleanup()
    throw err
  })

  // Detect Kitty support before starting the app
  const kittyResult = await detectKittyFromStdio(process.stdout, process.stdin)

  // Enable Kitty with all reporting flags if supported
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
    <ExampleBanner meta={meta} controls="q/Esc quit">
      <KeyExplorer kittySupported={kittyResult.supported} />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()

  // Cleanup: disable Kitty protocol
  if (kittyResult.supported) {
    process.stdout.write(disableKittyKeyboard())
  }
}

if (import.meta.main) {
  try {
    await main()
  } catch (err) {
    // Restore terminal on crash
    const stdout = process.stdout
    stdout.write("\x1b[?1003l\x1b[?1006l") // Disable mouse
    stdout.write("\x1b[?25h") // Show cursor
    stdout.write("\x1b[?1049l") // Exit alternate screen
    stdout.write("\x1b[0m") // Reset colors
    if (process.stdin.isTTY && process.stdin.isRaw) {
      try {
        process.stdin.setRawMode(false)
      } catch {}
    }
    console.error(err)
    process.exit(1)
  }
}
