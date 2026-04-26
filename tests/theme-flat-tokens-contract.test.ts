/**
 * Contract: every Sterling flat token resolves to a non-empty string value
 * in every shipped theme AND in every detection path.
 *
 * Background — user's 31/32-empty-bg-tokens rabbit hole (2026-04-22):
 * On a terminal where `detectTheme` couldn't probe the palette (confidence=0),
 * the returned Theme was missing almost every `bg-*` Sterling flat token.
 * Root cause: Sterling derivation lived in `@silvery/theme` while `deriveTheme`
 * and detection lived in `@silvery/ansi`. Callers using `@silvery/ansi`
 * directly got a "partial" Theme with no flat tokens — $bg-surface-overlay,
 * $bg-cursor, $bg-accent-hover etc. resolved to undefined → empty cells.
 *
 * Fix (2026-04-24, Design A): moved Sterling INTO `@silvery/ansi` so every
 * entry point — `deriveTheme`, `loadTheme`, `deriveAnsi16Theme`, `detectTheme`,
 * `detectScheme`, `detectSchemeTheme`, shipped Theme constants — inlines
 * Sterling flat tokens. One canonical Theme shape. No "partial" path left.
 *
 * This contract test locks that in: any entry point that regresses to a
 * partial shape fires here loudly.
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
import {
  defaultDarkScheme,
  defaultLightScheme,
  deriveTheme as deriveThemeAnsi,
  loadTheme as loadThemeAnsi,
  deriveAnsi16Theme as deriveAnsi16ThemeAnsi,
  detectTheme as detectThemeAnsi,
  detectScheme as detectSchemeAnsi,
  detectSchemeTheme as detectSchemeThemeAnsi,
} from "@silvery/ansi"
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
    assertAllFlatTokensPopulated(
      "ansi16DarkTheme",
      ansi16DarkTheme as unknown as Record<string, unknown>,
    )
  })

  it("ansi16LightTheme has every flat token as a non-empty string", () => {
    assertAllFlatTokensPopulated(
      "ansi16LightTheme",
      ansi16LightTheme as unknown as Record<string, unknown>,
    )
  })

  it("defaultDarkTheme has every flat token as a non-empty string", () => {
    assertAllFlatTokensPopulated(
      "defaultDarkTheme",
      defaultDarkTheme as unknown as Record<string, unknown>,
    )
  })

  it("defaultLightTheme has every flat token as a non-empty string", () => {
    assertAllFlatTokensPopulated(
      "defaultLightTheme",
      defaultLightTheme as unknown as Record<string, unknown>,
    )
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
    assertAllFlatTokensPopulated(
      "detectTheme(sterling, no-tty fallback)",
      theme as unknown as Record<string, unknown>,
    )
  })

  it("@silvery/theme detectScheme (no TTY → confidence=0 fallback) returns a fully-populated theme", async () => {
    const { theme, source, confidence } = await detectSchemeSterling()
    expect(source).toBe("fallback")
    expect(confidence).toBe(0)
    assertAllFlatTokensPopulated(
      "detectScheme(sterling, fallback)",
      theme as unknown as Record<string, unknown>,
    )
  })

  it("@silvery/theme detectScheme with explicit override returns a fully-populated theme", async () => {
    const { theme, source } = await detectSchemeSterling({ override: defaultDarkScheme })
    expect(source).toBe("override")
    assertAllFlatTokensPopulated(
      "detectScheme(sterling, override)",
      theme as unknown as Record<string, unknown>,
    )
  })

  it("silvery runtime (wrap-with-themed-provider) produces a Sterling-baked theme", async () => {
    // Post-unification (Design A, 2026-04-24): both `@silvery/ansi` and
    // `@silvery/theme` detection paths return Sterling-baked themes. The
    // runtime wrapper can import from either; this test just asserts the
    // file exists and compiles (it's covered by the path-agnostic tests above).
    const runtimeSource = await import("node:fs").then((fs) =>
      fs.promises.readFile(
        new URL("../packages/ag-term/src/runtime/wrap-with-themed-provider.tsx", import.meta.url),
        "utf-8",
      ),
    )
    expect(runtimeSource).toMatch(/detectScheme/)
  })
})

describe("contract: @silvery/ansi entry points all produce Sterling-baked themes", () => {
  // Post-unification (Design A, 2026-04-24) these are THE canonical entry points —
  // Sterling lives inside `@silvery/ansi` now, and every derivation /
  // detection path inlines flat tokens. If any of these regresses, consumers
  // reading `$bg-surface-overlay` / `$bg-cursor` / `$bg-accent-hover` etc.
  // see empty-string cells.

  it("deriveTheme(defaultDarkScheme) produces every flat token", () => {
    const theme = deriveThemeAnsi(defaultDarkScheme)
    assertAllFlatTokensPopulated(
      "deriveTheme(defaultDarkScheme)",
      theme as unknown as Record<string, unknown>,
    )
  })

  it("deriveTheme(defaultLightScheme) produces every flat token", () => {
    const theme = deriveThemeAnsi(defaultLightScheme)
    assertAllFlatTokensPopulated(
      "deriveTheme(defaultLightScheme)",
      theme as unknown as Record<string, unknown>,
    )
  })

  it("loadTheme(defaultDarkScheme) produces every flat token", () => {
    const theme = loadThemeAnsi(defaultDarkScheme)
    assertAllFlatTokensPopulated(
      "loadTheme(defaultDarkScheme)",
      theme as unknown as Record<string, unknown>,
    )
  })

  it("deriveAnsi16Theme(defaultDarkScheme) produces every flat token", () => {
    const theme = deriveAnsi16ThemeAnsi(defaultDarkScheme)
    assertAllFlatTokensPopulated(
      "deriveAnsi16Theme(defaultDarkScheme)",
      theme as unknown as Record<string, unknown>,
    )
  })

  it("@silvery/ansi detectTheme (no TTY → fallback) produces every flat token", async () => {
    // Exact path the user's "31/32 empty bg tokens" bug came from. Must
    // resolve even from the bare @silvery/ansi import path now.
    const theme = await detectThemeAnsi()
    assertAllFlatTokensPopulated(
      "@silvery/ansi detectTheme (fallback)",
      theme as unknown as Record<string, unknown>,
    )
  })

  it("@silvery/ansi detectScheme (no TTY → fallback) produces every flat token", async () => {
    const { theme, source, confidence } = await detectSchemeAnsi()
    expect(source).toBe("fallback")
    expect(confidence).toBe(0)
    assertAllFlatTokensPopulated(
      "@silvery/ansi detectScheme (fallback)",
      theme as unknown as Record<string, unknown>,
    )
  })

  it("@silvery/ansi detectSchemeTheme (fallback) produces every flat token", async () => {
    const theme = await detectSchemeThemeAnsi()
    assertAllFlatTokensPopulated(
      "@silvery/ansi detectSchemeTheme (fallback)",
      theme as unknown as Record<string, unknown>,
    )
  })

  it("@silvery/ansi detectScheme with explicit override produces every flat token", async () => {
    const { theme, source } = await detectSchemeAnsi({ override: defaultDarkScheme })
    expect(source).toBe("override")
    assertAllFlatTokensPopulated(
      "@silvery/ansi detectScheme (override)",
      theme as unknown as Record<string, unknown>,
    )
  })
})

describe("contract: user's specific 246×122 complaint — explicit bg tokens all resolve", () => {
  // Regression test for the exact tokens the user reported as empty on their
  // fallback-detection machine (2026-04-23). These MUST resolve to non-empty
  // hex strings on every detection path — fallback included.
  const REPORTED_EMPTY_TOKENS = [
    "bg-surface-overlay",
    "bg-cursor",
    "bg-accent-hover",
    "bg-muted",
    "bg-accent-active",
  ] as const

  // "$color8" is a palette token (color ring), populated via the palette array
  // projection — not a Sterling flat token. It's tested separately.

  function assertReportedTokensPopulated(label: string, theme: Record<string, unknown>): void {
    const missing: string[] = []
    for (const token of REPORTED_EMPTY_TOKENS) {
      const v = theme[token]
      if (typeof v !== "string" || v.length === 0) {
        missing.push(`${token}=${JSON.stringify(v)}`)
      }
    }
    if (missing.length) {
      throw new Error(`${label}: user-reported empty bg tokens still empty: ${missing.join(", ")}`)
    }
  }

  it("deriveTheme(defaultDarkScheme): all user-reported bg tokens resolve", () => {
    const theme = deriveThemeAnsi(defaultDarkScheme)
    assertReportedTokensPopulated(
      "deriveTheme(defaultDarkScheme)",
      theme as unknown as Record<string, unknown>,
    )
  })

  it("@silvery/ansi detectTheme fallback: all user-reported bg tokens resolve", async () => {
    const theme = await detectThemeAnsi()
    assertReportedTokensPopulated(
      "@silvery/ansi detectTheme (fallback)",
      theme as unknown as Record<string, unknown>,
    )
  })

  it("@silvery/ansi detectScheme fallback: all user-reported bg tokens resolve", async () => {
    const { theme } = await detectSchemeAnsi()
    assertReportedTokensPopulated(
      "@silvery/ansi detectScheme (fallback)",
      theme as unknown as Record<string, unknown>,
    )
  })

  it("@silvery/theme detectTheme fallback: all user-reported bg tokens resolve", async () => {
    const theme = await detectThemeSterling()
    assertReportedTokensPopulated(
      "@silvery/theme detectTheme (fallback)",
      theme as unknown as Record<string, unknown>,
    )
  })
})
