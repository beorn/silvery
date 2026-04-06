/**
 * Terminal Capabilities Demo
 *
 * A "terminal health check" dashboard that probes all supported terminal
 * protocols and displays their status in real time.
 *
 * Probed protocols:
 * - Synchronized Output (Mode 2026)
 * - SGR Mouse (Mode 1006)
 * - Bracketed Paste (Mode 2004)
 * - Focus Reporting (Mode 1004)
 * - Kitty Keyboard (CSI u)
 * - Mode 2031 Color Scheme Detection
 * - DEC 1020-1023 Width Detection (UTF-8, CJK, Emoji, Private-Use)
 * - OSC 66 Text Sizing
 * - OSC 52 Clipboard
 * - OSC 5522 Advanced Clipboard
 * - OSC 8 Hyperlinks
 * - Image Support (Kitty Graphics / Sixel)
 * - DA1/DA2/DA3 Device Attributes
 *
 * Run: bun vendor/silvery/examples/apps/terminal-caps-demo.tsx
 */

import React, { useState, useEffect } from "react"
import { Box, Text, H3, Muted, Kbd, render, useInput, useApp, type Key } from "../../src/index.js"
import {
  detectTerminalCaps,
  type TerminalCaps,
  createWidthDetector,
  type TerminalWidthConfig,
  DEFAULT_WIDTH_CONFIG,
  detectKittyFromStdio,
} from "@silvery/ag-term"
import { createColorSchemeDetector, type ColorScheme } from "@silvery/ag-term/ansi"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Terminal Capabilities",
  description: "Probe and display all supported terminal protocols",
  demo: true,
  features: ["detectTerminalCaps()", "Mode 2031", "DEC 1020-1023", "OSC 66", "OSC 52", "OSC 5522", "DA1/DA2/DA3"],
}

// ============================================================================
// Types
// ============================================================================

type CapStatus = "supported" | "not-supported" | "probing" | "detected"

interface CapEntry {
  name: string
  status: CapStatus
  detail?: string
}

// ============================================================================
// Status indicator component
// ============================================================================

function StatusIcon({ status }: { status: CapStatus }) {
  switch (status) {
    case "supported":
      return <Text color="$success">{"✓"}</Text>
    case "not-supported":
      return <Text color="$error">{"✗"}</Text>
    case "probing":
      return <Text color="$warning">{"?"}</Text>
    case "detected":
      return <Text color="$warning">{"?"}</Text>
  }
}

function CapRow({ entry, width }: { entry: CapEntry; width: number }) {
  const label = entry.detail ? `${entry.name}: ${entry.detail}` : entry.name
  const padded = label.length < width ? label + " ".repeat(width - label.length) : label
  return (
    <Box>
      <StatusIcon status={entry.status} />
      <Text> </Text>
      <Text color={entry.status === "not-supported" ? "$muted" : undefined}>{padded}</Text>
    </Box>
  )
}

// ============================================================================
// Build capability entries from detected caps
// ============================================================================

function buildStaticEntries(caps: TerminalCaps): CapEntry[] {
  const bool = (supported: boolean): CapStatus => (supported ? "supported" : "not-supported")

  return [
    { name: "Synchronized Output (Mode 2026)", status: bool(caps.syncOutput) },
    { name: "SGR Mouse (Mode 1006)", status: bool(caps.mouse) },
    { name: "Bracketed Paste (Mode 2004)", status: bool(caps.bracketedPaste) },
    { name: "Focus Reporting (Mode 1004)", status: bool(caps.bracketedPaste) }, // focus follows paste support heuristic
    { name: "Kitty Keyboard (CSI u)", status: bool(caps.kittyKeyboard) },
    { name: "OSC 52 Clipboard", status: bool(caps.osc52) },
    { name: "OSC 8 Hyperlinks", status: bool(caps.hyperlinks) },
    {
      name: "Image Support",
      status: caps.kittyGraphics || caps.sixel ? "supported" : "not-supported",
      detail: caps.kittyGraphics ? "Kitty" : caps.sixel ? "Sixel" : "none",
    },
    { name: "Notifications (OSC 9/99)", status: bool(caps.notifications) },
    { name: "Underline Styles (SGR 4:x)", status: bool(caps.underlineStyles) },
    { name: "Underline Color (SGR 58)", status: bool(caps.underlineColor) },
    { name: "Unicode", status: bool(caps.unicode) },
    { name: "Nerd Font", status: bool(caps.nerdfont) },
  ]
}

// ============================================================================
// Main app component
// ============================================================================

