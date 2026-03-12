/**
 * Terminal Kitchensink
 *
 * A tabbed demo showcasing terminal interaction capabilities:
 * keyboard events, mouse tracking, clipboard (OSC 52), and
 * terminal focus detection.
 *
 * Features:
 * - Key event tester with color-coded modifier badges
 * - Mouse position tracking, button state, scroll events
 * - OSC 52 clipboard copy/paste
 * - Terminal focus/blur tracking with event log
 * - Kitty keyboard protocol auto-detection
 *
 * Run: bun vendor/silvery/examples/interactive/terminal.tsx
 */

import React, { useState, useRef, useEffect } from "react"
import {
  render,
  Box,
  Text,
  H2,
  Muted,
  Small,
  Kbd,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  useInput,
  useApp,
  useStdout,
  createTerm,
  parseKeypress,
  copyToClipboard,
  requestClipboard,
  parseClipboardResponse,
  enableMouse,
  disableMouse,
  isMouseSequence,
  parseMouseSequence,
  KittyFlags,
  enableKittyKeyboard,
  disableKittyKeyboard,
  detectKittyFromStdio,
  enableFocusReporting,
  disableFocusReporting,
  parseFocusEvent,
  type Key,
  type ParsedKeypress,
} from "../../src/index.js"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Terminal",
  description: "Keyboard, mouse, clipboard, focus, and terminal capabilities",
  demo: true,
  features: ["useInput", "useMouse", "clipboard", "focus", "Kitty protocol"],
}

// ============================================================================
// Types
// ============================================================================

interface KeyEvent {
  index: number
  input: string
  key: Key
  parsed: ParsedKeypress
  raw: string
}

interface MouseLogEntry {
  index: number
  action: string
  button: string
  x: number
  y: number
  mods: string
  timestamp: string
}

interface FocusEvent {
  index: number
  focused: boolean
  timestamp: string
}

/** Modifier definition with display name, symbol, and color */
interface ModDef {
  symbol: string
  label: string
  color: string
}

const MODIFIER_DEFS: ModDef[] = [
  { symbol: "\u2303", label: "Ctrl", color: "$color1" },
  { symbol: "\u21E7", label: "Shift", color: "$color3" },
  { symbol: "\u2325", label: "Alt", color: "$color4" },
  { symbol: "\u2318", label: "Super", color: "$color2" },
  { symbol: "\u2726", label: "Hyper", color: "$color5" },
]

// ============================================================================
// Shared utilities
// ============================================================================

