/**
 * Contract: every Sterling flat token resolves to a non-empty string value
 * in every shipped theme AND in every fallback path.
 *
 * Background — user's 31/32-empty-bg-tokens rabbit hole (2026-04-22):
 * On a terminal where `detectTheme` couldn't probe the palette (confidence=0),
 * the returned Theme was missing almost every `bg-*` Sterling flat token. The
 * two paths where this can still leak:
 *
 *   1. `@silvery/ansi`'s `detectTheme` / orchestrator's fallback branch returns
 *      a theme _without_ running `inlineSterlingTokens`. Callers who use
 *      `@silvery/ansi` directly (not the `@silvery/theme` wrapper) get a Theme
 *      with no flat tokens at all.
 *   2. The shipped `ansi16DarkTheme` / `ansi16LightTheme` / `defaultDarkTheme` /
 *      `defaultLightTheme` from `@silvery/theme/schemes` DO bake Sterling flats
 *      in. These are the source of truth for `getActiveTheme()` fallback.
 *
 * This contract test locks (2) in place — and will regress loudly if anyone
 * re-introduces a partial shape. For (1), see the Sterling-aware detect
 * wrappers in packages/theme/src/detect.ts which the pipeline uses.
 *
 * Tracking bead: km-silvery.fallback-theme-empty-bg-tokens.
 */

import { describe, expect, it } from "vitest"
import {
  ansi16DarkTheme,
  ansi16LightTheme,
  defaultDarkTheme,
  defaultLightTheme,
  builtinThemes,
  getThemeByName,
  STERLING_FLAT_TOKENS,
} from "@silvery/theme"
import { defaultDarkScheme } from "@silvery/ansi"
import {
  detectScheme as detectSchemeSterling,
  detectTheme as detectThemeSterling,
} from "@silvery/theme"

function assertAllFlatTokensPopulated(themeName: string, theme: Record<string, unknown>): void {
  const missing: string[] = []
  const empty: string[] = []
  for (const token of STERLING_FLAT_TOKENS) {
    const v = theme[token]
    if (v === undefined) {
      missing.push(token)
    } else if (typeof v !== "string") {
      empty.push(`${token} (not a string: ${typeof v})`)
    } else if (v.length === 0) {
      empty.push(`${token} (empty string)`)
    }
  }
  if (missing.length || empty.length) {
    const report = [
      `Theme "${themeName}" violates the Sterling flat-token contract:`,
      ...(missing.length ? [`  missing (${missing.length}): ${missing.join(", ")}`] : []),
      ...(empty.length ? [`  empty/invalid (${empty.length}): ${empty.join(", ")}`] : []),
    ].join("\n")
    throw new Error(report)
  }
}

describe("contract: Sterling flat tokens populated in shipped themes", () => {
  it("ansi16DarkTheme has every flat token as a non-empty string", () => {
    assertAllFlatTokensPopulated("ansi16DarkTheme", ansi16DarkTheme as unknown as Record<string, unknown>)
  })

  it("ansi16LightTheme has every flat token as a non-empty string", () => {
    assertAllFlatTokensPopulated("ansi16LightTheme", ansi16LightTheme as unknown as Record<string, unknown>)
  })

  it("defaultDarkTheme has every flat token as a non-empty string", () => {
    assertAllFlatTokensPopulated("defaultDarkTheme", defaultDarkTheme as unknown as Record<string, unknown>)
  })

  it("defaultLightTheme has every flat token as a non-empty string", () => {
    assertAllFlatTokensPopulated("defaultLightTheme", defaultLightTheme as unknown as Record<string, unknown>)
  })

  it("every builtin theme has every flat token populated", () => {
    for (const [name, theme] of Object.entries(builtinThemes)) {
      assertAllFlatTokensPopulated(name, theme as unknown as Record<string, unknown>)
    }
  })

  it("getThemeByName('default-dark') returns a fully-populated theme", () => {
    const theme = getThemeByName("default-dark")
    expect(theme).toBeDefined()
    assertAllFlatTokensPopulated("default-dark", theme as unknown as Record<string, unknown>)
  })
})

describe("contract: Sterling flat tokens populated through every detection path", () => {
  it("@silvery/theme detectTheme (no TTY → pure fallback) returns a fully-populated theme", async () => {
    // In vitest there's no TTY, so probeColors returns null → detectTheme hits
    // the pure-fallback branch. This is the exact path the user's "31/32 empty"
    // symptom came from — it must produce a Sterling-baked theme.
    const theme = await detectThemeSterling()
    assertAllFlatTokensPopulated("detectTheme(sterling, no-tty fallback)", theme as unknown as Record<string, unknown>)
  })

  it("@silvery/theme detectScheme (no TTY → confidence=0 fallback) returns a fully-populated theme", async () => {
    const { theme, source, confidence } = await detectSchemeSterling()
    expect(source).toBe("fallback")
    expect(confidence).toBe(0)
    assertAllFlatTokensPopulated("detectScheme(sterling, fallback)", theme as unknown as Record<string, unknown>)
  })

  it("@silvery/theme detectScheme with explicit override returns a fully-populated theme", async () => {
    const { theme, source } = await detectSchemeSterling({ override: defaultDarkScheme })
    expect(source).toBe("override")
    assertAllFlatTokensPopulated("detectScheme(sterling, override)", theme as unknown as Record<string, unknown>)
  })

  it("silvery runtime (wrap-with-themed-provider) uses the Sterling-aware path", async () => {
    // Sanity: the runtime's `wrap-with-themed-provider.tsx` imports `detectScheme`
    // from `@silvery/theme`, NOT `@silvery/ansi`. If it ever goes back to
    // importing from `@silvery/ansi` directly, the fallback-branch Theme loses
    // its Sterling flat tokens and every `$bg-*` token paints empty cells.
    const runtimeSource = await import("node:fs").then((fs) =>
      fs.promises.readFile(
        new URL(
          "../packages/ag-term/src/runtime/wrap-with-themed-provider.tsx",
          import.meta.url,
        ),
        "utf-8",
      ),
    )
    // The canonical import line — if this assertion fires, someone reverted to
    // the non-Sterling path. Read packages/theme/src/detect.ts for why that's a bug.
    expect(runtimeSource).toMatch(/from "@silvery\/theme"/)
    expect(runtimeSource).not.toMatch(/import {\s*detectScheme[^}]*}\s*from\s*"@silvery\/ansi"/s)
  })
})
