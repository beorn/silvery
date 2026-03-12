#!/usr/bin/env bun
/**
 * chalk-x Storybook - Visual Feature Catalog
 *
 * Renders all chalk-x features for visual inspection.
 * Run: bun vendor/silvery/packages/ansi/src/storybook.ts
 *
 * NOTE: Extended underline styles only render in modern terminals
 * (Ghostty, Kitty, WezTerm, iTerm2). Other terminals will show
 * regular underlines as fallback.
 */

import {
  createTerm,
  curlyUnderline,
  dottedUnderline,
  dashedUnderline,
  doubleUnderline,
  underlineColor,
  styledUnderline,
  hyperlink,
  detectExtendedUnderline,
  displayLength,
  stripAnsi,
} from "./index"

using term = createTerm({ color: "truecolor" })

const divider = "═".repeat(60)
const subDivider = "─".repeat(40)

function section(title: string): void {
  console.log()
  console.log(term.bold.cyan(divider))
  console.log(term.bold.cyan(` ${title}`))
  console.log(term.bold.cyan(divider))
  console.log()
}

function subsection(title: string): void {
  console.log(term.dim(subDivider))
  console.log(term.bold(title))
  console.log()
}

// =============================================================================
// Terminal Info
// =============================================================================

section("Terminal Information")

console.log(` TERM: ${process.env.TERM ?? "(not set)"}`)
console.log(` TERM_PROGRAM: ${process.env.TERM_PROGRAM ?? "(not set)"}`)
console.log(
  ` Extended underline support: ${detectExtendedUnderline() ? term.green("Yes") : term.red("No (fallback mode)")}`,
)
console.log()
console.log(term.dim(" Note: This storybook forces extended mode for display."))
console.log(term.dim(" Your terminal may show fallbacks if not supported."))

// =============================================================================
// Extended Underline Styles
// =============================================================================

section("Extended Underline Styles")

subsection("Comparison with standard underline")

console.log(` Standard:  ${term.underline("regular underline")}`)
console.log(` Double:    ${doubleUnderline("double underline")}`)
console.log(` Curly:     ${curlyUnderline("curly/wavy underline")}`)
console.log(` Dotted:    ${dottedUnderline("dotted underline")}`)
console.log(` Dashed:    ${dashedUnderline("dashed underline")}`)
console.log()

subsection("Side by side")

console.log(
  ` ${term.underline("standard")} | ${doubleUnderline("double")} | ${curlyUnderline("curly")} | ${dottedUnderline("dotted")} | ${dashedUnderline("dashed")}`,
)

// =============================================================================
// Underline Color
// =============================================================================

section("Independent Underline Color")

subsection("Basic colors")

console.log(` Red:    ${underlineColor(255, 0, 0, "error message")}`)
console.log(` Orange: ${underlineColor(255, 165, 0, "warning message")}`)
console.log(` Yellow: ${underlineColor(255, 255, 0, "caution message")}`)
console.log(` Green:  ${underlineColor(0, 255, 0, "success message")}`)
console.log(` Blue:   ${underlineColor(0, 128, 255, "info message")}`)
console.log(` Purple: ${underlineColor(128, 0, 255, "special message")}`)
console.log()

subsection("With text color (independent)")

console.log(` ${term.red(underlineColor(0, 255, 0, "Red text, green underline"))}`)
console.log(` ${term.blue(underlineColor(255, 165, 0, "Blue text, orange underline"))}`)
console.log(` ${term.white(underlineColor(255, 0, 0, "White text, red underline"))}`)

// =============================================================================
// Combined Style + Color
// =============================================================================

section("Combined Style + Color")

subsection("Curly with colors (like spell-check)")

console.log(` Spelling error: ${styledUnderline("curly", [255, 0, 0], "teh")} → the`)
console.log(` Grammar issue:  ${styledUnderline("curly", [0, 128, 255], "alot")} → a lot`)
console.log(` Style warning:  ${styledUnderline("curly", [0, 180, 0], "very unique")} → unique`)
console.log()

