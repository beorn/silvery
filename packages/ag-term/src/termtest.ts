/**
 * Terminal Capability Test
 *
 * Renders labeled test patterns for each terminal feature.
 * Run in any terminal to visually verify what it supports.
 *
 * Usage:
 *   import { runTermtest } from "@silvery/ag-react"
 *   runTermtest()                    // all sections
 *   runTermtest({ sections: ["emoji", "colors"] })  // specific sections
 *
 * Compare output across terminals to build/verify profiles.
 */

import { createTerminalProfile } from "@silvery/ansi"

const ESC = "\x1b"
const CSI = `${ESC}[`
const RESET = `${CSI}0m`

function sgr(...codes: (string | number)[]): string {
  return `${CSI}${codes.join(";")}m`
}

function sectionHeader(title: string): string {
  return `\n${sgr(1)}═══ ${title} ═══${RESET}\n`
}

function row(label: string, content: string): string {
  return `  ${label.padEnd(24)} ${content}${RESET}`
}

/** Available test sections */
export const TERMTEST_SECTIONS = [
  "sgr",
  "underline",
  "colors",
  "256",
  "truecolor",
  "unicode",
  "emoji",
  "borders",
  "inverse",
  "profile",
] as const

export type TermtestSection = (typeof TERMTEST_SECTIONS)[number]

export interface TermtestOptions {
  /** Writable stream (defaults to process.stdout) */
  output?: { write(s: string): boolean }
  /** Show only these sections. Omit or empty = all sections. */
  sections?: TermtestSection[]
}

/**
 * Run the terminal capability test.
 * Pass section names to filter: `runTermtest({ sections: ["emoji"] })`
 */
