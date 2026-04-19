#!/usr/bin/env bun
/**
 * @silvery/theme CLI — browse and preview built-in themes.
 *
 * Usage:
 *   bun theme                    # Interactive theme browser
 *   bun theme list               # List all themes
 *   bun theme show <name>        # Show a specific theme
 *   bun theme json <name>        # Output theme as JSON
 *   bun theme inspect            # Inspect active terminal theme
 *   bun theme inspect --diff <n> # Diff against a named scheme
 *   bun theme inspect --format json  # JSON output
 */

import { builtinPalettes, getThemeByName } from "./schemes"
import { deriveTheme, detectScheme, DEFAULT_MONO_ATTRS } from "@silvery/ansi"
import type { Theme, ColorScheme } from "@silvery/ansi"

// ── ANSI helpers ─────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "")
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function fg(hex: string, text: string): string {
  const [r, g, b] = hexToRgb(hex)
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`
}

function bg(hex: string, text: string): string {
  const [r, g, b] = hexToRgb(hex)
  return `\x1b[48;2;${r};${g};${b}m${text}\x1b[0m`
}

function swatch(hex: string): string {
  return bg(hex, "  ")
}

// ── Commands ─────────────────────────────────────────────────────────

function listThemes(): void {
  const names = Object.keys(builtinPalettes).sort()
  console.log(`\n  ${names.length} built-in palettes:\n`)

  for (const name of names) {
    const palette = builtinPalettes[name]!
    const theme = deriveTheme(palette)
    const swatches = [
      swatch(palette.background),
      swatch(palette.red),
      swatch(palette.green),
      swatch(palette.yellow),
      swatch(palette.blue),
      swatch(palette.magenta),
      swatch(palette.cyan),
      swatch(palette.foreground),
    ].join("")
    const mode = palette.dark !== false ? "dark" : "light"
    console.log(`  ${swatches}  ${name.padEnd(24)} ${fg(palette.foreground, mode)}`)
  }
  console.log()
}

function showTheme(name: string): void {
  const palette = builtinPalettes[name]
  if (!palette) {
    console.error(`Unknown theme: ${name}`)
    console.error(`Available: ${Object.keys(builtinPalettes).sort().join(", ")}`)
    process.exit(1)
  }

  const theme = deriveTheme(palette)
  const line = "─".repeat(50)

  console.log(`\n  ${fg(palette.foreground, name)}`)
  console.log(`  ${fg(palette.brightBlack ?? palette.white, line)}\n`)

  // 16-color ANSI palette
  console.log("  ANSI palette:")
  const ansiColors = [
    palette.black,
    palette.red,
    palette.green,
    palette.yellow,
    palette.blue,
    palette.magenta,
    palette.cyan,
    palette.white,
  ]
  const brightColors = [
    palette.brightBlack,
    palette.brightRed,
    palette.brightGreen,
    palette.brightYellow,
    palette.brightBlue,
    palette.brightMagenta,
    palette.brightCyan,
    palette.brightWhite,
  ]
  console.log("  " + ansiColors.map((c) => bg(c, "    ")).join(""))
  console.log("  " + brightColors.map((c) => bg(c, "    ")).join(""))

  // Special colors
  console.log(`\n  Special:`)
  console.log(
    `  ${swatch(palette.background)} background  ${swatch(palette.foreground)} foreground`,
  )
  console.log(
    `  ${swatch(palette.cursorColor)} cursor      ${swatch(palette.selectionBackground)} selection`,
  )

  // Semantic tokens
  console.log(`\n  Semantic tokens:`)
  const tokens: Array<[string, string]> = [
    ["primary", theme.primary],
    ["secondary", theme.secondary],
    ["accent", theme.accent],
    ["error", theme.error],
    ["warning", theme.warning],
    ["success", theme.success],
    ["info", theme.info],
    ["border", theme.border],
    ["link", theme.link],
    ["surface", theme.surface],
  ]
  for (const [label, color] of tokens) {
    if (color.startsWith("#")) {
      console.log(`  ${swatch(color)} ${label}`)
    }
  }

  // Preview
  console.log(`\n  Preview:`)
  const previewBg = palette.background
  const previewFg = palette.foreground
  console.log(`  ${bg(previewBg, fg(previewFg, `  Hello from ${name}!  `))}`)
  console.log(
    `  ${bg(previewBg, fg(theme.primary.startsWith("#") ? theme.primary : palette.blue, `  Primary text          `))}`,
  )
  console.log(
    `  ${bg(previewBg, fg(theme.success.startsWith("#") ? theme.success : palette.green, `  Success message       `))}`,
  )
  console.log(
    `  ${bg(previewBg, fg(theme.error.startsWith("#") ? theme.error : palette.red, `  Error message         `))}`,
  )
  console.log()
}

function showJson(name: string): void {
  const palette = builtinPalettes[name]
  if (!palette) {
    console.error(`Unknown theme: ${name}`)
    process.exit(1)
  }
  const theme = deriveTheme(palette)
  console.log(JSON.stringify(theme, null, 2))
}

// ── Inspect command ──────────────────────────────────────────────────

/** All standard token keys shown in inspect output, in display order. */
const INSPECT_TOKENS: readonly (keyof Theme)[] = [
  "fg",
  "bg",
  "muted",
  "mutedbg",
  "surface",
  "surfacebg",
  "popover",
  "popoverbg",
  "inverse",
  "inversebg",
  "cursor",
  "cursorbg",
  "selection",
  "selectionbg",
  "primary",
  "primaryfg",
  "secondary",
  "secondaryfg",
  "accent",
  "accentfg",
  "error",
  "errorfg",
  "warning",
  "warningfg",
  "success",
  "successfg",
  "info",
  "infofg",
  "border",
  "inputborder",
  "focusborder",
  "link",
  "disabledfg",
]

/** Format a token value for display. Hex strings get a color swatch; ANSI names shown as-is. */
function tokenDisplay(value: string, wide = false): string {
  if (value.startsWith("#") && value.length === 7) {
    const sw = wide ? swatch(value) + " " : ""
    return sw + value
  }
  return value
}

/** Build a divider line of repeated chars to a given width. */
function divider(char: string, width: number): string {
  return char.repeat(width)
}

async function inspectTheme(flags: { diff?: string; format?: string }): Promise<void> {
  const catalog = Object.values(builtinPalettes)

  // Detect the active terminal scheme via OSC probe + fingerprint
  const result = await detectScheme({ catalog, enforce: "lenient" })
  const theme = result.theme

  if (flags.format === "json") {
    const output: Record<string, unknown> = {
      terminal: {
        source: result.source,
        confidence: result.confidence,
        matchedName: result.matchedName ?? null,
      },
      theme: Object.fromEntries(
        INSPECT_TOKENS.map((key) => {
          const value = theme[key] as string
          const attrs = DEFAULT_MONO_ATTRS[key] ?? []
          return [
            `$${String(key)}`,
            {
              value,
              monoAttrs: attrs,
            },
          ]
        }),
      ),
    }

    if (flags.diff) {
      const diffPalette = builtinPalettes[flags.diff]
      if (!diffPalette) {
        console.error(`Unknown scheme for --diff: ${flags.diff}`)
        process.exit(1)
      }
      const diffTheme = deriveTheme(diffPalette)
      const differences: Record<string, { detected: string; reference: string }> = {}
      for (const key of INSPECT_TOKENS) {
        const a = theme[key] as string
        const b = diffTheme[key] as string
        if (a !== b) {
          differences[`$${String(key)}`] = { detected: a, reference: b }
        }
      }
      ;(output as Record<string, unknown>).diff = { against: flags.diff, differences }
    }

    console.log(JSON.stringify(output, null, 2))
    return
  }

  // Human-readable output
  const COL1 = 26 // token name
  const COL2 = 12 // value (hex + swatch)
  const COL3 = 20 // SGR attrs

  // Header: detected terminal info
  const pct = `${(result.confidence * 100).toFixed(0)}%`
  let sourceLine: string
  if (result.source === "fingerprint") {
    sourceLine = `fingerprint matched ${result.matchedName} (confidence ${pct})`
  } else if (result.source === "probed") {
    sourceLine = `probed (no catalog match, confidence ${pct})`
  } else if (result.source === "fallback") {
    sourceLine = "fallback (detection failed)"
  } else if (result.source === "override") {
    sourceLine = `override (${result.matchedName ?? "explicit"})`
  } else {
    sourceLine = result.source
  }

  const bgHex = theme.bg
  const isDark = bgHex.startsWith("#") ? parseInt(bgHex.slice(1), 16) < 0x808080 : true

  console.log()
  const schemeLabel = result.matchedName ?? (result.source === "probed" ? "custom" : "unknown")
  console.log(`  Detected terminal:  ${schemeLabel}`)
  console.log(`  Source:             ${sourceLine}`)
  console.log(`  Dark:               ${isDark}`)
  console.log()

  // Column headers
  const h1 = "Token".padEnd(COL1)
  const h2 = "Value".padEnd(COL2)
  const h3 = "SGR (mono tier)"
  console.log(`  ${h1} ${h2} ${h3}`)
  console.log(`  ${divider("─", COL1)} ${divider("─", COL2)} ${divider("─", COL3)}`)

  // Token rows
  for (const key of INSPECT_TOKENS) {
    const value = theme[key] as string
    const attrs = DEFAULT_MONO_ATTRS[key]
    const attrStr = attrs && attrs.length > 0 ? attrs.join("+") : "none"

    const tokenCol = `$${String(key)}`.padEnd(COL1)
    const valueStr = value.startsWith("#") ? value : value || "(unset)"
    const valueRaw = valueStr.padEnd(COL2)
    const swatchStr = value.startsWith("#") ? swatch(value) : "  "

    console.log(`  ${tokenCol} ${swatchStr} ${valueRaw} ${attrStr}`)
  }
  console.log()

  // Diff section
  if (flags.diff) {
    const diffPalette = builtinPalettes[flags.diff]
    if (!diffPalette) {
      console.error(`Unknown scheme for --diff: ${flags.diff}`)
      process.exit(1)
    }
    const diffTheme = deriveTheme(diffPalette)

    const diffRows: Array<{ token: string; detected: string; reference: string }> = []
    for (const key of INSPECT_TOKENS) {
      const a = theme[key] as string
      const b = diffTheme[key] as string
      if (a !== b) {
        diffRows.push({ token: `$${String(key)}`, detected: a, reference: b })
      }
    }

    if (diffRows.length === 0) {
      console.log(`  No differences vs ${flags.diff}`)
    } else {
      console.log(`  Differences vs ${flags.diff} (${diffRows.length} tokens):`)
      console.log()
      for (const row of diffRows) {
        const tokenCol = row.token.padEnd(COL1)
        const detSwatch = row.detected.startsWith("#") ? swatch(row.detected) : "  "
        const refSwatch = row.reference.startsWith("#") ? swatch(row.reference) : "  "
        const detVal = row.detected.padEnd(9)
        const refVal = row.reference.padEnd(9)
        console.log(`  ${tokenCol} ${detSwatch} ${detVal} → ${refSwatch} ${refVal}`)
      }
    }
    console.log()
  }
}

async function interactiveBrowser(): Promise<void> {
  const names = Object.keys(builtinPalettes).sort()
  let cursor = 0

  // Save screen, hide cursor
  process.stdout.write("\x1b[?1049h\x1b[?25l")

  function render(): void {
    const { rows = 24, columns = 80 } = process.stdout
    const visibleRows = rows - 4
    const startIdx = Math.max(0, cursor - Math.floor(visibleRows / 2))
    const endIdx = Math.min(names.length, startIdx + visibleRows)

    // Clear and move to top
    process.stdout.write("\x1b[2J\x1b[H")

    // Header
    process.stdout.write(
      `  \x1b[1m@silvery/theme\x1b[0m — ${names.length} palettes  (j/k navigate, Enter show, q quit)\n\n`,
    )

    // List
    for (let i = startIdx; i < endIdx; i++) {
      const name = names[i]!
      const palette = builtinPalettes[name]!
      const swatches = [
        swatch(palette.background),
        swatch(palette.red),
        swatch(palette.green),
        swatch(palette.yellow),
        swatch(palette.blue),
        swatch(palette.magenta),
        swatch(palette.cyan),
        swatch(palette.foreground),
      ].join("")

      if (i === cursor) {
        process.stdout.write(`  \x1b[7m ${swatches}  ${name.padEnd(28)}\x1b[0m\n`)
      } else {
        process.stdout.write(`   ${swatches}  ${name}\n`)
      }
    }

    // Preview of selected theme
    const selectedName = names[cursor]!
    const palette = builtinPalettes[selectedName]!
    const previewBg = palette.background
    const previewFg = palette.foreground
    process.stdout.write(`\n  ${bg(previewBg, fg(previewFg, `  ${selectedName}  `))}`)
  }

  render()

  // Raw mode for key input
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
  }
  process.stdin.resume()

  return new Promise<void>((resolve) => {
    process.stdin.on("data", (data: Buffer) => {
      const key = data.toString()

      if (key === "q" || key === "\x1b" || key === "\x03") {
        // Restore screen, show cursor
        process.stdout.write("\x1b[?1049l\x1b[?25h")
        if (process.stdin.isTTY) process.stdin.setRawMode(false)
        process.stdin.pause()
        resolve()
        return
      }

      if (key === "j" || key === "\x1b[B") {
        cursor = Math.min(cursor + 1, names.length - 1)
      } else if (key === "k" || key === "\x1b[A") {
        cursor = Math.max(cursor - 1, 0)
      } else if (key === "g") {
        cursor = 0
      } else if (key === "G") {
        cursor = names.length - 1
      } else if (key === "\r" || key === "\n") {
        // Show detailed view
        process.stdout.write("\x1b[?1049l\x1b[?25h")
        if (process.stdin.isTTY) process.stdin.setRawMode(false)
        process.stdin.pause()
        showTheme(names[cursor]!)
        resolve()
        return
      }

      render()
    })
  })
}

// ── Main ─────────────────────────────────────────────────────────────

const [cmd, ...args] = process.argv.slice(2)

switch (cmd) {
  case "list":
    listThemes()
    break
  case "show":
    showTheme(args[0] ?? "")
    break
  case "json":
    showJson(args[0] ?? "")
    break
  case "inspect": {
    // Parse flags: --diff <name>, --format <fmt>
    let diffScheme: string | undefined
    let formatArg: string | undefined
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--diff" && args[i + 1]) {
        diffScheme = args[++i]
      } else if (args[i]?.startsWith("--diff=")) {
        diffScheme = args[i]!.slice("--diff=".length)
      } else if (args[i] === "--format" && args[i + 1]) {
        formatArg = args[++i]
      } else if (args[i]?.startsWith("--format=")) {
        formatArg = args[i]!.slice("--format=".length)
      }
    }
    await inspectTheme({ diff: diffScheme, format: formatArg })
    break
  }
  case undefined:
  case "view":
    await interactiveBrowser()
    break
  default:
    // Treat as theme name: bun theme catppuccin-mocha
    if (builtinPalettes[cmd]) {
      showTheme(cmd)
    } else {
      console.error(`Unknown command: ${cmd}`)
      console.error("Usage: bun theme [list|show <name>|json <name>|inspect|view]")
      process.exit(1)
    }
}
