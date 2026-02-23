#!/usr/bin/env bun
/**
 * Terminal Compatibility Matrix Generator
 *
 * Reads the terminal definitions from detectTerminalCaps() and generates
 * a markdown compatibility matrix showing what each terminal supports.
 *
 * Usage:
 *   bun vendor/beorn-inkx/tests/terminal-compat/compat-matrix.ts
 *
 * Output: Markdown table to stdout
 */

import { detectTerminalCaps, type TerminalCaps } from "../../src/terminal-caps.js"

// ============================================================================
// Terminal Profiles
// ============================================================================

interface TerminalProfile {
  name: string
  env: Record<string, string>
  notes?: string
}

const terminals: TerminalProfile[] = [
  {
    name: "Ghostty",
    env: {
      TERM: "xterm-ghostty",
      TERM_PROGRAM: "ghostty",
      COLORTERM: "truecolor",
    },
  },
  {
    name: "kitty",
    env: { TERM: "xterm-kitty", COLORTERM: "truecolor" },
  },
  {
    name: "WezTerm",
    env: {
      TERM: "xterm-256color",
      TERM_PROGRAM: "WezTerm",
      COLORTERM: "truecolor",
    },
  },
  {
    name: "iTerm2",
    env: {
      TERM: "xterm-256color",
      TERM_PROGRAM: "iTerm.app",
      COLORTERM: "truecolor",
    },
  },
  {
    name: "foot",
    env: { TERM: "foot", COLORTERM: "truecolor" },
  },
  {
    name: "Alacritty",
    env: {
      TERM: "alacritty",
      TERM_PROGRAM: "Alacritty",
      COLORTERM: "truecolor",
    },
  },
  {
    name: "VS Code",
    env: {
      TERM: "xterm-256color",
      TERM_PROGRAM: "vscode",
      COLORTERM: "truecolor",
    },
    notes: "Integrated terminal",
  },
  {
    name: "Terminal.app",
    env: { TERM: "xterm-256color", TERM_PROGRAM: "Apple_Terminal" },
    notes: "macOS built-in",
  },
  {
    name: "tmux",
    env: { TERM: "tmux-256color", COLORTERM: "truecolor" },
    notes: "Capabilities depend on outer terminal",
  },
  {
    name: "TERM=dumb",
    env: { TERM: "dumb" },
    notes: "CI / headless / pipe",
  },
]

// Capability columns to display
const capColumns: { key: keyof TerminalCaps; label: string }[] = [
  { key: "colorLevel", label: "Colors" },
  { key: "kittyKeyboard", label: "Kitty KB" },
  { key: "kittyGraphics", label: "Kitty Gfx" },
  { key: "sixel", label: "Sixel" },
  { key: "osc52", label: "OSC 52" },
  { key: "hyperlinks", label: "Hyperlinks" },
  { key: "notifications", label: "Notify" },
  { key: "bracketedPaste", label: "Paste" },
  { key: "mouse", label: "Mouse" },
  { key: "syncOutput", label: "Sync" },
  { key: "unicode", label: "Unicode" },
]

// ============================================================================
// Detection
// ============================================================================

function detectWithEnv(env: Record<string, string>): TerminalCaps {
  // Save current env
  const saved: Record<string, string | undefined> = {}
  const keysToClean = ["TERM", "TERM_PROGRAM", "COLORTERM", "NO_COLOR"]

  for (const key of keysToClean) {
    saved[key] = process.env[key]
    delete process.env[key]
  }

  // Set profile env
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value
  }

  const caps = detectTerminalCaps()

  // Restore env
  for (const key of keysToClean) {
    if (saved[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = saved[key]
    }
  }

  return caps
}

// ============================================================================
// Markdown Generation
// ============================================================================

function formatValue(key: keyof TerminalCaps, value: unknown): string {
  if (key === "colorLevel") {
    switch (value) {
      case "truecolor":
        return "24-bit"
      case "256":
        return "256"
      case "basic":
        return "16"
      case "none":
        return "-"
      default:
        return String(value)
    }
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "-"
  }
  return String(value)
}

function padRight(str: string, width: number): string {
  return str + " ".repeat(Math.max(0, width - str.length))
}