export function runTermtest(options?: TermtestOptions): void {
  const w = options?.output ?? process.stdout
  const filter = options?.sections
  const show = (s: TermtestSection) => !filter || filter.length === 0 || filter.includes(s)

  // Post km-silvery.plateau-delete-legacy-shims (H6): read caps through the
  // canonical profile factory. termtest has no Term in scope (it's a CLI
  // one-shot), so the zero-arg variant auto-detects from process.env /
  // process.stdout — same behavior the deleted `detectTerminalCaps()` shim
  // provided.
  // Post km-silvery.plateau-naming-polish: 2-layer profile (caps + emulator);
  // heuristic fields live on caps with a `maybe` prefix.
  const { caps, emulator } = createTerminalProfile()

  w.write(`\n${sgr(1)}Terminal Capability Test${RESET}\n`)
  w.write(`  Program: ${emulator.program || "(unknown)"}\n`)
  w.write(`  TERM: ${emulator.TERM || "(unknown)"}\n`)
  w.write(`  COLORTERM: ${process.env.COLORTERM || "(unset)"}\n`)
  w.write(
    `  Detected: color=${caps.colorLevel} maybe-dark=${caps.maybeDarkBackground} maybe-nerdfont=${caps.maybeNerdFont}\n`,
  )
  w.write(`  Underline: styles=[${caps.underlineStyles.join(", ")}] color=${caps.underlineColor}\n`)
  w.write(`  Maybe wide emojis: ${caps.maybeWideEmojis}\n`)

  if (show("sgr")) {
    w.write(sectionHeader("SGR Text Attributes"))
    w.write(row("Bold", `${sgr(1)}The quick brown fox${RESET}`) + "\n")
    w.write(row("Dim", `${sgr(2)}The quick brown fox${RESET}`) + "\n")
    w.write(row("Italic", `${sgr(3)}The quick brown fox${RESET}`) + "\n")
    w.write(row("Underline", `${sgr(4)}The quick brown fox${RESET}`) + "\n")
    w.write(row("Strikethrough", `${sgr(9)}The quick brown fox${RESET}`) + "\n")
    w.write(row("Inverse", `${sgr(7)}The quick brown fox${RESET}`) + "\n")
    w.write(row("Blink", `${sgr(5)}The quick brown fox${RESET}`) + "\n")
    w.write(row("Bold+Italic", `${sgr(1, 3)}The quick brown fox${RESET}`) + "\n")
  }

  if (show("underline")) {
    w.write(sectionHeader("SGR 4:x Underline Styles (Terminal.app BREAKS here)"))
    w.write(row("4:1 Single", `${CSI}4:1mThe quick brown fox${RESET}`) + "\n")
    w.write(row("4:2 Double", `${CSI}4:2mThe quick brown fox${RESET}`) + "\n")
    w.write(row("4:3 Curly", `${CSI}4:3mThe quick brown fox${RESET}`) + "\n")
    w.write(row("4:4 Dotted", `${CSI}4:4mThe quick brown fox${RESET}`) + "\n")
    w.write(row("4:5 Dashed", `${CSI}4:5mThe quick brown fox${RESET}`) + "\n")
    w.write(
      row(
        "After 4:x (clean?)",
        `${CSI}4:3m${RESET}This text should be normal — if garbled, 4:x corrupted SGR state`,
      ) + "\n",
    )

    w.write(sectionHeader("SGR 58 Underline Color (Terminal.app BREAKS here)"))
    w.write(row("58;5;1 Red UL", `${sgr(4)}${CSI}58;5;1mThe quick brown fox${RESET}`) + "\n")
    w.write(row("58;5;2 Green UL", `${sgr(4)}${CSI}58;5;2mThe quick brown fox${RESET}`) + "\n")
    w.write(row("58;5;4 Blue UL", `${sgr(4)}${CSI}58;5;4mThe quick brown fox${RESET}`) + "\n")
    w.write(
      row("58;2;R;G;B TC UL", `${sgr(4)}${CSI}58;2;255;128;0mThe quick brown fox${RESET}`) + "\n",
    )
    w.write(
      row(
        "After SGR 58 (clean?)",
        `${sgr(4)}${CSI}58;5;1m${RESET}This text should be normal — if garbled, 58 corrupted SGR state`,
      ) + "\n",
    )
  }

  if (show("colors")) {
    w.write(sectionHeader("ANSI 16 Colors"))
    const colorNames = ["Black", "Red", "Green", "Yellow", "Blue", "Magenta", "Cyan", "White"]
    let fgLine = "  FG:  "
    for (let i = 0; i < 8; i++) fgLine += `${sgr(30 + i)} ${colorNames[i]}${RESET}`
    w.write(fgLine + "\n")
    let fgBrLine = "  Br:  "
    for (let i = 0; i < 8; i++) fgBrLine += `${sgr(90 + i)} ${colorNames[i]}${RESET}`
    w.write(fgBrLine + "\n")
    let bgLine = "  BG:  "
    for (let i = 0; i < 8; i++) bgLine += `${sgr(40 + i)} ${colorNames[i]} ${RESET}`
    w.write(bgLine + "\n")
    let bgBrLine = "  BrBG:"
    for (let i = 0; i < 8; i++) bgBrLine += `${sgr(100 + i)} ${colorNames[i]} ${RESET}`
    w.write(bgBrLine + "\n")
  }

  if (show("256")) {
    w.write(sectionHeader("256 Colors (indices 0-15, 16-231, 232-255)"))
    let stdLine = "  0-15:  "
    for (let i = 0; i < 16; i++) stdLine += `${CSI}48;5;${i}m  ${RESET}`
    w.write(stdLine + "\n")
    let cubeLine = "  Cube:  "
    for (let i = 16; i < 52; i++) cubeLine += `${CSI}48;5;${i}m ${RESET}`
    w.write(cubeLine + "\n")
    let grayLine = "  Gray:  "
    for (let i = 232; i < 256; i++) grayLine += `${CSI}48;5;${i}m ${RESET}`
    w.write(grayLine + "\n")
  }

  if (show("truecolor")) {
    w.write(sectionHeader("Truecolor (38;2;R;G;B / 48;2;R;G;B)"))
    let tcLine = "  Gradient: "
    for (let i = 0; i < 40; i++) {
      const r = Math.round((i / 39) * 255)
      const g = Math.round(((39 - i) / 39) * 128)
      tcLine += `${CSI}48;2;${r};${g};80m ${RESET}`
    }
    w.write(tcLine + "\n")
    w.write(row("If solid blocks →", "Truecolor NOT supported (256-color fallback)") + "\n")
  }

  if (show("unicode")) {
    w.write(sectionHeader("Unicode, Emoji, PUA (Nerd Fonts)"))
    w.write(row("ASCII", "Hello World! 0123456789") + "\n")
    w.write(row("Latin Extended", "àéîõü ñ ß ø å") + "\n")
    w.write(row("CJK", "你好世界 日本語 한국어") + "\n")
    w.write(row("Box Drawing", "┌─┬─┐ ╔═╦═╗ ╭─╮") + "\n")
    w.write(row("Block Elements", "▀▄█▌▐░▒▓") + "\n")
    w.write(row("Symbols", "● ○ ◉ ▶ ◀ ⚠ ✓ ✗ ⋮ §") + "\n")
    w.write(row("Emoji", "🎉 🚀 📁 📄 ⭐ 🔥 👍") + "\n")
    w.write(row("Nerd Font PUA", "\uF114 folder  \uF0F6 file  \uE0B0 arrow  \uF013 gear") + "\n")
    w.write(row("If PUA = boxes →", "Nerd Fonts not installed") + "\n")
  }

  if (show("emoji")) {
    // Each test line places a character then fills to exactly 10 visible columns.
    // If the _'s don't align with the ruler, the terminal's character width
    // disagrees with the expected width (shown in parentheses).
    w.write(sectionHeader("Emoji Width Alignment (_'s should align with ruler)"))
    w.write("  Ruler:     |1234567890|\n")
    w.write("  ASCII 'A': |A_________| (w=1)\n")
    w.write("  CJK '你':  |你________| (w=2)\n")
    w.write("  Flag 🇨🇦:  |🇨🇦________| (w=2)\n")
    w.write("  Flag 🇺🇸:  |🇺🇸________| (w=2)\n")
    w.write("  Emoji 📁:  |📁________| (w=2)\n")
    w.write("  Emoji 📄:  |📄________| (w=2)\n")
    w.write("  Emoji 📋:  |📋________| (w=2)\n")
    w.write("  Emoji ⚠️:  |⚠️________| (w=2)\n")
    w.write("  Text  ⚠:   |⚠_________| (w=1 text, 2 emoji)\n")
    w.write("  Text  ⭐:   |⭐________| (w=1 text, 2 emoji)\n")
    w.write("  Text  ☑:   |☑_________| (w=1 text, 2 emoji)\n")
    w.write("  Emoji 🏠:  |🏠________| (w=2)\n")
    w.write("  Emoji 👓:  |👓________| (w=2)\n")
    w.write("  ZWJ 👨🏻‍💻: |👨🏻‍💻________| (w=2)\n")
    w.write("  Arrow →:   |→_________| (w=1)\n")
    w.write("  Arrow ▸:   |▸_________| (w=1)\n")
    w.write("  Circle ○:  |○_________| (w=1)\n")
    w.write("  Square □:  |□_________| (w=1)\n")
    w.write("  Check ✓:   |✓_________| (w=1)\n")
  }

  if (show("borders")) {
    w.write(sectionHeader("Box Drawing Borders"))
    w.write("  ┌──────────┐  ╔══════════╗  ╭──────────╮\n")
    w.write("  │  single  │  ║  double  ║  │  round   │\n")
    w.write("  └──────────┘  ╚══════════╝  ╰──────────╯\n")
  }

  if (show("inverse")) {
    w.write(sectionHeader("Inverse + Background (potential artifact source)"))
    w.write(row("Red FG + Inverse", `${sgr(31, 7)}This should have red background${RESET}`) + "\n")
    w.write(row("Cyan BG + White FG", `${sgr(46, 37)}Cyan background, white text${RESET}`) + "\n")
    w.write(row("Black BG + White FG", `${sgr(40, 97)}Black bg, bright white text${RESET}`) + "\n")
    w.write(row("White BG + Black FG", `${sgr(107, 30)}White bg, black text${RESET}`) + "\n")

    w.write(sectionHeader("Reset Sanity Check"))
    w.write("  This line should be completely normal with no formatting artifacts.\n")
    w.write("  If you see colors, underlines, or other styling above, the terminal\n")
    w.write("  failed to process an SGR reset (\\x1b[0m) correctly.\n")
  }

  if (show("profile")) {
    w.write(sectionHeader("Detected Terminal Profile"))
    const entries = Object.entries(caps) as [string, unknown][]
    for (const [key, value] of entries) {
      const indicator = value === true ? "✓" : value === false ? "✗" : String(value)
      w.write(`  ${key.padEnd(20)} ${indicator}\n`)
    }
  }

  w.write("\n")
}