function now(): string {
  const d = new Date()
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`
}

// ============================================================================
// Keys Tab
// ============================================================================

function KeysTab({ kittySupported }: { kittySupported: boolean }): JSX.Element {
  const [events, setEvents] = useState<KeyEvent[]>([])
  const [latest, setLatest] = useState<KeyEvent | null>(null)
  const counterRef = useRef(0)
  const stdin = process.stdin

  useEffect(() => {
    const onData = (data: Buffer) => {
      const raw = data.toString()
      if (raw.startsWith("\x1b[<")) return // skip mouse
      if (raw.startsWith("\x1b[I") || raw.startsWith("\x1b[O")) return // skip focus

      const parsed = parseKeypress(raw)
      // Don't log quit/tab-switch keys
      if (parsed.name === "escape") return
      if (raw === "q" && !parsed.ctrl && !parsed.meta) return
      if (parsed.name === "left" || parsed.name === "right") return
      if (raw === "h" || raw === "l") return

      counterRef.current++
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
      const input = parsed.name.length === 1 ? parsed.name : ""
      const event: KeyEvent = { index: counterRef.current, input, key, parsed, raw }
      setLatest(event)
      setEvents((prev) => [...prev.slice(-11), event])
    }

    stdin.on("data", onData)
    return () => {
      stdin.off("data", onData)
    }
  }, [stdin])

  return (
    <Box gap={3} paddingX={1} paddingTop={1}>
      {/* Left: Current key details */}
      <Box flexDirection="column" width={46}>
        <H2>Last Key Pressed</H2>
        <Box height={1} />
        {latest ? <KeyDetails event={latest} /> : <KeyPlaceholder kittySupported={kittySupported} />}
      </Box>

      {/* Right: Event log */}
      <Box flexDirection="column" flexGrow={1}>
        <H2>
          Event Log{" "}
          <Small>
            ({counterRef.current} {counterRef.current === 1 ? "event" : "events"})
          </Small>
        </H2>
        <Box height={1} />
        {events.length === 0 ? (
          <Muted>Waiting for input...</Muted>
        ) : (
          <Box flexDirection="column" overflow="scroll" scrollTo={events.length - 1}>
            {events.map((e, i) => (
              <Text key={e.index} dimColor={i < events.length - 1}>
                <Text color="$muted">#{String(e.index).padStart(3)}</Text> {formatKeyEventSummary(e)}
              </Text>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}

function KeyPlaceholder({ kittySupported }: { kittySupported: boolean }): JSX.Element {
  return (
    <Box flexDirection="column">
      <Text>Try pressing some key combinations:</Text>
      <Box height={1} />
      <Text> Ctrl+A, Shift+Tab, Alt+Enter...</Text>
      {kittySupported && <Text> Cmd+S, Hyper+X (Kitty-only)</Text>}
      <Box height={1} />
      <Muted>Each keypress shows its full breakdown here.</Muted>
    </Box>
  )
}

function KeyDetails({ event }: { event: KeyEvent }): JSX.Element {
  const { parsed, raw } = event
  const modActive: boolean[] = [parsed.ctrl, parsed.shift, parsed.meta || parsed.option, parsed.super, parsed.hyper]

  return (
    <Box flexDirection="column">
      <Text>
        <Text bold>Name:</Text>{" "}
        <Text bold color="$primary">
          {parsed.name || "(none)"}
        </Text>
      </Text>
      <Text>
        <Text bold>Input:</Text> {JSON.stringify(event.input)}
      </Text>

      {/* Modifier badges */}
      <Box marginTop={1} gap={1}>
        {MODIFIER_DEFS.map((mod, i) => (
          <ModBadge key={mod.symbol} mod={mod} active={modActive[i]!} />
        ))}
      </Box>

      {/* Event type (Kitty-only) */}
      {parsed.eventType && (
        <Box marginTop={1}>
          <Text>
            <Text bold>Event type:</Text> <Text color="$accent">{parsed.eventType}</Text>
          </Text>
        </Box>
      )}

      {/* Kitty extensions */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold color="$muted">
          Kitty Extensions
        </Text>
        <KittyField label="shiftedKey" value={parsed.shiftedKey} />
        <KittyField label="baseLayoutKey" value={parsed.baseLayoutKey} />
        <KittyField label="associatedText" value={parsed.associatedText} />
        <KittyField label="capsLock" value={parsed.capsLock} />
        <KittyField label="numLock" value={parsed.numLock} />
      </Box>

      {/* Raw sequence */}
      <Box marginTop={1}>
        <Text>
          <Text bold>Raw:</Text>{" "}
          <Muted>
            {[...raw]
              .map((c) =>
                c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127
                  ? `\\x${c.charCodeAt(0).toString(16).padStart(2, "0")}`
                  : c,
              )
              .join("")}
          </Muted>
        </Text>
      </Box>
    </Box>
  )
}

function ModBadge({ mod, active }: { mod: ModDef; active: boolean }): JSX.Element {
  if (active) {
    return (
      <Text backgroundColor={mod.color} color="$inversebg" bold>
        {` ${mod.symbol} ${mod.label} `}
      </Text>
    )
  }
  return <Text color="$muted">{`  ${mod.symbol}  `}</Text>
}

function KittyField({ label, value }: { label: string; value: string | boolean | undefined }): JSX.Element {
  if (value === undefined) {
    return (
      <Muted>
        {label}: {"--"}
      </Muted>
    )
  }
  return (
    <Text>
      {label}: <Text color="$warning">{String(value)}</Text>
    </Text>
  )
}

function formatKeyEventSummary(event: KeyEvent): string {
  const parts: string[] = []
  const { parsed } = event
  if (parsed.ctrl) parts.push("\u2303")
  if (parsed.shift) parts.push("\u21E7")
  if (parsed.meta || parsed.option) parts.push("\u2325")
  if (parsed.super) parts.push("\u2318")
  if (parsed.hyper) parts.push("\u2726")
  parts.push(parsed.name || JSON.stringify(event.input))
  if (parsed.eventType) parts.push(` (${parsed.eventType})`)
  return parts.join("")
}

// ============================================================================
// Mouse Tab
// ============================================================================

function MouseTab(): JSX.Element {
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)
  const [events, setEvents] = useState<MouseLogEntry[]>([])
  const [clicks, setClicks] = useState({ left: 0, middle: 0, right: 0 })
  const [scrollTotal, setScrollTotal] = useState(0)
  const counterRef = useRef(0)
  const stdin = process.stdin

  useEffect(() => {
    const onData = (data: Buffer) => {
      const raw = data.toString()
      if (!isMouseSequence(raw)) return

      const parsed = parseMouseSequence(raw)
      if (!parsed) return

      setMousePos({ x: parsed.x, y: parsed.y })

      const mods: string[] = []
      if (parsed.ctrl) mods.push("Ctrl")
      if (parsed.shift) mods.push("Shift")
      if (parsed.meta) mods.push("Alt")
      const modStr = mods.join("+")

      if (parsed.action === "down") {
        const btn = ["Left", "Middle", "Right"][parsed.button] ?? `Btn${parsed.button}`
        counterRef.current++
        setEvents((prev) => [
          ...prev.slice(-11),
          {
            index: counterRef.current,
            action: "click",
            button: btn,
            x: parsed.x,
            y: parsed.y,
            mods: modStr,
            timestamp: now(),
          },
        ])
        if (parsed.button === 0) setClicks((c) => ({ ...c, left: c.left + 1 }))
        else if (parsed.button === 1) setClicks((c) => ({ ...c, middle: c.middle + 1 }))
        else if (parsed.button === 2) setClicks((c) => ({ ...c, right: c.right + 1 }))
      } else if (parsed.action === "wheel") {
        counterRef.current++
        const dir = parsed.delta! < 0 ? "up" : "down"
        setEvents((prev) => [
          ...prev.slice(-11),
          {
            index: counterRef.current,
            action: `scroll ${dir}`,
            button: "wheel",
            x: parsed.x,
            y: parsed.y,
            mods: modStr,
            timestamp: now(),
          },
        ])
        setScrollTotal((s) => s + 1)
      } else if (parsed.action === "move") {
        // Just update position, don't flood the log
      }
    }

    stdin.on("data", onData)
    return () => {
      stdin.off("data", onData)
    }
  }, [stdin])

  return (
    <Box gap={3} paddingX={1} paddingTop={1}>
      {/* Left: Position + stats */}
      <Box flexDirection="column" width={36}>
        <H2>Position</H2>
        <Box marginTop={1}>
          {mousePos ? (
            <Box flexDirection="column">
              <Text>
                <Text bold>X:</Text>{" "}
                <Text color="$primary" bold>
                  {String(mousePos.x).padStart(4)}
                </Text>
              </Text>
              <Text>
                <Text bold>Y:</Text>{" "}
                <Text color="$primary" bold>
                  {String(mousePos.y).padStart(4)}
                </Text>
              </Text>
            </Box>
          ) : (
            <Muted>Move mouse to track position</Muted>
          )}
        </Box>

        <Box marginTop={1} flexDirection="column">
          <H2>Click Counts</H2>
          <Box marginTop={1} flexDirection="column">
            <Text>
              <Text bold>Left:</Text> <Text color="$info">{clicks.left}</Text>
            </Text>
            <Text>
              <Text bold>Middle:</Text> <Text color="$info">{clicks.middle}</Text>
            </Text>
            <Text>
              <Text bold>Right:</Text> <Text color="$info">{clicks.right}</Text>
            </Text>
            <Text>
              <Text bold>Scroll:</Text> <Text color="$info">{scrollTotal}</Text>
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Right: Event log */}
      <Box flexDirection="column" flexGrow={1}>
        <H2>
          Mouse Events <Small>({counterRef.current})</Small>
        </H2>
        <Box height={1} />
        {events.length === 0 ? (
          <Muted>Click or scroll to see events...</Muted>
        ) : (
          <Box flexDirection="column" overflow="scroll" scrollTo={events.length - 1}>
            {events.map((e, i) => (
              <Text key={e.index} dimColor={i < events.length - 1}>
                <Small>{e.timestamp}</Small>{" "}
                <Text color={e.action.startsWith("scroll") ? "$accent" : "$primary"} bold>
                  {e.action}
                </Text>{" "}
                {e.button !== "wheel" && <Text>{e.button} </Text>}
                <Muted>
                  ({e.x},{e.y})
                </Muted>
                {e.mods ? <Text color="$warning"> +{e.mods}</Text> : null}
              </Text>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}

// ============================================================================
// Clipboard Tab
// ============================================================================

function ClipboardTab(): JSX.Element {
  const { stdout } = useStdout()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [lastCopied, setLastCopied] = useState<string | null>(null)
  const [lastPasted, setLastPasted] = useState<string | null>(null)
  const [history, setHistory] = useState<Array<{ action: string; text: string; time: string }>>([])

  const snippets = [
    "Hello, world!",
    "The quick brown fox jumps over the lazy dog",
    "OSC 52 clipboard protocol",
    "npx silvery examples",
    "console.log('silvery')",
    "https://silvery.dev",
  ]

  useInput((input: string, key: Key) => {
    // Navigation
    if (key.upArrow || input === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1))
    }
    if (key.downArrow || input === "j") {
      setSelectedIndex((i) => Math.min(snippets.length - 1, i + 1))
    }

    // Copy selected item
    if (input === "c") {
      const text = snippets[selectedIndex]!
      copyToClipboard(stdout, text)
      setLastCopied(text)
      setHistory((h) => [...h.slice(-7), { action: "copy", text, time: now() }])
    }

    // Request clipboard
    if (input === "v") {
      requestClipboard(stdout)
      setHistory((h) => [...h.slice(-7), { action: "request", text: "(paste requested)", time: now() }])
    }

    // Parse clipboard response from raw input
    const parsed = parseClipboardResponse(input)
    if (parsed) {
      setLastPasted(parsed)
      setHistory((h) => [...h.slice(-7), { action: "paste", text: parsed, time: now() }])
    }
  })

  return (
    <Box flexDirection="column" paddingX={1} paddingTop={1} gap={1}>
      {/* Snippet list */}
      <Box flexDirection="column">
        <H2>
          Snippets{" "}
          <Small>
            {selectedIndex + 1}/{snippets.length}
          </Small>
        </H2>
        <Box flexDirection="column" marginTop={1} overflow="scroll" scrollTo={selectedIndex}>
          {snippets.map((text, i) => (
            <Box key={i} paddingX={1}>
              <Text
                color={i === selectedIndex ? "$bg" : undefined}
                backgroundColor={i === selectedIndex ? "$primary" : undefined}
                bold={i === selectedIndex}
              >
                {i === selectedIndex ? " > " : "   "}
                {text}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Status */}
      <Box gap={4}>
        <Box flexDirection="column">
          <Text bold>Last Copied:</Text>
          {lastCopied ? (
            <Text color="$success">
              {"✓ "}
              {lastCopied}
            </Text>
          ) : (
            <Muted>nothing</Muted>
          )}
        </Box>
        <Box flexDirection="column">
          <Text bold>Last Pasted:</Text>
          {lastPasted ? <Text color="$warning">{lastPasted}</Text> : <Muted>nothing</Muted>}
        </Box>
      </Box>

      {/* History */}
      {history.length > 0 && (
        <Box flexDirection="column">
          <H2>History</H2>
          <Box flexDirection="column" overflow="scroll" scrollTo={history.length - 1}>
            {history.map((h, i) => (
              <Text key={i} dimColor={i < history.length - 1}>
                <Small>{h.time}</Small>{" "}
                <Text color={h.action === "copy" ? "$success" : h.action === "paste" ? "$warning" : "$muted"} bold>
                  {h.action}
                </Text>{" "}
                <Text>{h.text.length > 40 ? h.text.slice(0, 37) + "..." : h.text}</Text>
              </Text>
            ))}
          </Box>
        </Box>
      )}

      <Muted>
        <Kbd>j/k</Kbd> navigate <Kbd>c</Kbd> copy <Kbd>v</Kbd> paste (OSC 52)
      </Muted>
    </Box>
  )
}

// ============================================================================
// Focus Tab
// ============================================================================

function FocusTab(): JSX.Element {
  const [focused, setFocused] = useState(true)
  const [events, setEvents] = useState<FocusEvent[]>([])
  const counterRef = useRef(0)
  const stdin = process.stdin

  // Parse focus events directly from stdin (CSI I / CSI O)
  useEffect(() => {
    const onData = (data: Buffer) => {
      const raw = data.toString()
      const focusEvt = parseFocusEvent(raw)
      if (!focusEvt) return

      const isFocused = focusEvt.type === "focus-in"
      setFocused(isFocused)
      counterRef.current++
      setEvents((prev) => [
        ...prev.slice(-14),
        {
          index: counterRef.current,
          focused: isFocused,
          timestamp: now(),
        },
      ])
    }

    stdin.on("data", onData)
    return () => {
      stdin.off("data", onData)
    }
  }, [stdin])

  return (
    <Box gap={3} paddingX={1} paddingTop={1}>
      {/* Left: Focus indicator */}
      <Box flexDirection="column" width={36}>
        <H2>Terminal Focus</H2>
        <Box marginTop={1} flexDirection="column" alignItems="center" gap={1}>
          <Text bold color={focused ? "$success" : "$error"}>
            {focused ? "  FOCUSED  " : " UNFOCUSED "}
          </Text>
          <Text color={focused ? "$success" : "$error"}>
            {focused ? "Terminal window is active" : "Terminal window lost focus"}
          </Text>
        </Box>

        <Box marginTop={2} flexDirection="column">
          <Muted>
            Switch to another window and back to see focus events. Uses CSI I/O terminal focus reporting protocol.
          </Muted>
        </Box>

        <Box marginTop={1}>
          <Text>
            <Text bold>Protocol:</Text> <Text color="$info">CSI ?1004h (DECRPM focus events)</Text>
          </Text>
        </Box>
      </Box>

      {/* Right: Event log */}
      <Box flexDirection="column" flexGrow={1}>
        <H2>
          Focus Events <Small>({counterRef.current})</Small>
        </H2>
        <Box height={1} />
        {events.length === 0 ? (
          <Muted>Switch windows to generate focus events...</Muted>
        ) : (
          <Box flexDirection="column" overflow="scroll" scrollTo={events.length - 1}>
            {events.map((e, i) => (
              <Text key={e.index} dimColor={i < events.length - 1}>
                <Small>{e.timestamp}</Small>{" "}
                <Text color={e.focused ? "$success" : "$error"} bold>
                  {e.focused ? "focus-in " : "focus-out"}
                </Text>{" "}
                <Text color={e.focused ? "$success" : "$error"}>
                  {e.focused ? "Terminal gained focus" : "Terminal lost focus"}
                </Text>
              </Text>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}

// ============================================================================
// Main App
// ============================================================================

function TerminalDemo({ kittySupported }: { kittySupported: boolean }): JSX.Element {
  const { exit } = useApp()

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) {
      exit()
    }
  })

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Status bar */}
      <Box paddingX={1} gap={2}>
        <Text>
          <Text bold>Kitty:</Text>{" "}
          {kittySupported ? <Text color="$success">enabled</Text> : <Text color="$warning">legacy mode</Text>}
        </Text>
      </Box>

      {/* Tabbed content */}
      <Tabs defaultValue="keys">
        <TabList>
          <Tab value="keys">Keys</Tab>
          <Tab value="mouse">Mouse</Tab>
          <Tab value="clipboard">Clipboard</Tab>
          <Tab value="focus">Focus</Tab>
        </TabList>

        <TabPanel value="keys">
          <KeysTab kittySupported={kittySupported} />
        </TabPanel>

        <TabPanel value="mouse">
          <MouseTab />
        </TabPanel>

        <TabPanel value="clipboard">
          <ClipboardTab />
        </TabPanel>

        <TabPanel value="focus">
          <FocusTab />
        </TabPanel>
      </Tabs>

      <Box paddingX={1}>
        <Muted>
          <Kbd>h/l</Kbd> switch tabs <Kbd>Esc/q</Kbd> quit
        </Muted>
      </Box>
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

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

  // Enable mouse tracking and focus reporting
  process.stdout.write(enableMouse())
  enableFocusReporting((s) => process.stdout.write(s))

  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="h/l tabs  Esc/q quit">
      <TerminalDemo kittySupported={kittyResult.supported} />
    </ExampleBanner>,
    term,
  )

  await waitUntilExit()

  // Cleanup
  process.stdout.write(disableMouse())
  disableFocusReporting((s) => process.stdout.write(s))
  if (kittyResult.supported) {
    process.stdout.write(disableKittyKeyboard())
  }
}

export { main }

if (import.meta.main) {
  main().catch((err) => {
    const stdout = process.stdout
    stdout.write(disableMouse())
    disableFocusReporting((s) => stdout.write(s))
    stdout.write("\x1b[?25h")
    stdout.write("\x1b[?1049l")
    stdout.write("\x1b[0m")
    if (process.stdin.isTTY && process.stdin.isRaw) {
      try {
        process.stdin.setRawMode(false)
      } catch {}
    }
    console.error(err)
    process.exit(1)
  })
}