function generateMarkdown(): string {
  const lines: string[] = []

  lines.push("# Terminal Compatibility Matrix")
  lines.push("")
  lines.push("Auto-generated from `detectTerminalCaps()` definitions.")
  lines.push(`Generated: ${new Date().toISOString().split("T")[0]}`)
  lines.push("")
  lines.push("```")
  lines.push("bun vendor/beorn-inkx/tests/terminal-compat/compat-matrix.ts")
  lines.push("```")
  lines.push("")

  // Detect capabilities for each terminal
  const results = terminals.map((t) => ({
    profile: t,
    caps: detectWithEnv(t.env),
  }))

  // Calculate column widths
  const nameWidth = Math.max("Terminal".length, ...results.map((r) => r.profile.name.length))
  const colWidths = capColumns.map((col) =>
    Math.max(col.label.length, ...results.map((r) => formatValue(col.key, r.caps[col.key]).length)),
  )

  // Header
  const header = `| ${padRight("Terminal", nameWidth)} | ${capColumns.map((col, i) => padRight(col.label, colWidths[i]!)).join(" | ")} |`
  const separator = `| ${"-".repeat(nameWidth)} | ${colWidths.map((w) => "-".repeat(w)).join(" | ")} |`

  lines.push(header)
  lines.push(separator)

  // Data rows
  for (const { profile, caps } of results) {
    const values = capColumns.map((col, i) => padRight(formatValue(col.key, caps[col.key]), colWidths[i]!))
    const row = `| ${padRight(profile.name, nameWidth)} | ${values.join(" | ")} |`
    lines.push(row)
  }

  lines.push("")

  // Legend
  lines.push("## Legend")
  lines.push("")
  lines.push("| Column | Description |")
  lines.push("| --- | --- |")
  lines.push("| Colors | Color support: 24-bit (truecolor), 256, 16 (basic), or - (none) |")
  lines.push(
    "| Kitty KB | [Kitty keyboard protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/) (unambiguous keys, Cmd/Hyper) |",
  )
  lines.push(
    "| Kitty Gfx | [Kitty graphics protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/) (inline images) |",
  )
  lines.push("| Sixel | [Sixel graphics](https://en.wikipedia.org/wiki/Sixel) (inline images) |")
  lines.push(
    "| OSC 52 | [OSC 52 clipboard](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h3-Operating-System-Commands) (works over SSH) |",
  )
  lines.push("| Hyperlinks | [OSC 8 hyperlinks](https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda) |")
  lines.push("| Notify | Terminal notifications (OSC 9 for iTerm2, OSC 99 for Kitty) |")
  lines.push("| Paste | [Bracketed paste mode](https://cirw.in/blog/bracketed-paste) (DEC 2004) |")
  lines.push("| Mouse | SGR mouse tracking (mode 1006) |")
  lines.push(
    "| Sync | [Synchronized output](https://gist.github.com/christianparpart/d8a62cc1ab659194337d73e399004036) (DEC 2026) |",
  )
  lines.push("| Unicode | Unicode/emoji rendering support |")
  lines.push("")

  // Notes
  const notedTerminals = results.filter((r) => r.profile.notes)
  if (notedTerminals.length > 0) {
    lines.push("## Notes")
    lines.push("")
    for (const { profile } of notedTerminals) {
      lines.push(`- **${profile.name}**: ${profile.notes}`)
    }
    lines.push("")
  }

  // Detection method
  lines.push("## Detection Method")
  lines.push("")
  lines.push("Capabilities are detected synchronously from environment variables:")
  lines.push("")
  lines.push("- `TERM` -- terminal type identifier (e.g., `xterm-256color`, `xterm-kitty`)")
  lines.push("- `TERM_PROGRAM` -- terminal emulator name (e.g., `ghostty`, `iTerm.app`)")
  lines.push("- `COLORTERM` -- color capability hint (`truecolor` or `24bit`)")
  lines.push("- `NO_COLOR` -- disable all color output when set")
  lines.push("")
  lines.push("No I/O is performed (no terminal queries). This means detection is instant")
  lines.push("but limited to what env vars reveal. Some capabilities (like Kitty keyboard)")
  lines.push("can also be runtime-detected via `detectKittyFromStdio()`.")
  lines.push("")

  return lines.join("\n")
}

// ============================================================================
// Main
// ============================================================================

console.log(generateMarkdown())
