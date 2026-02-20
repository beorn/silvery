/**
 * Kitty Keyboard Inspector
 *
 * Shows all key properties in real-time as you press keys.
 * Demonstrates Kitty protocol extensions and macOS modifier symbols.
 *
 * Features:
 * - Legacy vs Kitty parsing differences
 * - All modifier fields (ctrl, alt, shift, super, hyper, capsLock, numLock)
 * - Event types (press/repeat/release)
 * - shiftedKey, baseLayoutKey, associatedText
 * - macOS symbols in the display (⌘ ⌥ ⌃ ⇧ ✦)
 * - Kitty auto-detection on startup
 *
 * Run: bun vendor/beorn-inkx/examples/kitty-inspector.tsx
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
  name: "Kitty Keyboard Inspector",
  description: "Real-time key event inspector with Kitty protocol support",
  features: ["parseKeypress()", "detectKittySupport()", "⌘ ⌥ ⌃ ⇧ ✦ symbols", "KittyFlags"],
}

const EVENT_TYPES: Record<number, string> = {
  1: "press",
  2: "repeat",
  3: "release",
}

interface KeyEvent {
  index: number
  input: string
  key: Key
  parsed: ParsedKeypress
  raw: string
}

function KittyInspector({ kittySupported }: { kittySupported: boolean }): JSX.Element {
  const { exit } = useApp()
  const [events, setEvents] = useState<KeyEvent[]>([])
  const [latest, setLatest] = useState<KeyEvent | null>(null)
  const counterRef = useRef(0)
  const { stdin } = useStdin()

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
      setEvents((prev) => [...prev.slice(-12), event])
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
            Current Key
          </Text>
          <Box height={1} />
          {latest ? (
            <KeyDetails event={latest} />
          ) : (
            <Text dim>Press any key to inspect...</Text>
          )}
        </Box>

        {/* Right panel: Event log */}
        <Box flexDirection="column" width={40}>
          <Text bold color="cyan">
            Event Log ({counterRef.current} total)
          </Text>
          <Box height={1} />
          {events.length === 0 ? (
            <Text dim>No events yet</Text>
          ) : (
            events.map((e, i) => (
              <Text key={i} dimColor={i < events.length - 1}>
                #{e.index} {formatEventSummary(e)}
              </Text>
            ))
          )}
        </Box>
      </Box>
    </Box>
  )
}

function KeyDetails({ event }: { event: KeyEvent }): JSX.Element {
  const { parsed, raw } = event

  // Active modifiers
  const modifiers: string[] = []
  if (parsed.ctrl) modifiers.push("⌃ Ctrl")
  if (parsed.shift) modifiers.push("⇧ Shift")
  if (parsed.meta || parsed.option) modifiers.push("⌥ Alt/Opt")
  if (parsed.super) modifiers.push("⌘ Cmd/Super")
  if (parsed.hyper) modifiers.push("✦ Hyper")

  return (
    <Box flexDirection="column">
      <Text>
        <Text bold>Name:</Text> {parsed.name || "(none)"}
      </Text>
      <Text>
        <Text bold>Input:</Text> {JSON.stringify(event.input)}
      </Text>
      <Text>
        <Text bold>Modifiers:</Text>{" "}
        {modifiers.length > 0 ? modifiers.join("  ") : <Text dim>none</Text>}
      </Text>

      {/* Modifier grid */}
      <Box marginTop={1}>
        <Box gap={2}>
          <ModFlag label="⌃" active={parsed.ctrl} />
          <ModFlag label="⇧" active={parsed.shift} />
          <ModFlag label="⌥" active={parsed.meta || parsed.option} />
          <ModFlag label="⌘" active={parsed.super} />
          <ModFlag label="✦" active={parsed.hyper} />
        </Box>
      </Box>

      {/* Event type (Kitty-only) */}
      {parsed.eventType && (
        <Box marginTop={1}>
          <Text>
            <Text bold>Event type:</Text>{" "}
            <Text color="magenta">{EVENT_TYPES[parsed.eventType] ?? String(parsed.eventType)}</Text>
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
            {[...raw].map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? `\\x${c.charCodeAt(0).toString(16).padStart(2, "0")}` : c)).join("")}
          </Text>
        </Text>
      </Box>
      <Text>
        <Text bold>Sequence:</Text> <Text dim>{JSON.stringify(parsed.sequence)}</Text>
      </Text>
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

function KeyField({ label, value }: { label: string; value: string | boolean | undefined }): JSX.Element {
  if (value === undefined) {
    return (
      <Text dim>
        {label}: --
      </Text>
    )
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
  if (parsed.eventType) parts.push(`(${EVENT_TYPES[parsed.eventType]})`)
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
    eventType: parsed.eventType,
  }

  // For printable chars, input is the character itself
  const input = parsed.name.length === 1 ? parsed.name : ""
  return [input, key]
}

async function main() {
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
      <KittyInspector kittySupported={kittyResult.supported} />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()

  // Cleanup: disable Kitty protocol
  if (kittyResult.supported) {
    process.stdout.write(disableKittyKeyboard())
  }
}

main().catch(console.error)
