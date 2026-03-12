#!/usr/bin/env bun
/**
 * @silvery/theme CLI — browse and preview built-in themes.
 *
 * Usage:
 *   bun theme              # Interactive theme browser
 *   bun theme list         # List all themes
 *   bun theme show <name>  # Show a specific theme
 *   bun theme json <name>  # Output theme as JSON
 */

import { builtinPalettes, getThemeByName } from "./palettes"
import { deriveTheme } from "./derive"
import type { Theme, ColorPalette } from "./types"

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
  console.log(`  ${swatch(palette.background)} background  ${swatch(palette.foreground)} foreground`)
  console.log(`  ${swatch(palette.cursorColor)} cursor      ${swatch(palette.selectionBackground)} selection`)

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
      console.error("Usage: bun theme [list|show <name>|json <name>|view]")
      process.exit(1)
    }
}