subsection("Dotted with colors (embedded content)")

console.log(` From inbox:    ${styledUnderline("dotted", [100, 149, 237], "Review docs")}`)
console.log(` From projects: ${styledUnderline("dotted", [147, 112, 219], "Sprint planning")}`)
console.log()

subsection("Dashed with colors (drafts/tentative)")

console.log(` Draft:     ${styledUnderline("dashed", [128, 128, 128], "WIP: New feature")}`)
console.log(` Tentative: ${styledUnderline("dashed", [169, 169, 169], "Maybe: Refactor auth")}`)

// =============================================================================
// Hyperlinks
// =============================================================================

section("OSC 8 Hyperlinks")

subsection("Basic hyperlinks (click to open in terminal)")

console.log(` Website: ${hyperlink("Google", "https://google.com")}`)
console.log(` File:    ${hyperlink("README.md", "file:///Users/beorn/README.md")}`)
console.log(` Custom:  ${hyperlink("Open in VSCode", "vscode://file/path/to/file")}`)
console.log()

subsection("Styled hyperlinks")

console.log(` Underlined: ${term.underline(hyperlink("Underlined link", "https://example.com"))}`)
console.log(` Colored:    ${term.blue(hyperlink("Blue link", "https://example.com"))}`)
console.log(` Bold:       ${term.bold(hyperlink("Bold link", "https://example.com"))}`)
console.log(
  ` Combined:   ${term.bold.blue.underline(hyperlink("Styled link", "https://example.com"))}`,
)

// =============================================================================
// ANSI Utilities
// =============================================================================

section("ANSI Utilities")

subsection("stripAnsi() - Remove escape codes")

const styled = curlyUnderline("Hello ") + term.bold.red("World")
console.log(` Styled:   "${styled}"`)
console.log(` Stripped: "${stripAnsi(styled)}"`)
console.log()

subsection("displayLength() - Visual character count")

const coloredText = term.red("Red") + " and " + term.blue("Blue")
console.log(` Text:         "${coloredText}"`)
console.log(` string.length: ${coloredText.length}`)
console.log(` displayLength: ${displayLength(coloredText)}`)

// =============================================================================
// Use Cases
// =============================================================================

section("Practical Use Cases")

subsection("IDE-style error highlighting")

console.log(` const ${styledUnderline("curly", [255, 0, 0], "x")} = undefined;`)
console.log(`       ${term.red("^")} ${term.dim("Variable 'x' is declared but never used")}`)
console.log()

subsection("Task manager styling")

console.log(` ${term.green("✓")} ${term.dim.strikethrough("Completed task")}`)
console.log(
  ` ${term.yellow("◐")} ${styledUnderline("curly", [255, 180, 0], "Due today: Submit report")}`,
)
console.log(
  ` ${term.red("○")} ${styledUnderline("curly", [255, 80, 80], "Overdue: Fix critical bug")}`,
)
console.log(` ${term.blue("○")} ${dottedUnderline("Embedded from [[Projects]]")}`)
console.log(` ${term.gray("○")} ${dashedUnderline("Draft: New feature idea")}`)
console.log()

subsection("Documentation with clickable links")

console.log(` See ${hyperlink("API Reference", "https://docs.example.com/api")} for details.`)
console.log(` Implementation in ${hyperlink("src/index.ts", "file:///path/src/index.ts")}`)

// =============================================================================
// Summary
// =============================================================================

section("Summary")

console.log(" chalk-x provides:")
console.log("   • Extended underline styles (curly, dotted, dashed, double)")
console.log("   • Independent underline color (RGB)")
console.log("   • Combined style + color")
console.log("   • OSC 8 hyperlinks")
console.log("   • ANSI utilities (stripAnsi, displayLength)")
console.log("   • Graceful fallback for unsupported terminals")
console.log()
console.log(term.dim(" All features degrade gracefully in basic terminals."))
console.log()
