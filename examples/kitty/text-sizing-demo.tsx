/**
 * Text Sizing Demo — OSC 66 Font Scale
 *
 * Demonstrates the kitty text sizing protocol (OSC 66 s= parameter)
 * for variable font sizes in the terminal. Shows headings at 2x,
 * body text at 1x, and annotations at 0.5x — all in one terminal.
 *
 * This is a raw terminal demo that writes escape sequences directly.
 * It requires Kitty v0.40+ to render correctly. Other terminals will
 * show normal-sized text (the escape sequences are silently ignored).
 *
 * Run: bun vendor/silvery/examples/kitty/text-sizing-demo.tsx
 *
 * @see https://sw.kovidgoyal.net/kitty/text-sizing-protocol/
 */

import { textScaled, resetTextScale, isTextSizingLikelySupported } from "../../packages/ag-term/src/text-sizing"
import type { ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Text Sizing",
  description: "Variable font sizes via OSC 66 — headings, body, small print",
  features: ["OSC 66", "textScaled()", "resetTextScale()", "font scale multiplier"],
}

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const ESC = "\x1b"
const CSI = `${ESC}[`
const RESET = `${CSI}0m`
const BOLD = `${CSI}1m`
const DIM = `${CSI}2m`
const ITALIC = `${CSI}3m`
const CYAN = `${CSI}36m`
const YELLOW = `${CSI}33m`
const GREEN = `${CSI}32m`
const MAGENTA = `${CSI}35m`
const GRAY = `${CSI}90m`
const WHITE = `${CSI}37m`
const BG_DARK = `${CSI}48;5;236m`

function styled(text: string, ...codes: string[]): string {
  return `${codes.join("")}${text}${RESET}`
}

function atScale(scale: number, text: string): string {
  return `${textScaled(scale)}${text}${resetTextScale()}`
}

// ---------------------------------------------------------------------------
// Demo sections
// ---------------------------------------------------------------------------

function banner(): string {
  const lines: string[] = []
  const width = 72
  const rule = styled("─".repeat(width), GRAY)

  lines.push("")
  lines.push(rule)
  lines.push(styled("  TEXT SIZING DEMO", BOLD, CYAN) + styled("  —  OSC 66 font scale (Kitty v0.40+)", DIM, GRAY))
  lines.push(rule)
  lines.push("")

  return lines.join("\n")
}

function headingShowcase(): string {
  const lines: string[] = []

  // Heading component scale mapping:
  //   <Heading level={1}> → 2.0x   <Heading level={2}> → 1.5x
  //   <Heading level={3}> → 1.25x  <Heading level={4}> → 1.0x (bold only)
  //   <Heading level={5}> → 0.9x   <Heading level={6}> → 0.8x
  lines.push(styled("  HEADINGS (Heading component scales)", BOLD, YELLOW))
  lines.push("")
  lines.push(`  ${styled("h1", GRAY, DIM)} ${atScale(2, styled("Main Heading", BOLD, CYAN))}`)
  lines.push(`  ${styled("h2", GRAY, DIM)} ${atScale(1.5, styled("Sub Heading", BOLD, GREEN))}`)
  lines.push(`  ${styled("h3", GRAY, DIM)} ${atScale(1.25, styled("Group Heading", BOLD, CYAN))}`)
  lines.push(`  ${styled("h4", GRAY, DIM)} ${styled("Body Heading (bold only)", BOLD, WHITE)}`)
  lines.push(`  ${styled("h5", GRAY, DIM)} ${atScale(0.9, styled("Minor Heading", BOLD))}`)
  lines.push(`  ${styled("h6", GRAY, DIM)} ${atScale(0.8, styled("Smallest Heading", BOLD, GRAY))}`)
  lines.push("")
  lines.push(`  ${styled("Usage:", DIM)} ${styled('<Heading level={2}>Sub Heading</Heading>', CYAN)}`)
  lines.push("")

  return lines.join("\n")
}

