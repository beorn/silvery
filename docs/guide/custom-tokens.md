---
title: Custom Tokens
description: Extend silvery's theme with app-specific semantic tokens or brand colors.
---

# Custom Tokens

Silvery's built-in tokens (`$primary`, `$muted`, `$success`, …) cover semantic UI roles. For app-specific needs — priority levels, category colors, brand identity — define your own tokens via `defineTokens()`.

## Two kinds of custom tokens

### Derivation tokens — follow the scheme

Use when the token should shift when the theme changes. Tokens are computed from the active `ColorScheme` + derived `Theme` at resolution time.

```ts
import { defineTokens, blend } from "silvery/theme"

const appTokens = defineTokens({
  "$priority-p0": { derive: (scheme) => scheme.brightRed },
  "$priority-p1": { derive: (_s, theme) => blend(theme.warning, theme.bg, 0.2) },
  "$priority-p2": { derive: (_s, theme) => theme.muted },
})
```

Use for: priority levels, status subtypes, category-specific accents, any token that should adapt to the user's chosen scheme.

### Brand tokens — fixed rgb + required fallbacks

Use when the token is part of your app's identity and must never drift. Carries an `ansi16` fallback (required) so it still renders at low-color tiers, and optional `attrs` for monochrome.

```ts
const brandTokens = defineTokens({
  "$km-brand": {
    rgb: "#5B8DEF",
    ansi16: "brightBlue",
    attrs: ["bold"],  // monochrome
  },
  "$km-logo": {
    rgb: "#9FB7C9",
    ansi16: "cyan",
  },
})
```

Use for: logos, signature chrome, anything branded. Don't use for body text, state colors, or selection/cursor/borders — prefer derivation for those.

## Naming conventions

- Every custom token key starts with `$`
- Use `$<app>-<role>` namespacing to avoid conflicts when multiple packages define tokens
- Don't reuse built-in token names (`$fg`, `$primary`, `$error`, etc.) — silvery throws

## Validation rules

`defineTokens()` is strict — invalid declarations throw `CustomTokenError` at registration:

```ts
// ❌ Missing $ prefix
defineTokens({ priority: { derive: () => "#FF0000" } })
// CustomTokenError: must begin with "$"

// ❌ Collides with built-in
defineTokens({ "$fg": { rgb: "#FF0000", ansi16: "red" } })
// CustomTokenError: collides with built-in Theme token "fg"

// ❌ Mixed derive + rgb
defineTokens({ "$mixed": { derive: () => "#F00", rgb: "#0F0", ansi16: "red" } })
// CustomTokenError: pick one

// ❌ Brand without ansi16
defineTokens({ "$naked": { rgb: "#5B8DEF" } })
// CustomTokenError: requires an 'ansi16' fallback

// ✅ All valid
defineTokens({
  "$priority-p0": { derive: (s) => s.brightRed },
  "$km-brand": { rgb: "#5B8DEF", ansi16: "brightBlue" },
})
```

## Resolving at runtime

`resolveCustomToken(key, registry, scheme, theme, tier)` looks up a token's concrete value for the current rendering tier:

```ts
import { resolveCustomToken } from "silvery/theme"

// Derivation token — tier-independent hex
resolveCustomToken("$priority-p0", appTokens, scheme, theme, "truecolor")
// → "#E09389" (scheme.brightRed at this scheme)

// Brand token — tier-aware
resolveCustomToken("$km-brand", brandTokens, scheme, theme, "truecolor")
// → "#5B8DEF"
resolveCustomToken("$km-brand", brandTokens, scheme, theme, "ansi16")
// → "brightBlue"
resolveCustomToken("$km-brand", brandTokens, scheme, theme, "mono")
// → ["bold"]
```

## Integrating with components

Silvery's theme-aware components (`Text`, `Box`, etc.) resolve `$tokens` automatically. Register your custom tokens with the theme provider and they become available in JSX:

```tsx
<ThemeProvider theme={theme} customTokens={appTokens}>
  <Text color="$priority-p0">High priority</Text>
  <Box backgroundColor="$km-brand">
    <Text color="$km-brand-fg">Branded chrome</Text>
  </Box>
</ThemeProvider>
```

Note: `ThemeProvider`'s `customTokens` prop wiring is currently part of the design system roadmap. See the [implementation status](https://github.com/beorn/silvery/issues/km-silvery.theme-custom) for progress; today, resolve manually via `resolveCustomToken()` in your component code.

## Anti-patterns

- **Don't re-declare built-in tokens with custom logic.** Override by composing a new theme instead.
- **Don't ship a brand token without an ansi16 fallback.** Apps running in SSH sessions or legacy terminals will drop your color entirely.
- **Don't mix derivation + brand for the same token.** Pick one — either you want the token to follow the scheme (derive) or you don't (rgb).
- **Don't use `$<role>` without a namespace in shared libraries.** `$brand` from package A and package B will collide.

## Related

- **[Token Taxonomy](./token-taxonomy)** — decision tree for picking the right built-in token before reaching for `defineTokens()`
- [Color Schemes](./color-schemes) — what `scheme` + `theme` arguments carry
- [Capability Tiers](./capability-tiers) — how tiers resolve to rgb / ansi16 / attrs
- [Styling Guide](./styling) — built-in tokens and when to use them
