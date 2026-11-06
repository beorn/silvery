#!/usr/bin/env bun
/**
 * Validate every bundled scheme.
 *
 * Visibility checks (default) are always on — catches selection/cursor invisibility
 * after derivation. WCAG checks are opt-in — use --wcag for a full contrast audit
 * of bundled themes.
 */
import { loadTheme } from "@silvery/ansi"
import { builtinPalettes } from "@silvery/ansi/schemes/schemes"

const wcag = process.argv.includes("--wcag")
let passed = 0
let failed = 0
const fails: Array<{ name: string; msg: string }> = []

for (const [name, scheme] of Object.entries(builtinPalettes)) {
  try {
    const theme = loadTheme(scheme as never, { enforce: "strict", wcag })
    void theme
    passed++
  } catch (e) {
    failed++
    fails.push({ name, msg: (e as Error).message.slice(0, 800) })
  }
}

console.log(
  `\nBundled scheme validation (${wcag ? "visibility + WCAG" : "visibility only"}): ${passed} passed, ${failed} failed of ${passed + failed}`,
)
if (failed > 0) {
  console.log(`\nFailures:`)
  for (const f of fails) console.log(`\n== ${f.name} ==\n${f.msg}`)
}

process.exit(failed > 0 ? 1 : 0)
