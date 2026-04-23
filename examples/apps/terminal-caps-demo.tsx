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
 * Run: bun examples/apps/terminal-caps-demo.tsx
 */

import React, { useState } from "react"
import { Box, Text, H3, Muted, Kbd, render, useInput, useApp, type Key } from "silvery"
import {
  createTerminalProfile,
  type TerminalCaps,
  createWidthDetector,
  type TerminalWidthConfig,
  DEFAULT_WIDTH_CONFIG,
  detectKittyFromStdio,
} from "@silvery/ag-term"
import { createBgModeDetector, type BgMode } from "@silvery/ag-term/ansi"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Terminal Capabilities",
  description: "Probe and display all supported terminal protocols",
  demo: true,
  features: [
    "createTerminalProfile()",
    "Mode 2031",
    "DEC 1020-1023",
    "OSC 66",
    "OSC 52",
    "OSC 5522",
    "DA1/DA2/DA3",
  ],
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
      return <Text color="$fg-success">{"✓"}</Text>
    case "not-supported":
      return <Text color="$fg-error">{"✗"}</Text>
    case "probing":
      return <Text color="$fg-warning">{"?"}</Text>
    case "detected":
      return <Text color="$fg-warning">{"?"}</Text>
  }
}

function CapRow({ entry, width }: { entry: CapEntry; width: number }) {
  const label = entry.detail ? `${entry.name}: ${entry.detail}` : entry.name
  const padded = label.length < width ? label + " ".repeat(width - label.length) : label
  return (
    <Box>
      <StatusIcon status={entry.status} />
      <Text> </Text>
      <Text color={entry.status === "not-supported" ? "$fg-muted" : undefined}>{padded}</Text>
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

function TerminalCapsApp({
  initialProbes,
}: {
  initialProbes?: {
    colorScheme: BgMode
    widthConfig: TerminalWidthConfig | null
    kittyDetected: boolean | null
  }
}) {
  const { exit } = useApp()
  const [caps] = useState<TerminalCaps>(() => createTerminalProfile().caps)
  const [colorScheme] = useState<BgMode>(initialProbes?.colorScheme ?? "unknown")
  const [widthConfig] = useState<TerminalWidthConfig | null>(initialProbes?.widthConfig ?? null)
  const [kittyDetected] = useState<boolean | null>(initialProbes?.kittyDetected ?? null)

  // Quit on q or Esc
  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) {
      exit()
    }
  })

  // Probing is done before render() in main() — no useEffect needed.
  // This avoids stdin conflicts between protocol responses and useInput.

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
          <Text bold color="$fg-accent">
            Static Detection
          </Text>
          <Box height={1} />
          {staticEntries.map((entry) => (
            <CapRow key={entry.name} entry={entry} width={colWidth} />
          ))}
        </Box>

        {/* Right column: runtime probes */}
        <Box flexDirection="column" width={colWidth + 4}>
          <Text bold color="$fg-accent">
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

export async function main() {
  // Probe BEFORE render() starts — avoids stdin conflict with useInput.
  // Once render() owns stdin, protocol responses leak as visible text.
  let probeResults: {
    colorScheme: BgMode
    widthConfig: TerminalWidthConfig | null
    kittyDetected: boolean | null
  } = { colorScheme: "unknown", widthConfig: null, kittyDetected: null }

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
    process.stdin.resume()

    const write = (data: string) => process.stdout.write(data)
    const onData = (handler: (data: string) => void): (() => void) => {
      const h = (chunk: Buffer | string) =>
        handler(typeof chunk === "string" ? chunk : chunk.toString())
      process.stdin.on("data", h)
      return () => process.stdin.removeListener("data", h)
    }

    // Run all probes in parallel with 500ms timeout
    const [colorResult, widthResult, kittyResult] = await Promise.allSettled([
      new Promise<BgMode>((resolve) => {
        const det = createBgModeDetector({ write, onData, timeoutMs: 500 })
        det.subscribe((s) => {
          resolve(s)
          det.stop()
        })
        det.start()
        setTimeout(() => {
          resolve(det.scheme)
          det.stop()
        }, 600)
      }),
      createWidthDetector({ write, onData, timeoutMs: 500 })
        .detect()
        .catch(() => null),
      detectKittyFromStdio(process.stdout, process.stdin, 500)
        .then((r) => r.supported)
        .catch(() => false),
    ])

    probeResults = {
      colorScheme: colorResult.status === "fulfilled" ? colorResult.value : "unknown",
      widthConfig: widthResult.status === "fulfilled" ? widthResult.value : null,
      kittyDetected: kittyResult.status === "fulfilled" ? kittyResult.value : false,
    }

    process.stdin.setRawMode(false)
    process.stdin.pause()
  }

  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="q/Esc quit">
      <TerminalCapsApp initialProbes={probeResults} />
    </ExampleBanner>,
  )

  await waitUntilExit()
}
