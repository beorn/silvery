# Debugging Silvery

Canonical reference for debugging rendering issues. All other docs link here instead of duplicating.

## SILVERY_STRICT — the canonical truth-of-render gate

`SILVERY_STRICT` is the single env var that turns on runtime verification. It accepts a comma-separated list where each entry is either a **numeric tier** or a **check slug**. Empty / unset / `"0"` → off.

```bash
SILVERY_STRICT=1                # tier 1 — all canonical checks
SILVERY_STRICT=2                # tier 2 — tier 1 + every-action invariants (paranoid; slower)
SILVERY_STRICT=canary           # only the degenerate-frame canary
SILVERY_STRICT=residue,canary   # combine specific checks without going full-tier
SILVERY_STRICT=1,!canary        # tier 1 minus the canary (per-check skip with `!` prefix)
```

**Design contract: no other `SILVERY_*` enable env vars.** New checks pick a slug + a tier and inherit the umbrella. `bun run test:fast` (sets `SILVERY_STRICT=1` by default) gets every new check without env config changes. See [`packages/ag-term/src/strict-mode.ts`](https://github.com/beorn/silvery/blob/main/packages/ag-term/src/strict-mode.ts) for the `isStrictEnabled(slug, minTier)` helper.

### Built-in checks (slugs)

| Slug          | Tier | What it catches                                                                                |
| ------------- | ---- | ---------------------------------------------------------------------------------------------- |
| `incremental` | 1    | Incremental render phase produces the same buffer as a fresh redraw (the historical STRICT=1)  |
| `canary`      | 2    | Degenerate frame: large buffer (≥ 4000 cells) where < 5% of cells are painted after first render — usually means the root component has no `<Screen>` or `<Box width height>` wrapper. **Filed at tier 2** so it surfaces the punch-list of broken harnesses during `test:strictest` cadence runs without blocking `test:fast`. Promote to tier 1 once the suite is clean. |
| `residue`     | 2    | Stale-prev-cell carry-over: poisons the prev buffer with a sentinel (rgb(254, 0, 254) "þ"), runs the regular incremental render against it, then compares against a fresh-from-zero render. Any cell that retains the sentinel exposes "incremental cascade trusted prev pixels but no paint op covered them" — the cyan-strip residue class. **Tier 2** because of the cost (one extra render-phase pass + cloned buffer per frame). The plain `incremental` check at tier 1 only catches divergences in CHANGED cells; stale carry-over often passes that check because the prev pixel happens to coincide with what fresh would paint. |

More checks land here as the framework hardens. Each new check publishes its slug + tier in this table.

### Orthogonal axes (not part of the strict gate)

These are independent verification dimensions, not strict checks. They compose with `SILVERY_STRICT` but don't subsume it.

```bash
# ANSI-level: verify output via internal VT100 parser (fast, same process)
SILVERY_STRICT_TERMINAL=vt100 bun run app

# Terminal-level: verify via independent xterm.js emulator
SILVERY_STRICT_TERMINAL=xterm bun run app

# Terminal-level: verify via Ghostty WASM emulator
SILVERY_STRICT_TERMINAL=ghostty bun run app

# Multiple backends (comma-separated)
SILVERY_STRICT_TERMINAL=vt100,xterm bun run app

# All backends
SILVERY_STRICT_TERMINAL=all bun run app          # vt100 + xterm + ghostty

# Accumulated ANSI: replays ALL frames (O(N^2)) to catch compounding errors
SILVERY_STRICT_ACCUMULATE=1 bun run app
```

**Notes:**

- `SILVERY_STRICT_TERMINAL=all` → shorthand for `vt100,xterm,ghostty`
- These terminal verification modes use [Termless](https://termless.dev) backends internally
- These remain as separate env vars because they pick a *backend*, not a *check* — orthogonal dimension

### Diagnostics

All diagnostic output is routed through [loggily](https://github.com/beorn/loggily) structured logging. Use `DEBUG` for log output and `TRACE` for span timing.

```bash
# All silvery diagnostic output (file-based to avoid stdout corruption)
DEBUG=silvery:* DEBUG_LOG=/tmp/silvery.log bun run app

# Render phase stats only (nodes visited/rendered/skipped per frame)
DEBUG=silvery:content DEBUG_LOG=/tmp/silvery.log bun run app

# Per-node trace entries (requires SILVERY_STRICT for trace collection)
DEBUG=silvery:content:trace DEBUG_LOG=/tmp/silvery.log bun run app

# Per-cell debug (which nodes cover a specific cell during incremental rendering)
SILVERY_CELL_DEBUG=77,85 DEBUG=silvery:content:cell DEBUG_LOG=/tmp/silvery.log bun run app

# Pipeline phase timing spans
TRACE=silvery:render DEBUG_LOG=/tmp/silvery.log bun run app

# Measure phase debug (text measurement calls)
DEBUG=silvery:measure DEBUG_LOG=/tmp/silvery.log bun run app

# Instrumentation counters (enables stats collection, also exposed on globalThis)
SILVERY_INSTRUMENT=1 bun run app
```

#### Loggily Namespace Reference

| Namespace               | What                                              |
| ----------------------- | ------------------------------------------------- |
| `silvery:render`        | Frame-level spans with per-phase timing           |
| `silvery:content`       | Render phase stats per frame (render/skip counts) |
| `silvery:content:trace` | Per-node trace entries (skip/render decisions)    |
| `silvery:content:cell`  | Per-cell debug (node coverage at target coords)   |
| `silvery:measure`       | Measure phase debug (text measurement calls)      |
| `@silvery/ag-react`     | React reconciler pipeline spans                   |

### Enriched STRICT Errors

When `SILVERY_STRICT` detects a mismatch, the `IncrementalRenderMismatchError` automatically captures:

- Render-phase stats (nodes visited/rendered/skipped, per-flag breakdown)
- Cell attribution (mismatch debug context)
- Dirty flags, scroll state, fast-path analysis

The scheduler auto-enables instrumentation for the STRICT comparison render. No need for separate `SILVERY_INSTRUMENT` or `SILVERY_CELL_DEBUG` runs when diagnosing STRICT failures.

## What Each Mode Catches (and Misses)

| Mode                      | Catches                                                                                                   | Misses                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `STRICT=1` (`incremental` + `canary`) | Render phase bugs (wrong dirty flag evaluation, skipped nodes, wrong region clearing, scroll tier errors) + degenerate-frame test harness misconfiguration | Output phase bugs, terminal interpretation bugs                                                          |
| `STRICT=2`                | Tier 1 + every-action invariants (cursor visibility, border integrity)                                                                                     | Same as tier 1 for output/terminal bugs                                                                  |
| `STRICT=canary`           | Just the degenerate-frame canary (debugging isolate)                                                                                                       | All other render bugs                                                                                    |
| `STRICT_TERMINAL=vt100`   | changesToAnsi bugs where our parser disagrees with our generator (style transitions, cursor arithmetic)   | Bugs where parser and generator agree but real terminals disagree (pending-wrap, `\x1b[K` in wrap state) |
| `STRICT_TERMINAL=xterm`   | Terminal interpretation bugs (xterm.js-specific: OSC 66, wide char cursor, buffer overflow)               | Ghostty-specific bugs, bugs requiring accumulated state                                                  |
| `STRICT_TERMINAL=ghostty` | Ghostty-specific terminal interpretation bugs                                                             | xterm.js-specific bugs                                                                                   |
| `STRICT_ACCUMULATE`       | Compounding errors across multiple frames                                                                 | Same limitation as vt100 (self-referential parser)                                                       |

**Hierarchy**: `STRICT` (buffer) → `STRICT_TERMINAL=vt100` (ANSI) → `STRICT_TERMINAL=xterm` (terminal) → `STRICT_TERMINAL=all` (cross-backend).

**CI strategy**:

- PR CI: `SILVERY_STRICT_TERMINAL=vt100` (fast, zero deps)
- Nightly: `SILVERY_STRICT_TERMINAL=xterm` (independent emulator)
- Scheduled/allow-fail: `SILVERY_STRICT_TERMINAL=ghostty` (WASM, has known grapheme bugs)
- Local debug: `SILVERY_STRICT_TERMINAL=all`

## Inspecting the Active Theme

`bun run theme inspect` runs the full orchestrator against the current terminal and prints every semantic token with its resolved hex value and mono-tier SGR attrs:

```bash
bun run theme inspect                    # human-readable table
bun run theme inspect --format json      # structured JSON for scripting
bun run theme inspect --diff nord        # compare detected vs a named scheme
```

Example output:

```
  Detected terminal:  catppuccin-mocha
  Source:             fingerprint matched catppuccin-mocha (confidence 98%)
  Dark:               true

  Token                      Value        SGR (mono tier)
  ────────────────────────── ──────────── ────────────────────
  $fg                        #cdd6f4      none
  $bg                        #1e1e2e      none
  $fg-accent                 #cba6f7      bold
  $fg-muted                  #a6adc8      dim
  $fg-error                  #f38ba8      bold+inverse
  $fg-link                   #89b4fa      underline
  ...
```

Useful when:

- You want to confirm which scheme silvery detected and at what confidence
- Debugging a "wrong colors" issue — see which token resolved to what hex
- Comparing your terminal's detected scheme against a reference scheme
- Scripting theme-aware tooling via `--format json`

The `source` field tells you how the scheme was determined:

| Source        | Meaning                                                 |
| ------------- | ------------------------------------------------------- |
| `fingerprint` | Probed slots matched a catalog scheme (most accurate)   |
| `probed`      | Probed but no catalog match — uses merged scheme        |
| `fallback`    | Detection failed — using default dark or light scheme   |
| `override`    | Explicit override via `SILVERY_COLOR` env var or option |

## Forcing a Color Tier

Sometimes auto-detection picks the wrong tier — a truecolor-capable
terminal under-reports as `xterm-256color`, a CI runner reports no color
but you want to force ANSI16, or you're sanity-checking an accessibility
theme. Pass a pre-built profile with `colorLevel` to force the tier
end-to-end:

```tsx
import { run } from "silvery/runtime"
import { createTerminalProfile } from "@silvery/ansi"

// Bypass under-reporting — force truecolor
await run(<App />, { profile: createTerminalProfile({ colorLevel: "truecolor" }) })

// Test the low-end look in a modern terminal
await run(<App />, { profile: createTerminalProfile({ colorLevel: "ansi16" }) })

// Accessibility / CI output — no colors, hierarchy via attrs
await run(<App />, { profile: createTerminalProfile({ colorLevel: "mono" }) })
```

Forcing the tier does two things:

- Overrides `caps.colorLevel` for the run — the pipeline sees the
  requested tier end-to-end (mono attr fallback, SGR encoding, backdrop
  blend targets).
- Pre-quantizes the active Theme via `pickColorLevel()` so every token
  hex leaf snaps to the tier's palette (16-slot ANSI, xterm-256 cube, or
  `#000`/`#fff`).

Priority (highest wins): `NO_COLOR` env → `FORCE_COLOR` env →
`colorLevel` → auto-detect.

> The older `run({ colorLevel })` shorthand still works but is
> `@deprecated` (removal targeted for 1.1). Migrate call-sites to
> `run({ profile: createTerminalProfile({ colorLevel }) })`.

For advanced cases (pre-caching tier variants, showing multiple tiers in
one process), `pickColorLevel(theme, level)` is exported from `silvery`:

```ts
import { pickColorLevel } from "silvery"

const themes = {
  truecolor: theme,
  ansi16: pickColorLevel(theme, "ansi16"),
  mono: pickColorLevel(theme, "mono"),
}
```

`pickColorLevel` walks any Theme-shaped tree, replacing each hex leaf
(`#rgb` / `#rrggbb`) with `quantizeHex(leaf, level)`. Non-hex values
(names, `$tokens`, numbers, booleans) pass through unchanged. Idempotent
per tier; `truecolor` is an identity no-op.

## Diagnostic Workflow

1. **Start with STRICT**: `SILVERY_STRICT=1 bun vitest run ...` catches any incremental vs fresh render divergence immediately.

2. **Write a failing test**: If fuzz found it, extract the seed. If user-reported, construct a `withDiagnostics(createBoardDriver(...))` test with minimal reproduction steps.

3. **Read the mismatch error**: The enhanced error includes cell values, node path, dirty flags, scroll context, and fast-path analysis. This tells you exactly which node diverged and why it was skipped.

4. **Check instrumentation**: `SILVERY_INSTRUMENT=1` enables stats collection. View with `DEBUG=silvery:content DEBUG_LOG=/tmp/silvery.log` (loggily output) or programmatically via `globalThis.__silvery_content_detail`. Useful for understanding whether too many or too few nodes rendered.

5. **Check the five critical formulas**: `layoutChanged`, `contentAreaAffected`, `contentRegionCleared`, `skipBgFill`, `childrenNeedFreshRender` in `renderNodeToBuffer` (render-phase.ts). If any is wrong, the cascade propagates errors to the entire subtree.

6. **Text bg inheritance**: Text nodes inherit bg via `nodeState.inheritedBg` (threaded top-down, O(1) per node), not buffer reads. Viewport clears and region clears still affect buffer state, which matters for the `getCellBg` legacy fallback (used by scroll indicators). If your fix clears a region, verify it clears to the correct bg (usually `null` to match fresh render state).

## Symptom → Check Cross-Reference

| Symptom                                                    | Check First                                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Stale background color persists                            | `bgDirty` flag; `nodeState.inheritedBg` (threaded top-down); is region being cleared?                                          |
| Border artifacts after color change                        | `stylePropsDirty` vs `contentAreaAffected` distinction; border-only change should NOT cascade                                  |
| Scroll glitch (content jumps/disappears)                   | Scroll tier selection; Tier 1 unsafe with sticky; Tier 3 needs `stickyForceRefresh`                                            |
| Children blank after parent changes                        | `childrenNeedFreshRender` → `childHasPrev=false`; is viewport clear setting `childHasPrev` correctly?                          |
| Absolute child disappears                                  | Two-pass rendering order; absolute children need `ancestorCleared=false` in second pass                                        |
| Content correct initially, wrong after navigation          | Incremental rendering bug; `SILVERY_STRICT=1` will catch it                                                                    |
| Colors wrong but characters correct (garble)               | Output phase: `diffBuffers` row pre-check skipping true-color Map diffs; check `rowExtrasEquals`                               |
| Text bg different from parent Box bg                       | `nodeState.inheritedBg`; check if ancestor Box has `backgroundColor`; check region clearing                                    |
| Flickering on every render                                 | Check `layoutChangedThisFrame` flag; verify `syncPrevLayout` runs at end of render phase                                       |
| Stale overlay pixels after shrink (black area)             | `clearExcessArea` not called; check `contentRegionCleared` + `forceRepaint` interaction                                        |
| CJK/wide char garble, text shifts right                    | `bufferToAnsi` cursor drift: wide char without continuation at col+1. Run `SILVERY_STRICT_TERMINAL=xterm`                      |
| Flag emoji garble at wide terminals (200+ cols)            | `bufferToAnsi`/`changesToAnsi` cursor re-sync after wide chars; `wrapTextSizing`                                               |
| Stale chars in ancestor border/padding after child shrinks | Descendant overflow: `clearExcessArea` clips to immediate parent. Use `hasDescendantOverflowChanged()` for recursive detection |
