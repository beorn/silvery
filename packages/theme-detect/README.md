# @silvery/theme-detect

Framework-agnostic terminal color scheme detection. Adopt the user's terminal theme in any TUI/CLI — no silvery dependency beyond the tiny `@silvery/color` and `@silvery/ansi` primitives.

```bash
npm install @silvery/theme-detect
```

## What it does

Terminal emulators expose up to 22 colors via OSC escape queries: 16 ANSI slots + foreground, background, cursor, selection. `@silvery/theme-detect` probes the terminal, matches the result against a catalog of known schemes, and returns a fully-resolved theme with WCAG + visibility invariants.

### One-call boot

```ts
import { detectScheme } from "@silvery/theme-detect"
import { builtinPalettes } from "@silvery/theme/schemes"

const { theme, scheme, source, matchedName, confidence } = await detectScheme({
  catalog: Object.values(builtinPalettes),
})

console.log(`Terminal: ${matchedName ?? source} (${(confidence * 100).toFixed(0)}%)`)
// → "Terminal: dracula (98%)" or "Terminal: probed (50%)" or "Terminal: fallback (0%)"
```

`detectScheme()` runs the full 4-layer cascade: explicit override → OSC probe → fingerprint match against catalog → fallback. Returns provenance metadata so you can log how the theme was determined.

### Theme-only shortcut

```ts
import { detectTheme } from "@silvery/theme-detect"

const theme = await detectTheme()
// theme.primary, theme.muted, theme.error — all resolved hex strings
// ready to use in any rendering pipeline
```

## What you get

### OSC probing

```ts
import { detectTerminalScheme } from "@silvery/theme-detect"

const scheme = await detectTerminalScheme(150 /* timeoutMs */)
// → { fg, bg, ansi: [...16], dark, palette: Partial<ColorScheme> }
```

Probes OSC 10/11 (fg/bg), OSC 4 ×16 (ANSI slots), OSC 12 (cursor), OSC 17/19 (selection). Gracefully degrades — any slot the terminal doesn't report comes back `null`.

### Fingerprint matching

```ts
import { fingerprintMatch, fingerprintCandidates } from "@silvery/theme-detect"

const match = fingerprintMatch(probedSlots, myCatalog)
// → { scheme, sumDeltaE, maxDeltaE, confidence } | null

const top = fingerprintCandidates(probedSlots, myCatalog).slice(0, 3)
// → top 3 matches, sorted ascending by OKLCH ΔE
```

Match criteria: `sumΔE < 30` **AND** `maxPerSlotΔE < 8`. The per-slot check prevents false positives from outlier colors.

### Theme derivation + validation

```ts
import { loadTheme, validateThemeInvariants } from "@silvery/theme-detect"

const theme = loadTheme(scheme, { enforce: "strict", wcag: true })
// Throws ThemeInvariantError if WCAG AA or visibility fails

const audit = validateThemeInvariants(theme, { wcag: true })
// → { ok, violations: [{ rule, actual, required, message }, …] }
```

### Monochrome fallback

```ts
import { monoAttrsFor } from "@silvery/theme-detect"

const attrs = monoAttrsFor(theme, "error")
// → ["bold", "inverse"] — per-token SGR attrs for NO_COLOR / TERM=dumb
```

### Custom tokens

```ts
import { defineTokens } from "@silvery/theme-detect"

const tokens = defineTokens({
  "$priority-p0": { derive: (s) => s.brightRed },
  "$app-brand": { rgb: "#5B8DEF", ansi16: "brightBlue", attrs: ["bold"] },
})
```

## API

Full API at [silvery.dev/guide/color-schemes](https://silvery.dev/guide/color-schemes).

## License

MIT — Bjørn Stabell
