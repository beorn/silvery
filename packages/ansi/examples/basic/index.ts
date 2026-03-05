/**
 * Basic usage example for @hightea/ansi
 *
 * Run with: bun examples/basic/index.ts
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
} from "../../src/index.js"

using term = createTerm()

console.log("@hightea/ansi Basic Example\n")
console.log("=".repeat(50))

// Terminal detection
console.log("\n📊 Terminal Detection:")
console.log(`Extended underline support: ${detectExtendedUnderline() ? "✓ Yes" : "✗ No (will use fallbacks)"}`)

// Term styling
console.log("\n🎨 Term Styling:")
console.log(term.red("  Red text"))
console.log(term.bold.blue("  Bold blue text"))
console.log(term.bgYellow.black("  Black text on yellow background"))

// Extended underline styles
console.log("\n📝 Extended Underline Styles:")
console.log(`  Standard:  ${term.underline("standard underline")}`)
console.log(`  Curly:     ${curlyUnderline("curly/wavy underline")}`)
console.log(`  Dotted:    ${dottedUnderline("dotted underline")}`)
console.log(`  Dashed:    ${dashedUnderline("dashed underline")}`)
console.log(`  Double:    ${doubleUnderline("double underline")}`)

// Underline color
console.log("\n🌈 Underline Color:")
console.log(`  Red underline:   ${underlineColor(255, 0, 0, "text with red underline")}`)
console.log(`  Green underline: ${underlineColor(0, 255, 0, "text with green underline")}`)
console.log(`  Blue underline:  ${underlineColor(0, 100, 255, "text with blue underline")}`)

// Combined style + color
console.log("\n✨ Combined Style + Color:")
console.log(`  Curly red:   ${styledUnderline("curly", [255, 0, 0], "curly red underline")}`)
console.log(`  Dashed blue: ${styledUnderline("dashed", [0, 100, 255], "dashed blue underline")}`)

// Hyperlinks
console.log("\n🔗 Hyperlinks (click in supporting terminals):")
console.log(`  ${hyperlink("GitHub", "https://github.com")}`)
console.log(`  ${hyperlink("Anthropic", "https://anthropic.com")}`)

// Combining with term styling
console.log("\n🎯 Combining with Term Styling:")
console.log(term.red(`  ${curlyUnderline("Error:")} Something went wrong`))
console.log(term.yellow(`  ${dashedUnderline("Warning:")} This is deprecated`))
console.log(term.blue(`  ${hyperlink("Click for docs", "https://example.com/docs")}`))

console.log("\n" + "=".repeat(50))
console.log("Note: Extended styles fall back to standard underline on unsupported terminals.")
