---
title: Capability Tiers
description: How silvery renders color across truecolor, 256-color, ANSI 16, and monochrome terminals.
---

# Capability Tiers

Not every terminal supports 16 million colors. Silvery detects your terminal's capability and renders the same app correctly on all of them — from a modern Ghostty with truecolor + Kitty protocol to a raw `TERM=dumb` shell session.

## The four tiers

| Tier         | Colors      | Example terminals                       | What silvery emits                 |
|--------------|-------------|-----------------------------------------|------------------------------------|
| `truecolor`  | ~16.7M      | Ghostty, Kitty, iTerm2, WezTerm, Alacritty, Windows Terminal, modern xterm | 24-bit hex (SGR 38;2;r;g;b) |
| `256`        | 256         | Older terminals with `COLORTERM` unset  | 256-color indexed (SGR 38;5;n)     |
| `ansi16`     | 16          | Basic terminals, SSH to legacy hosts    | ANSI 16 names (`\e[31m`, `\e[91m`) |
| `mono`       | 0 (attrs)   | `TERM=dumb`, `NO_COLOR`, pipes          | SGR attrs only (bold, inverse, …)  |

Each tier is a correct rendering. A cursor at truecolor is a specific hex color; the same cursor at mono is `inverse` attrs with no color.

## Tier detection

Detection order (highest-priority first):

1. `SILVERY_COLOR` env var — forces `truecolor` / `256` / `ansi16` / `mono` / `auto`
2. `--color-tier=<tier>` CLI flag (if your app exposes it)
3. `NO_COLOR` env var (any value) → `mono`
4. `TERM=dumb` → `mono`
5. `!process.stdout.isTTY` (piped output) → `mono`
6. `COLORTERM=truecolor` or `COLORTERM=24bit` → `truecolor`
7. `TERM` suffix: `*-256color` → `256`; `xterm` → `ansi16`
8. Windows Terminal / ConEmu heuristics
9. Fallback: `ansi16`

## Forced tier (testing, screenshots, debugging)

Set `SILVERY_COLOR` to force a tier:

```bash
SILVERY_COLOR=ansi16  bun run app   # preview how it looks at 16 colors
SILVERY_COLOR=mono    bun run app   # preview monochrome
SILVERY_COLOR=truecolor bun run app # force truecolor even if COLORTERM is missing
```

Great for screenshots, CI snapshots, and verifying graceful degradation without swapping terminals.

## `NO_COLOR` compliance

Silvery respects [no-color.org](https://no-color.org): `NO_COLOR=1` forces monochrome, period. No colors, no 256, no ANSI 16 — only SGR attrs (bold, dim, italic, underline, inverse, strikethrough).

This is an accessibility feature as much as a preference. Users with color vision deficiencies or on read-only terminals get a hierarchical UI via attrs alone.

### Four related-but-distinct modes

| Env / flag        | Effect                                                       |
|-------------------|--------------------------------------------------------------|
| `NO_COLOR=1`      | No color, but attrs (bold, inverse, underline) remain.       |
| `SILVERY_COLOR=mono` | Same as above — the explicit silvery toggle.              |
| `SILVERY_COLOR=plain` | No color AND no attrs — pure text, for piping + scripts. |
| `SILVERY_STRIP_ALL=1` | Strip ALL ANSI output — for logging to plain files.       |

## Monochrome attrs mapping

At the `mono` tier, tokens map to per-token SGR attrs so state and hierarchy stay distinguishable:

| Token       | Attrs                          | Rationale                             |
|-------------|--------------------------------|---------------------------------------|
| `fg`        | `[]` (default)                 | Body text                             |
| `muted`     | `["dim"]`                      | Secondary info                        |
| `disabledfg`| `["dim"]`                      | Inactive                              |
| `primary`   | `["bold"]`                     | Brand emphasis                        |
| `error`     | `["bold", "inverse"]`          | Loudest — danger grabs attention      |
| `warning`   | `["bold"]`                     | Caution                               |
| `success`   | `["bold"]`                     | Confirmation                          |
| `info`      | `["italic"]`                   | Auxiliary                             |
| `link`      | `["underline"]`                | Standard convention                   |
| `inverse`   | `["inverse"]`                  | Direct                                |
| `selectionbg`| `["inverse"]`                 | Visible selection without color       |
| `focusborder`| `["bold"]`                    | Focus chrome                          |

Structural surfaces (`bg`, `mutedbg`, `surfacebg`, `popoverbg`, `border`, `cursorbg`) have no attrs — they represent background planes that mono terminals can't vary.

Look up attrs programmatically:

```ts
import { monoAttrsFor } from "silvery/theme"
const attrs = monoAttrsFor(theme, "error") // → ["bold", "inverse"]
```

## How degradation works

A token's resolved value changes by tier, but the token itself doesn't change:

```tsx
<Text color="$error">Failed</Text>

// truecolor: fg=#D28078 (from scheme.red, ensureContrast-adjusted)
// 256:       fg=203 (closest 256-cube entry to the truecolor value)
// ansi16:    fg="red" (ANSI 16 name)
// mono:      attrs=["bold", "inverse"]  — fg/bg left to cascade
```

Your component code doesn't branch on tier. The renderer handles it.

## Related

- **[Token Taxonomy](./token-taxonomy)** — the full decision tree for every token family
- [Color Schemes](./color-schemes) — the 22-slot scheme model
- [Custom Tokens](./custom-tokens) — ansi16 + attrs fallbacks for brand tokens
- [Styling Guide](./styling) — using tokens in components
