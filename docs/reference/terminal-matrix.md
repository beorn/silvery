# Terminal Compatibility Matrix

_Terminal capabilities last verified: 2026-05._

Comprehensive reference of terminal emulator feature support across the 13
protocols Silvery emits, probes, or relies on. Covers 22 terminal emulators
plus 2 multiplexers, grounded in vendor docs, [terminfo.dev](https://terminfo.dev)
probe results, and Silvery's own runtime detection.

> **Cross-reference for GAP 4 (capability probes):**
> `packages/ag-term/src/capability-probes.ts` implements runtime detection for
> OSC 10/11/52/5522, CSI 1016, Kitty graphics, and Kitty keyboard. When the
> matrix below says "Yes" but `probeXxx()` returns `false`, trust the probe —
> environment heuristics can be wrong, runtime responses cannot. See
> [Terminal Capabilities](./terminal-capabilities.md) for the per-protocol
> probe sequences.

## How to read this matrix

| Symbol | Meaning                                                            |
| ------ | ------------------------------------------------------------------ |
| Yes    | Documented support, probe-confirmed where Silvery can probe.       |
| Part   | Partial support — see the per-terminal notes below for caveats.    |
| Conf   | Conditional — works only with configuration / outer terminal.      |
| No     | Documented unsupported or actively swallowed without effect.       |
| ?      | Unknown — no authoritative source; treat as unsupported in code.   |

**Probes can lie.** Several protocols (CSI 1003/1006/1016, DECSET 2004/2026,
DECSET 1004, OSC 8) are "fire-and-forget" — the terminal silently accepts the
sequence whether or not it implements the behavior. terminfo.dev marks these
features with `probeStatus: "partial"`. The values below prefer **documented
behavior** over `partial` probe results when they disagree.

## The 13 protocols

| # | Protocol     | Sequence (canonical form)                       | What it does                                       |
|---|--------------|-------------------------------------------------|----------------------------------------------------|
| 1 | Truecolor    | `CSI 38;2;R;G;Bm` / `CSI 48;2;R;G;Bm` (SGR)    | 24-bit RGB foreground / background.                |
| 2 | OSC 10/11/12 | `OSC 10 ; ? BEL` (query fg/bg/cursor color)    | Query terminal default colors for theming.         |
| 3 | OSC 8        | `OSC 8 ; ; <uri> ST <text> OSC 8 ; ; ST`       | Clickable hyperlinks.                              |
| 4 | OSC 52       | `OSC 52 ; c ; <base64> BEL`                    | System-clipboard read/write (SSH-transparent).     |
| 5 | OSC 5522     | `OSC 5522 ; ...`                               | Kitty advanced clipboard (MIME-typed, async).      |
| 6 | OSC 66       | `OSC 66 ; w=N ; <text> BEL`                    | Text sizing — author-declared cell width.          |
| 7 | Kitty Gfx    | `APC G key=value... ; <base64> ST`             | Kitty graphics protocol (inline images).           |
| 8 | Kitty Kbd    | `CSI > <flags> u` (push), `CSI < u` (pop)      | Disambiguated key reporting (Cmd/Hyper, releases). |
| 9 | CSI 1003     | `CSI ? 1003 h` / `l`                           | All-event mouse tracking (motion, drag, scroll).   |
| 10 | CSI 1006     | `CSI ? 1006 h` / `l`                           | SGR-encoded mouse coordinates (cell-precise).      |
| 11 | CSI 1016     | `CSI ? 1016 h` / `l`                           | SGR-Pixels mouse mode (sub-cell precision).        |
| 12 | DEC 2004     | `CSI ? 2004 h` / `l`                           | Bracketed paste — distinguish pasted from typed.   |
| 13 | DEC 2026     | `CSI ? 2026 h` / `l`                           | Synchronized output — atomic screen updates.       |
| 14 | DEC 1004     | `CSI ? 1004 h` / `l`                           | Focus-in / focus-out reporting.                    |
| 15 | Sixel        | `DCS q ...`                                    | Sixel inline graphics (legacy alternative to Kitty).|

(15 columns; the bead bills this as "10 protocols" but we expose every column
Silvery touches in production. Truecolor and Sixel are included for context;
they aren't probed but they shape which other capabilities matter.)

## The 22+ terminals × 15 protocols matrix

Rows are sorted by family (GPU-modern → traditional → multiplexer → embedded → legacy).
A trailing footnote marker (e.g. `Yes¹`) points to a numbered note in the
**Terminal notes** section.

| Terminal             | Truecolor | OSC 10/11/12 | OSC 8 | OSC 52 | OSC 5522 | OSC 66 | Kitty Gfx | Kitty Kbd | CSI 1003 | CSI 1006 | CSI 1016 | DEC 2004 | DEC 2026 | DEC 1004 | Sixel |
| -------------------- | --------- | ------------ | ----- | ------ | -------- | ------ | --------- | --------- | -------- | -------- | -------- | -------- | -------- | -------- | ----- |
| Ghostty              | Yes       | Yes          | Yes   | Yes    | Part¹    | Yes    | Yes       | Yes       | Yes      | Yes      | Yes      | Yes      | Yes      | Yes      | No    |
| Kitty                | Yes       | Yes          | Yes   | Yes    | Yes      | Yes²   | Yes       | Yes       | Yes      | Yes      | Yes      | Yes      | Yes      | Yes      | No    |
| WezTerm              | Yes       | Yes          | Yes   | Yes    | No       | No     | No        | Yes       | Yes      | Yes      | Yes      | Yes      | Yes      | Yes      | Yes   |
| iTerm2               | Yes       | Yes          | Yes   | Yes    | No       | No     | No        | No³       | Yes      | Yes      | Yes      | Yes      | Yes      | Yes      | No    |
| Alacritty            | Yes       | Yes          | Yes   | Yes    | No       | No     | No        | No        | Yes      | Yes      | No       | Yes      | Yes⁴     | Yes      | No    |
| foot                 | Yes       | Yes          | Yes   | Yes    | No       | No     | No        | Yes       | Yes      | Yes      | Yes      | Yes      | Yes      | Yes      | Yes   |
| Contour              | Yes       | Yes          | Yes   | Yes    | No       | No     | No        | Yes       | Yes      | Yes      | Yes      | Yes      | Yes      | Yes      | Yes   |
| Rio                  | Yes       | Yes          | Yes   | Yes    | No       | No     | No        | Yes       | Yes      | Yes      | ?        | Yes      | Yes      | Yes      | Yes   |
| Warp                 | Yes       | Yes          | Yes   | Yes    | No       | No     | No        | Yes       | Yes      | Yes      | ?        | Yes      | Yes      | Yes      | No    |
| Tabby                | Yes       | Yes          | Yes   | Yes⁵   | No       | No     | No        | No        | Yes      | Yes      | ?        | Yes      | ?        | Yes      | No    |
| Hyper                | Yes       | Yes⁶         | Yes   | Yes⁶   | No       | No     | No        | No        | Yes      | Yes      | No       | Yes      | No       | Yes      | No    |
| xterm                | Yes⁷      | Yes          | No    | Yes    | No       | No     | No        | Yes⁸      | Yes      | Yes      | Yes      | Yes      | No       | Yes      | Yes⁹  |
| gnome-terminal (VTE) | Yes       | Yes          | Yes   | Conf¹⁰ | No       | No     | No        | No        | Yes      | Yes      | No       | Yes      | Yes¹¹    | Yes      | Yes¹² |
| Konsole              | Yes       | Yes          | Yes   | Conf¹⁰ | No       | No     | No        | No        | Yes      | Yes      | No       | Yes      | Yes¹¹    | Yes      | Yes¹³ |
| Terminal.app         | No¹⁴      | Part¹⁵       | No    | No     | No       | No     | No        | No        | Yes      | Yes      | No       | Yes      | No       | Yes      | No    |
| mlterm               | Yes       | Yes          | Yes   | Yes    | No       | No     | No        | No        | Yes      | Yes      | No       | Yes      | No       | Yes      | Yes   |
| st (suckless)        | Yes¹⁶     | Yes          | No¹⁷  | No¹⁷   | No       | No     | No        | No        | Yes      | Yes      | No       | Yes      | No       | No       | Conf¹⁸|
| urxvt                | No¹⁹      | Yes          | No    | Conf²⁰ | No       | No     | No        | No        | Yes      | Yes      | No       | Yes      | No       | No       | No    |
| Windows Terminal     | Yes       | Yes          | Yes   | Yes    | No       | No     | No        | No²¹      | Yes      | Yes      | No       | Yes      | Yes      | Yes      | Yes²² |
| mintty (Git Bash)    | Yes       | Yes          | Yes   | Yes    | No       | No     | No        | No        | Yes      | Yes      | No       | Yes      | No       | Yes      | Yes   |
| ConEmu / Cmder       | Yes²³     | Part         | Part  | No     | No       | No     | No        | No        | Yes      | Yes      | No       | Yes      | No       | Yes      | No    |
| VS Code (xterm.js)   | Yes       | Yes          | Yes   | Yes²⁴  | No       | No     | No        | No        | Yes      | Yes      | No       | Yes      | No       | Yes      | Yes²⁵ |
| **tmux** (multiplex) | Conf²⁶    | Conf²⁶       | Yes²⁷ | Conf²⁸ | No       | No     | Conf²⁹    | Part³⁰    | Yes      | Yes      | Conf²⁹   | Yes      | Yes³¹    | Yes      | Conf²⁹|
| **GNU Screen**       | Conf³²    | Conf         | No    | No     | No       | No     | No        | No        | Yes      | Yes      | No       | Yes      | No       | Part³³   | No    |

### Terminal notes

1. **Ghostty OSC 5522** — parser accepts the sequence; clipboard operation is not yet fully wired up (per upstream issue tracker). Silvery's probe will see a response and treat the terminal as supporting OSC 5522, but rich-MIME paste may fall through to OSC 52. Watch upstream.
2. **Kitty OSC 66** — supported in Kitty 0.40+. Older versions return no response; Silvery's probe gates the feature correctly.
3. **iTerm2 Kitty keyboard** — iTerm2 ships its own modifier-reporting extensions but does not implement the Kitty keyboard protocol. `useModifierKeys()` will not see ⌘ / ✦ releases under iTerm2.
4. **Alacritty DEC 2026** — added in 0.14 (2024). Earlier versions ignore the sequence (harmless, never set/reset).
5. **Tabby OSC 52** — supported via xterm.js backend.
6. **Hyper OSC 10/11/12 + OSC 52** — supported via underlying xterm.js since 3.x.
7. **xterm truecolor** — requires `xterm*256color` + `XTERM_TRUE_COLOR=1` in some builds; emits truecolor SGRs but quantizes to the 256-color cube unless the terminfo carries `RGB`.
8. **xterm Kitty keyboard** — supported since patch 391 (2024) via `XTQModKeys` mode. Older xterms have legacy modifier extensions only.
9. **xterm Sixel** — opt-in build flag (`--enable-sixel-graphics`).
10. **VTE OSC 52 (gnome-terminal, Konsole)** — disabled by default for security; user must enable via `dconf` (gnome) or profile setting (Konsole). Silvery's probe correctly returns false until enabled.
11. **VTE DEC 2026 (gnome-terminal, Konsole)** — supported in VTE 0.68+ (2022) and Konsole 22.04+. Earlier versions ignore the sequence.
12. **VTE Sixel** — supported in VTE 0.66+ behind a profile setting.
13. **Konsole Sixel** — supported in Konsole 22.04+.
14. **Terminal.app truecolor** — only 256-color. Truecolor SGRs are quantized to the nearest 256-cube entry.
15. **Terminal.app OSC 10/11/12 query** — fg/bg only; cursor color (OSC 12) returns no response.
16. **st truecolor** — patch-dependent. Stock st is 256-color; the official `st-truecolor` patch enables 24-bit.
17. **st OSC 8 / OSC 52** — stock st has no built-in support; patches exist (`st-osc8-hyperlinks`, `st-clipboard`) but are not part of the default build.
18. **st Sixel** — only with the `st-sixel` patch.
19. **urxvt truecolor** — never merged upstream; some forks include a truecolor patch.
20. **urxvt OSC 52** — disabled by default; requires the `clipboard` Perl extension.
21. **Windows Terminal Kitty keyboard** — tracking upstream proposal; not implemented as of v1.20.
22. **Windows Terminal Sixel** — supported since v1.22 (2024).
23. **ConEmu truecolor** — partial; requires recent build and ANSI parser settings.
24. **VS Code OSC 52** — supported but gated by `terminal.integrated.enableMultiLinePasteWarning` and profile settings.
25. **VS Code Sixel** — supported in xterm.js 5.x with `terminal.integrated.enableImages` set.
26. **tmux truecolor + OSC 10/11/12** — requires `set -as terminal-features ",*:RGB"` (or equivalent) and a truecolor-capable outer terminal.
27. **tmux OSC 8** — supported since tmux 3.4.
28. **tmux OSC 52** — supported when `set -g set-clipboard on` (or `external`). Disabled by default in modern tmux.
29. **tmux Kitty graphics / CSI 1016 / Sixel** — tmux does not natively support these; passes through only via tmux's `Pt` DCS pass-through (`\ePtmux;ESC...\e\\`), which is fragile and not enabled by default.
30. **tmux Kitty keyboard** — partial support since tmux 3.5; releases and `REPORT_ALL_KEYS` may not pass through cleanly.
31. **tmux DEC 2026** — supported since tmux 3.2 (the synchronized-output proposal originated here).
32. **screen truecolor** — requires explicit `truecolor on` config plus a 24-bit-capable outer terminal. Stock GNU Screen quantizes to 256.
33. **screen DEC 1004** — limited / patch-dependent; mainstream releases do not pass focus events through.

## Per-terminal pen portraits

The matrix is the source of truth. The pen portraits below give the additional
context Silvery's runtime cares about: detection env vars, version floor where
relevant, and any kept-quirk.

### Modern GPU terminals

#### Ghostty
- **Env**: `TERM_PROGRAM=ghostty`, `COLORTERM=truecolor`, `__CFBundleIdentifier=com.mitchellh.ghostty` (macOS).
- **Strengths**: Best-in-class standards compliance — Kitty kbd + gfx, OSC 8, OSC 66 text sizing, DEC 2026, full Kitty graphics. Excellent grapheme + emoji width handling.
- **Quirks**: OSC 5522 parsed but not fully wired up yet. No Sixel (Kitty graphics covers the inline-image use case).

#### Kitty
- **Env**: `TERM=xterm-kitty`, `COLORTERM=truecolor`, `KITTY_WINDOW_ID` present.
- **Strengths**: Originator of the Kitty keyboard, Kitty graphics, and OSC 5522 protocols. Full implementation of all three.
- **Quirks**: OSC 66 only in 0.40+. Despite the name, Kitty does also support Sixel since 0.20.

#### WezTerm
- **Env**: `TERM_PROGRAM=WezTerm`, `WEZTERM_EXECUTABLE` set.
- **Strengths**: Kitty keyboard, Sixel, iTerm2 image protocol (in addition). Cross-platform (macOS / Linux / Windows).
- **Quirks**: No Kitty graphics — uses iTerm2 + Sixel for inline images. No OSC 66.

#### Alacritty
- **Env**: `TERM_PROGRAM=Alacritty`, `ALACRITTY_WINDOW_ID` set.
- **Strengths**: Truecolor, OSC 52, bracketed paste, focus reporting, DEC 2026 (0.14+).
- **Quirks**: Deliberately minimalist — no Kitty kbd/gfx, no Sixel, no OSC 8 prior to 0.13, no CSI 1016. Performance-first.

#### foot
- **Env**: `TERM=foot` or `foot-extra`, `COLORTERM=truecolor`.
- **Strengths**: Wayland-native, fast, Kitty keyboard, Sixel, OSC 52. Excellent standards compliance for its size.
- **Quirks**: Wayland-only (no X11 / macOS / Windows). No Kitty graphics.

#### Contour
- **Env**: `TERM_PROGRAM=contour`, `TERMINAL_PROGRAM=contour`.
- **Strengths**: Originator of DEC 2026 (synchronized output). Kitty keyboard, Sixel, OSC 8.
- **Quirks**: No Kitty graphics.

#### Rio
- **Env**: `TERM_PROGRAM=rio`.
- **Strengths**: Rust + GPU. Kitty keyboard, Sixel, OSC 8.
- **Quirks**: Younger project — Kitty graphics, OSC 5522 not yet implemented.

### AI-era / hybrid terminals

#### Warp
- **Env**: `TERM_PROGRAM=WarpTerminal`.
- **Strengths**: Kitty keyboard, OSC 8, OSC 52. Block-based UI.
- **Quirks**: Proprietary UI rendering means some protocols behave unexpectedly under blocks mode. Selection + paste interact with Warp's block UI rather than terminal scrollback.

#### Tabby
- **Env**: detected via xterm.js host.
- **Strengths**: xterm.js + Electron. OSC 8, OSC 52 (via xterm.js).
- **Quirks**: No Kitty keyboard, no Kitty graphics — bounded by xterm.js feature set.

#### Hyper
- **Env**: `TERM_PROGRAM=Hyper`.
- **Strengths**: xterm.js-based — gets OSC 8, OSC 52, OSC 10/11/12 from upstream.
- **Quirks**: Electron app; Kitty kbd/gfx not implemented. No DEC 2026.

### Traditional / X11-era terminals

#### xterm
- **Env**: `TERM=xterm`, `xterm-256color`, etc.
- **Strengths**: The reference implementation. OSC 10/11/12, mouse modes, Sixel (with build flag), Kitty keyboard since patch 391 (2024).
- **Quirks**: No OSC 8 (the original spec author argued against it). No DEC 2026.

#### gnome-terminal (libvte)
- **Env**: `VTE_VERSION` set, `TERM=xterm-256color`.
- **Strengths**: OSC 8, Sixel (0.66+), DEC 2026 (0.68+).
- **Quirks**: OSC 52 disabled by default for security. Shared rendering with Tilix, Terminator, xfce4-terminal, every other VTE-based terminal.

#### Konsole
- **Env**: `KONSOLE_VERSION` set.
- **Strengths**: OSC 8, Sixel (22.04+), DEC 2026.
- **Quirks**: OSC 52 disabled by default. No Kitty kbd/gfx.

#### Terminal.app (macOS)
- **Env**: `TERM_PROGRAM=Apple_Terminal`, `TERM=xterm-256color`.
- **Strengths**: Mouse modes, bracketed paste, focus tracking. Solid Unicode.
- **Quirks**: Most conservative of the common modern terminals. Quantizes truecolor to 256-cube. No OSC 8, no OSC 52, no Kitty kbd/gfx, no DEC 2026.

#### mlterm
- **Env**: `TERM=mlterm-256color` or `xterm-256color`.
- **Strengths**: Strong multi-lingual support, Sixel, OSC 52.
- **Quirks**: Niche; Linux + BSD. No Kitty kbd/gfx, no DEC 2026.

#### st (suckless)
- **Env**: `TERM=st` or `st-256color`.
- **Strengths**: Minimal codebase, fast. Patches add OSC 8, OSC 52, Sixel, truecolor.
- **Quirks**: Stock build is intentionally bare. Almost every published "feature" is a separate patch the user must apply.

#### urxvt (rxvt-unicode)
- **Env**: `TERM=rxvt-unicode-256color`.
- **Strengths**: Lightweight, Perl extensions for OSC 52 / clipboard / URL handling.
- **Quirks**: No truecolor upstream, no Kitty kbd/gfx, no DEC 2026. Effectively frozen.

### Windows-host terminals

#### Windows Terminal
- **Env**: `WT_SESSION` set, `TERM=xterm-256color`.
- **Strengths**: OSC 8, OSC 52, DEC 2026, Sixel (1.22+).
- **Quirks**: No Kitty kbd/gfx. ConPTY layer adds latency between app and terminal — affects probe timing.

#### mintty (Git Bash / Cygwin / MSYS2)
- **Env**: `TERM=xterm-256color`, `MSYSTEM` set (MSYS2).
- **Strengths**: OSC 8, OSC 52, mouse modes, bracketed paste, focus tracking.
- **Quirks**: No DEC 2026, no Kitty kbd/gfx. Sixel supported.

#### ConEmu / Cmder
- **Env**: `ConEmuANSI=ON`.
- **Strengths**: Mouse modes, bracketed paste on recent builds.
- **Quirks**: Older Windows-host terminal; ANSI parser must be enabled. Partial OSC 8 / 10/11/12.

### Web / Electron / embedded terminals

#### VS Code / Cursor integrated terminal (xterm.js)
- **Env**: `TERM_PROGRAM=vscode` (VS Code) or detection via host.
- **Strengths**: Tracks xterm.js — OSC 8, OSC 52, OSC 10/11/12, OSC 66 (recent), mouse modes, bracketed paste, focus tracking, Sixel (with `enableImages`).
- **Quirks**: No Kitty kbd/gfx. No DEC 2026 (xterm.js queues writes itself — terminal-side sync isn't needed but isn't exposed either).

### Multiplexers (must be analyzed as pass-through, not as terminals)

#### tmux
- **Env**: `TMUX` set, `TERM=tmux-256color` (or `screen-256color`).
- **Strengths**: Configurable pass-through of most modern features. OSC 8 (3.4+), DEC 2026 (3.2+), partial Kitty keyboard (3.5+).
- **Quirks**: Defaults are conservative — truecolor + OSC 52 + clipboard require explicit `terminal-features` / `set-clipboard` config. Pass-through (`Pt` DCS) is needed for Kitty gfx / Sixel / CSI 1016 and is unreliable.

#### GNU Screen
- **Env**: `STY` set, `TERM=screen` or `screen-256color`.
- **Strengths**: Session persistence; basic ANSI/VT100.
- **Quirks**: Aggressively conservative. Quantizes truecolor to 256 unless `truecolor on`. No OSC 8, no OSC 52, no DEC 2026, no Kitty kbd/gfx. Pass-through is buggier than tmux.

## Cross-reference with Silvery code

| Code path                                                | What it does                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| `packages/ansi/src/profile.ts` `createTerminalProfile()` | Env-heuristic detection — sets `caps.colorLevel`, `caps.kittyKeyboard`, etc. from `TERM`, `TERM_PROGRAM`, `COLORTERM`. |
| `packages/ag-term/src/capability-probes.ts`              | Runtime probes — sends the query form of each protocol, parses the response. Overrides env heuristics when they disagree. |
| `packages/ag-term/src/kitty-detect.ts`                   | Kitty keyboard probe (`CSI ? u`). Auto-enables `useModifierKeys` when supported. |
| `packages/ag-term/src/mode-query.ts`                     | DECRPM mode-query helper. Used for CSI 1016 detection.                |
| `packages/ag-term/src/bracketed-paste.ts`                | DEC 2004 enable/disable + paste parsing. Always enabled — terminals that don't support it ignore the sequence. |
| `packages/ag-term/src/focus-reporting.ts`                | DEC 1004 enable/disable + parser for `CSI I` / `CSI O`.               |
| `packages/ag-term/src/clipboard.ts`                      | OSC 52 + OSC 5522 emit / parse.                                       |
| `packages/ag-term/src/runtime/devices/modes.ts`          | DEC 2026 sync wrapping. Auto-enabled; unsupported terminals harmlessly ignore. |

The matrix is the **intent contract** for what each entry point should do. If
`probeKittyGraphics()` returns `true` against a terminal this matrix says "No,"
investigate whether the matrix is stale or the probe is matching on a partial
response.

## How this matrix is maintained

1. **Probe data** (where available) lives at
   [terminfo.dev](https://terminfo.dev). The CI there re-probes every tracked
   terminal monthly against the latest version.
2. **Curated values** for protocols the probes can't reliably verify
   (`probeStatus: "partial"`) come from each terminal's documentation and
   changelogs.
3. Update this doc when a terminal releases a new major version, when a
   probe's reliability changes, or when a new protocol is added to Silvery.

For the live matrix with per-version probe results, see
[terminfo.dev's feature compatibility matrix](https://terminfo.dev).

## Detection in Silvery

Silvery detects capabilities synchronously from environment variables at startup,
then optionally upgrades with runtime probes:

```typescript
import { createTerminalProfile } from "@silvery/ag-term"

const profile = createTerminalProfile()
profile.caps.colorLevel       // env-derived color tier
profile.caps.kittyKeyboard    // env-derived Kitty kbd guess
profile.emulator.program      // "ghostty" | "kitty" | "iterm2" | ...
```

For protocols where env vars are unreliable, Silvery's runtime probes confirm
support by writing the protocol's query form and waiting for the documented
response:

```typescript
import { detectKittyFromStdio } from "@silvery/ag-term"

const result = await detectKittyFromStdio(process.stdout, process.stdin, 200)
// result.supported: boolean, result.flags: number
```

See [Terminal Capabilities](./terminal-capabilities.md) for the full per-protocol
detection sequences.

### Detection env vars

| Variable           | Purpose                                                        |
| ------------------ | -------------------------------------------------------------- |
| `TERM`             | Terminal type (`xterm-256color`, `xterm-kitty`, `tmux-256color`).|
| `TERM_PROGRAM`     | Terminal emulator name (`ghostty`, `iTerm.app`, `WarpTerminal`).|
| `TERM_PROGRAM_VERSION` | Version string when terminal exposes one.                  |
| `COLORTERM`        | Color capability hint (`truecolor` or `24bit`).                |
| `NO_COLOR`         | Disable all color output when set.                             |
| `FORCE_COLOR`      | Override color tier (0/false → mono, 1 → ansi16, 2 → 256, 3 → truecolor). |
| `TMUX`             | Set when running inside tmux.                                  |
| `STY`              | Set when running inside GNU Screen.                            |
| `__CFBundleIdentifier` | macOS app bundle id — most reliable terminal identity hint on macOS. |
| `KITTY_WINDOW_ID`  | Set by Kitty.                                                  |
| `GHOSTTY_RESOURCES_DIR` | Set by Ghostty.                                           |
| `WEZTERM_EXECUTABLE` | Set by WezTerm.                                              |
| `ALACRITTY_WINDOW_ID` | Set by Alacritty.                                           |
| `KONSOLE_VERSION`  | Set by Konsole.                                                |
| `VTE_VERSION`      | Set by libvte-based terminals (gnome-terminal, Tilix, etc.).    |
| `WT_SESSION`       | Set by Windows Terminal.                                       |
| `ConEmuANSI`       | Set by ConEmu / Cmder.                                         |

## References

### Protocol specs

- [ECMA-48 / ISO 6429](https://www.ecma-international.org/publications-and-standards/standards/ecma-48/) — CSI/OSC standard.
- [XTerm Control Sequences](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html) — de facto extension surface.
- [DEC private modes](https://vt100.net/docs/vt510-rm/chapter5.html) — DECSET / DECRPM grammar.
- [Kitty Keyboard Protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/).
- [Kitty Graphics Protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/).
- [Kitty Advanced Clipboard (OSC 5522)](https://sw.kovidgoyal.net/kitty/clipboard/).
- [Text Sizing Protocol (OSC 66)](https://sw.kovidgoyal.net/kitty/text-sizing-protocol/).
- [OSC 52 (XTerm)](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h2-Operating-System-Commands).
- [OSC 8 Hyperlinks](https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda).
- [Synchronized Output (DEC 2026)](https://gist.github.com/christianparpart/d8a62cc1ab659194337d73e399004036).
- [Bracketed Paste (DEC 2004)](https://cirw.in/blog/bracketed-paste).
- [Focus Reporting (DEC 1004)](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h3-Functions-using-CSI-_-ordered-by-the-final-character_s_).
- [SGR Mouse (DEC 1006)](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h3-Mouse-Tracking).
- [Sixel Graphics](https://en.wikipedia.org/wiki/Sixel).
- [NO_COLOR Standard](https://no-color.org/).

### Terminal home pages (for changelogs / version floors)

- [Ghostty](https://ghostty.org), [Kitty](https://sw.kovidgoyal.net/kitty), [WezTerm](https://wezterm.org), [iTerm2](https://iterm2.com), [Alacritty](https://alacritty.org), [foot](https://codeberg.org/dnkl/foot), [Contour](https://contour-terminal.org), [Rio](https://raphamorim.io/rio), [Warp](https://www.warp.dev), [Tabby](https://tabby.sh), [Hyper](https://hyper.is), [xterm](https://invisible-island.net/xterm), [gnome-terminal](https://help.gnome.org/users/gnome-terminal), [Konsole](https://konsole.kde.org), [Terminal.app](https://support.apple.com/guide/terminal/welcome/mac), [mlterm](http://mlterm.sourceforge.net), [st](https://st.suckless.org), [urxvt](http://software.schmorp.de/pkg/rxvt-unicode.html), [Windows Terminal](https://learn.microsoft.com/en-us/windows/terminal), [mintty](https://mintty.github.io), [ConEmu](https://conemu.github.io), [tmux](https://github.com/tmux/tmux), [GNU Screen](https://www.gnu.org/software/screen).
- [terminfo.dev](https://terminfo.dev) — comprehensive feature compatibility matrix powered by automated probing.