function mixedLayout(): string {
  const lines: string[] = []

  lines.push(styled("  MIXED LAYOUT", BOLD, YELLOW))
  lines.push("")

  // Article-style layout
  lines.push(`  ${atScale(2, styled("Breaking News", BOLD, CYAN))}`)
  lines.push(`  ${atScale(1.5, styled("TypeScript 6.0 Released with Native Terminal UI Support", BOLD))}`)
  lines.push("")
  lines.push(`  ${styled("TOKYO", BOLD, MAGENTA)} ${GRAY}${ITALIC}— In a surprise announcement today,${RESET}`)
  lines.push(`  ${styled("the TypeScript team unveiled native terminal UI", ITALIC)}`)
  lines.push(`  ${styled("primitives built directly into the type system.", ITALIC)}`)
  lines.push("")
  lines.push(
    `  ${atScale(0.5, styled("Photo credit: J. Developer / Terminal Times  |  Published: 2026-04-06  |  Reading time: 3 min", GRAY))}`,
  )
  lines.push("")

  return lines.join("\n")
}

function scaleComparison(): string {
  const lines: string[] = []

  lines.push(styled("  SCALE COMPARISON", BOLD, YELLOW))
  lines.push("")

  const scales = [3, 2.5, 2, 1.5, 1, 0.75, 0.5, 0.25]
  for (const s of scales) {
    const label = `${s}x`.padEnd(5)
    const sample = s >= 1 ? "Aa" : "The quick brown fox"
    lines.push(`  ${styled(label, GRAY, DIM)} ${atScale(s, styled(sample, WHITE))}`)
  }
  lines.push("")

  return lines.join("\n")
}

function codeAnnotations(): string {
  const lines: string[] = []

  lines.push(styled("  CODE WITH ANNOTATIONS", BOLD, YELLOW))
  lines.push("")

  // Simulated code with inline annotations at different sizes
  lines.push(`  ${styled("function", MAGENTA)} ${styled("greet", CYAN)}(name: ${styled("string", GREEN)}) {`)
  lines.push(
    `    ${styled("return", MAGENTA)} ${styled("`Hello, ${name}!`", GREEN)}  ${atScale(0.5, styled("<-- template literal", GRAY, ITALIC))}`,
  )
  lines.push(`  }`)
  lines.push("")
  lines.push(
    `  ${atScale(0.5, styled("Note: This function uses ES6 template literals for string interpolation.", GRAY))}`,
  )
  lines.push(`  ${atScale(0.5, styled("Performance: O(1) — no loop, no allocation beyond the result string.", GRAY))}`)
  lines.push("")

  return lines.join("\n")
}

function terminalSupport(): string {
  const lines: string[] = []
  const supported = isTextSizingLikelySupported()

  lines.push(styled("  TERMINAL SUPPORT", BOLD, YELLOW))
  lines.push("")
  lines.push(
    `  Current terminal: ${
      supported
        ? styled("SUPPORTED", BOLD, GREEN) + styled(" — text sizing should be visible", GREEN)
        : styled("NOT DETECTED", BOLD, YELLOW) + styled(" — text appears at normal size", YELLOW)
    }`,
  )
  lines.push("")
  lines.push(`  ${styled("Supported terminals:", DIM)}`)
  lines.push(`    ${styled("Kitty", WHITE)} v0.40+  ${styled("— full support (scale + width)", GREEN)}`)
  lines.push(`    ${styled("Other terminals silently ignore the escape sequences.", GRAY)}`)
  lines.push("")
  lines.push(`  ${styled("Protocol:", DIM)} ${styled("OSC 66 ; s=<scale> BEL", CYAN)}`)
  lines.push(`  ${styled("API:", DIM)}      ${styled("textScaled(2)", CYAN)} ${styled("// set 2x size", GRAY)}`)
  lines.push(`  ${styled("           ", DIM)} ${styled("resetTextScale()", CYAN)} ${styled("// back to 1x", GRAY)}`)
  lines.push("")

  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const output = [
  banner(),
  headingShowcase(),
  mixedLayout(),
  scaleComparison(),
  codeAnnotations(),
  terminalSupport(),
].join("\n")

process.stdout.write(output)