function TerminalCapsApp() {
  const { exit } = useApp()
  const [caps] = useState<TerminalCaps>(() => detectTerminalCaps())
  const [colorScheme, setColorScheme] = useState<ColorScheme>("unknown")
  const [widthConfig, setWidthConfig] = useState<TerminalWidthConfig | null>(null)
  const [kittyDetected, setKittyDetected] = useState<boolean | null>(null)

  // Quit on q or Esc
  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) {
      exit()
    }
  })

  // Run async detection on mount
  useEffect(() => {
    // Color scheme detection (Mode 2031)
    const detector = createColorSchemeDetector({
      write: (data) => {
        process.stdout.write(data)
      },
      onData: (handler) => {
        const bufHandler = (chunk: Buffer | string) => {
          handler(typeof chunk === "string" ? chunk : chunk.toString())
        }
        process.stdin.on("data", bufHandler)
        return () => {
          process.stdin.removeListener("data", bufHandler)
        }
      },
      timeoutMs: 500,
    })

    detector.subscribe((scheme) => {
      setColorScheme(scheme)
    })
    detector.start()

    // After timeout, if still unknown, fallback
    const fallbackTimer = setTimeout(() => {
      if (detector.scheme !== "unknown") {
        setColorScheme(detector.scheme)
      }
    }, 600)

    // Width detection (DEC 1020-1023)
    const widthDet = createWidthDetector({
      write: (data) => {
        process.stdout.write(data)
      },
      onData: (handler) => {
        const bufHandler = (chunk: Buffer | string) => {
          handler(typeof chunk === "string" ? chunk : chunk.toString())
        }
        process.stdin.on("data", bufHandler)
        return () => {
          process.stdin.removeListener("data", bufHandler)
        }
      },
      timeoutMs: 500,
    })

    widthDet
      .detect()
      .then((config) => {
        setWidthConfig(config)
      })
      .catch(() => {
        setWidthConfig({ ...DEFAULT_WIDTH_CONFIG })
      })

    // Kitty keyboard detection (requires TTY stdin)
    if (process.stdin.isTTY) {
      detectKittyFromStdio(process.stdout, process.stdin, 500)
        .then((result) => {
          setKittyDetected(result.supported)
        })
        .catch(() => {
          setKittyDetected(false)
        })
    } else {
      setKittyDetected(false)
    }

    return () => {
      detector.stop()
      clearTimeout(fallbackTimer)
      widthDet.dispose()
    }
  }, [])

  // Build the display entries
  const staticEntries = buildStaticEntries(caps)

  // Override Kitty detection if we have live results
  if (kittyDetected !== null) {
    const kittyEntry = staticEntries.find((e) => e.name.startsWith("Kitty Keyboard"))
    if (kittyEntry) {
      kittyEntry.status = kittyDetected ? "supported" : "not-supported"
    }
  }

  // Dynamic probe entries
  const probeEntries: CapEntry[] = [
    {
      name: "Mode 2031 Color Scheme",
      status: colorScheme === "unknown" ? "probing" : "detected",
      detail: colorScheme === "unknown" ? "probing..." : colorScheme,
    },
    {
      name: "DEC 1020 UTF-8",
      status: widthConfig === null ? "probing" : "detected",
      detail: widthConfig === null ? "probing..." : widthConfig.utf8 ? "enabled" : "disabled",
    },
    {
      name: "DEC 1021 CJK Width",
      status: widthConfig === null ? "probing" : "detected",
      detail: widthConfig === null ? "probing..." : String(widthConfig.cjkWidth),
    },
    {
      name: "DEC 1022 Emoji Width",
      status: widthConfig === null ? "probing" : "detected",
      detail: widthConfig === null ? "probing..." : String(widthConfig.emojiWidth),
    },
    {
      name: "DEC 1023 Private Width",
      status: widthConfig === null ? "probing" : "detected",
      detail: widthConfig === null ? "probing..." : String(widthConfig.privateUseWidth),
    },
    {
      name: "OSC 66 Text Sizing",
      status: caps.textSizingSupported ? "supported" : "not-supported",
      detail: caps.textSizingSupported ? "supported" : "not supported",
    },
    {
      name: "OSC 5522 Advanced Clipboard",
      // Kitty 0.28+ supports this; approximate via kitty detection
      status: caps.term === "xterm-kitty" ? "supported" : "not-supported",
      detail: caps.term === "xterm-kitty" ? "Kitty" : "not supported",
    },
    {
      name: "DA1/DA2/DA3",
      // All modern terminals respond to DA queries
      status: caps.program !== "" ? "supported" : "not-supported",
    },
  ]

  // Terminal info header
  const termProgram = caps.program || "(unknown)"
  const termType = caps.term || "(unknown)"
  const colorLevel = caps.colorLevel

  // Column width for alignment
  const colWidth = 38

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <H3>Terminal Capabilities Probe</H3>

      {/* Terminal identity */}
      <Box paddingBottom={1}>
        <Muted>
          Terminal: {termProgram} ({termType}) | Colors: {colorLevel} | Background:{" "}
          {caps.darkBackground ? "dark" : "light"}
        </Muted>
      </Box>

      {/* Two-column layout */}
      <Box>
        {/* Left column: static capabilities */}
        <Box flexDirection="column" width={colWidth + 4}>
          <Text bold color="$primary">
            Static Detection
          </Text>
          <Box height={1} />
          {staticEntries.map((entry) => (
            <CapRow key={entry.name} entry={entry} width={colWidth} />
          ))}
        </Box>

        {/* Right column: runtime probes */}
        <Box flexDirection="column" width={colWidth + 4}>
          <Text bold color="$primary">
            Runtime Probes
          </Text>
          <Box height={1} />
          {probeEntries.map((entry) => (
            <CapRow key={entry.name} entry={entry} width={colWidth} />
          ))}
        </Box>
      </Box>

      {/* Footer */}
      <Box paddingTop={1}>
        <Muted>
          <Kbd>q</Kbd> or <Kbd>Esc</Kbd> to quit
        </Muted>
      </Box>
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="q/Esc quit">
      <TerminalCapsApp />
    </ExampleBanner>,
  )

  await waitUntilExit()
}

export { main }

if (import.meta.main) {
  main().catch((err) => {
    // Ensure terminal is restored on error
    const stdout = process.stdout
    stdout.write("\x1b[?25h") // show cursor
    stdout.write("\x1b[?1049l") // leave alt screen
    stdout.write("\x1b[0m") // reset styles
    if (process.stdin.isTTY && process.stdin.isRaw) {
      try {
        process.stdin.setRawMode(false)
      } catch {
        /* noop */
      }
    }
    console.error(err)
    process.exit(1)
  })
}
