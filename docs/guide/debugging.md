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

| Slug                         | Tier | What it catches                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `incremental`                | 1    | Incremental render phase produces the same buffer as a fresh redraw (the historical STRICT=1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `canary`                     | 2    | Degenerate frame: large buffer (≥ 4000 cells) where < 5% of cells are painted after first render — usually means the root component has no `<Screen>` or `<Box width height>` wrapper. **Filed at tier 2** so it surfaces the punch-list of broken harnesses during `test:strictest` cadence runs without blocking `test:fast`. Promote to tier 1 once the suite is clean.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `residue`                    | 2    | Stale-prev-cell carry-over: poisons the prev buffer with a sentinel (rgb(254, 0, 254) "þ"), runs the regular incremental render against it, then compares against a fresh-from-zero render. Any cell that retains the sentinel exposes "incremental cascade trusted prev pixels but no paint op covered them" — the cyan-strip residue class. **Tier 2** because of the cost (one extra render-phase pass + cloned buffer per frame). The plain `incremental` check at tier 1 only catches divergences in CHANGED cells; stale carry-over often passes that check because the prev pixel happens to coincide with what fresh would paint.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `divergence`                 | 2    | Render/emulator divergence — the blank-screen class-killer. After a frame's cumulative ANSI is fed into an in-process emulator (the `SILVERY_STRICT_TERMINAL=xterm\|ghostty` readback path), it compares `buffer.countPaintedCells()` against the emulator's non-space cell count. If silvery painted a real content frame (≥ 4000 painted cells) but the emulator screen is all-spaces (0 non-space), the frame is the blank-screen regression signature: a full content frame emitted to a blank screen (a swallowed / mis-positioned repaint that never landed). **Tier 2** (paranoid) — `SILVERY_STRICT=2` / `=divergence` throws, tier 1 logs `silvery:divergence`. **NO-OP for live TTYs**: the check only runs inside the in-process-emulator block, so a real terminal (no in-process emulator) never enters it and can never throw. Sibling to `canary` (which catches a near-empty BUFFER) — `divergence` catches a full buffer that the SCREEN never received. Per-test opt-out: `SILVERY_STRICT=2,!divergence`.                                                                                                                                                                                                                                                                                                                                                                                            |
| `cursor` / `cursor-position` | 2    | Managed-caret / hardware-cursor emission check. Replays the exact cursor-bearing output bytes through xterm.js and asserts the terminal cursor lands on the semantic row/column with the expected visibility. Records `semanticCursor`, `hardwareParking`, `hardwareVisibility`, `compositorCaret`, `promptBounds`, `composerBounds`, and `finalCursorEscape` via `getLastOutputCursorDiagnostics()` and logs to `silvery:cursor`, including a literal `cursor:row=N,col=M` breadcrumb for live log scans. Use for live-path cursor bugs where the buffer is correct but the visible caret parks in padding, stale transcript content, chrome rows, or another row after render. **Tier 2** because it creates an emulator for each checked cursor write; isolate with `SILVERY_STRICT=cursor` or `SILVERY_STRICT=cursor-position`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `bordered-rect-clip`         | 2    | Cell painted outside the nearest bordered-Box ancestor's inner content rect. Catches overflowing `<Text>` inside a `<Box borderStyle="…">` that lacks `overflow="hidden"` — text spills past the border or bleeds into siblings. Skipped automatically when the bordered ancestor has `overflow="hidden"` (the existing `computeChildClipBounds` path already enforces correctness). Suggested fix surfaces in the diagnostic: add `overflow="hidden"` on the box, or `wrap="truncate"` on the text.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `clip-parity`                | 2    | Background overlays from nested `<Text backgroundColor=...>` paint only cells that text rendering painted under the same min/max column clip. Catches the bg-only cell class where `applyBgSegmentsToLine` paints past an overflow-hidden parent while `renderGraphemes` clipped the matching characters. **Tier 2** because it derives per-line text-painted columns only for the bg overlay path. Per-test opt-out: `SILVERY_STRICT=2,!clip-parity`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `bytes_out`                  | 1    | Render-out throughput monitor. WARN @ sustained 1 MB/s × 10s; PANIC @ 100 MB/s × 2s. PANIC emits `v8.writeHeapSnapshot()` + frame summaries; WARN emits frame summaries only. Frame summaries include output-phase attribution (`reason`, dimensions, changed cells, dirty rows, output/cursor chars, sync-wrap state), so a large frame can be classified as first render, resize/dimension mismatch, forced full render, or normal diff. Fixed thresholds in code — no env knobs. Activates with the other tier-1 checks under `SILVERY_STRICT=1` (the same default `bun run test:fast` uses); opt out per session with `SILVERY_STRICT=1,!bytes_out`. Catches render-output firehoses that fill the pty parent's scrollback (tmux, iTerm2, or any pane host) while the TUI's own `process.memoryUsage()` looks healthy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `flicker`                    | 1    | Repaint-storm monitor — sibling of `bytes_out` that scans the SAME post-write terminal bytes for destructive full-screen clears (`\x1b[2J` / `\x1b[3J`) and scroll-region resets (`\x1b[r`). PANICs (throws — fail-loud, no WARN tier) when ≥ 3 full clears land within a 1s window with NO intervening settle frame (a settle = an in-window frame carrying zero storm signals). The diagnostic NAMES the offending sequence + count + window and hints the culprit: a bare `\x1b[2J` emitted per-frame OUTSIDE the DEC-2026 sync region — the classic pane-flicker-on-resize signature, which flicker catches at the source. **Safe-by-construction against the legitimate repaint pattern**: a legitimate homed full-cell repaint (`\x1b[H` + every-cell rewrite) emits NO `\x1b[2J`, so it registers zero storm signals and can never trip regardless of size; a single isolated clear (startup, one explicit `invalidate({clearScreen})`) never reaches the threshold; and `\x1b[0J`/`\x1b[1J`/`\x1b[J` partial erases are deliberately excluded. Fixed thresholds in code — no env knobs. Activates with the other tier-1 checks under `SILVERY_STRICT=1`; opt out per session with `SILVERY_STRICT=1,!flicker`. Flicker is otherwise invisible to text-frame assertions (the final frame is correct; the damage is the transient blank between frames) and historically cost repeated eyeball-debugging rounds. |
| `signal_fanout`              | 1    | App-level hot-signal subscriber budget. Apps use this slug to throw `SignalFanoutError` when rendered components subscribe too broadly to hot singleton signals (a global cursor signal, for example). Fixed budgets live with the tagged signals; opt out per session with `SILVERY_STRICT=1,!signal_fanout`. This follows the same no-extra-knobs rule as `bytes_out` / `mem`: diagnostics are automatic under tier 1 and documented at the strict-mode umbrella.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `mem`                        | 1    | In-process heap-poll sibling of `bytes_out`. Every 30s, logs `process.memoryUsage()` (RSS, heapUsed, heapTotal, external, arrayBuffers) via the `silvery:mem` loggily namespace and trips a one-shot WARN when RSS — or `external + arrayBuffers` — doubles within a 60s window. Fixed cadence in code, no env knobs. Opt out per session with `SILVERY_STRICT=1,!mem`. Catches in-process growth that `bytes_out` cannot see (queue accumulators, retained closures, buffer pools).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `island-paint-oob`           | 2    | `<Island>` guest writes cells outside the island's declared rect. Fires in the output-phase blit when a guest-produced cell coordinate falls outside `island.boxRect`. Catches escaped paint that would corrupt host chrome or sibling islands. Reserved by the islands epic (Phase 1 Unit B/C — factory + aggregator install the check at the call site).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `island-grapheme-width`      | 2    | `<Island>` guest writes a wide grapheme cluster whose declared width disagrees with the host's `wcwidth` calculation. Fires in the render phase when a wide-cell continuation slot is inconsistent with the leading cell. Catches CJK / emoji / flag-sequence mis-encodings that desynchronize the cursor and produce row-rest garble downstream. Reserved by the islands epic.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `island-resize-race`         | 2    | `<Island>` guest writes content at new dimensions BEFORE the host confirms the resize via the `size` sub-owner. Fires in the output phase / size aggregator when guest cells appear outside the host-confirmed rect. Catches the two-phase resize race (backend `requestResize` → host confirms via `size` owner → backend writes at new dims).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `island-mode-leak`           | 2    | Terminal protocol mode (raw, mouse, focus reporting, bracketed paste, Kitty keyboard, cursor shape / visibility) stays enabled after the requesting island unmounts or loses focus. Fires in the host aggregator (Unit C) when the active mode set is not a subset of the union of focused-subtree `island.modes`. Catches the "cursor invisible after PTY guest blur" / "mouse stuck in SGR" class of regressions. Reserved by the islands epic.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `island-dispose-leak`        | 2    | `<Island>` guest retains resources (timers, sockets, file descriptors, subprocesses, signal handlers) past its `dispose()` call. Fires as an end-of-test residue check that compares pre-mount vs post-dispose handle counts on the active scope. Catches the leak class that makes test suites slowly run out of FDs / event-loop handles when many island mount-unmount cycles run in a single process. Reserved by the islands epic.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `island-paint-budget`        | 2    | Per-frame byte cadence from a single `<Island>` guest exceeds budget. Fires in the render phase when an individual island's painted-bytes-per-frame crosses a fixed threshold. Sibling to `bytes_out` but scoped per-island, so a single runaway guest can be identified instead of just observing total output firehose. Reserved by the islands epic.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `island-boundary-limits`     | 2    | Host-translated mouse / focus coordinates leak past an island's borders. Fires in input routing (Unit C) when (host_x, host_y) → island-local (x, y) translation produces a coordinate outside `[0, width) × [0, height)`, or when a focus event addresses an element claimed by a different island's subtree. Catches the mouse-coordinate-translation landmine.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `layout-flag`                | 1    | Layout-phase invariant: `layoutChangedThisFrame` is current-epoch only when `prevLayout` ≠ `boxRect` (the flag must not be set spuriously). Migrated from a raw `process.env.SILVERY_STRICT` read to the slug system (audit W1 #5); tier 1 preserves its historical throw-at-any-truthy-STRICT behavior. Isolate/disable with `SILVERY_STRICT=layout-flag` / `=2,!layout-flag`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `layout-overflow`            | 2    | A non-absolute child's `boxRect.width` exceeds its parent's inner content width when the parent has no `overflow="scroll"\|"hidden"` — `strictLayoutOverflowCheck`, the fit-content/measure guard. Warns at tier 1, throws at tier 2. Slug-migrated (audit W1 #5) so it composes with compound specs (`incremental,2` now throws, not warn-only) and honors `2,!layout-overflow`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `scroll-invariants`          | 2    | Generic scroll/sticky math invariants (`strictScrollInvariants`): `scrollOffset` clamping, `scrollTo` / first- / last-visible target intersects the effective viewport, sticky `renderOffset` in legal bounds. Warns at tier 1, throws at tier 2. Slug-migrated (audit W1 #5).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `fresh-layout`               | 2    | The `incremental` oracle's fresh-render baseline force-recomputes layout from scratch (`markLayoutTreeDirty` + `forceFullPropagate`) instead of sharing the incremental path's just-cleaned flexily tree. Catches a stale rect from a layout-affecting change that failed to markDirty flexily — invisible to plain `incremental` because its fresh path skips `calculateLayout` via the ag.ts layout-on-demand gate. Wired into all three STRICT sites: the test-driver renderer, the scheduler, and the createApp/run production renderer (the last covers the @si/render/19436 follow-up standalone frame). Deterministic on clean code (flexily's `expectRelayoutMatchesFresh` fuzz), so it is false-positive-free. Isolate/disable with `SILVERY_STRICT=fresh-layout` / `=2,!fresh-layout`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `apportion-bands`            | 2    | Per frame, over REALIZED widths: no `data-track-band` track rendered below its band minimum while a sibling rendered above its band maximum (`strictApportionBandsCheck`). Warns at tier 1, throws at tier 2. The subject is deliberately the laid-out geometry, not `apportion()`'s return value — the allocator's own postcondition is provable, so checking it against itself could never fire. What the check catches is what happens to the widths afterwards: a `grow` track carrying no `maxWidth`, a shrink fallback floored at the author's `minWidth` rather than the track's min-content, or a surface that still splits width with its own arithmetic. The conjunction is load-bearing — starvation alone is legible degradation (deliberately lowered floors when nothing fits), surplus alone is a `grow` track absorbing free space. A surface opts in by stamping `TRACK_BAND_ATTR` (`@silvery/ag`); `Table` does. Isolate/disable with `SILVERY_STRICT=apportion-bands` / `=2,!apportion-bands`.                                                                                                                                                                                                                                                                                                                                                                                                      |

More checks land here as the framework hardens. Each new check publishes its slug + tier in this table.

### Convention: observability instruments live at tier 1

Some slugs are **observability instruments** (`bytes_out`, `flicker`, `mem`) rather than canonical verification checks — they probe runtime behavior rather than gate render correctness. They still live at **tier 1** so they're automatic under `SILVERY_STRICT=1`. Diagnostics that require remembering ad-hoc env vars don't get used; tier-1 inclusion means the instrument is there when the firehose actually happens, with no extra invocation step. Per-session opt-out is `SILVERY_STRICT=1,!bytes_out`.

Two design rules that follow from this convention:

1. **Fixed thresholds in code.** No `SILVERY_<X>_<Y>` env knobs for tuning. If the threshold is wrong, file an issue and we change the constant. Knobs we don't remember = checks that don't fire.
2. **Cheap by default.** The instrument's per-write cost must stay negligible (~one monotonic clock read + a small ring-buffer write) so tier-1 inclusion doesn't measurably slow `test:fast`.

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
- These remain as separate env vars because they pick a _backend_, not a _check_ — orthogonal dimension

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

# Component lifecycle stream (mount/update/unmount with compact identifying props)
DEBUG=silvery:mount DEBUG_LOG=/tmp/silvery.log bun run app

# Decoded trace of every stdout write, plus doRender/subscription markers
SILVERY_TRACE=1 DEBUG_LOG=/tmp/silvery.log bun run app

# Per-frame and per-event render timings
DEBUG=silvery:perf DEBUG_LOG=/tmp/silvery.log bun run app

# Instrumentation counters (enables stats collection, also exposed on globalThis)
SILVERY_INSTRUMENT=1 bun run app
```

While a fullscreen app runs, its output guard keeps these records off the screen: they go to `DEBUG_LOG` when it is set, and are otherwise printed after the app exits. An inline app leaves stderr alone, so redirect it (`2>silvery.log`) instead.

#### Loggily Namespace Reference

| Namespace               | What                                                                            |
| ----------------------- | ------------------------------------------------------------------------------- |
| `silvery:render`        | Frame-level spans with per-phase timing                                         |
| `silvery:content`       | Render phase stats per frame (render/skip counts)                               |
| `silvery:content:trace` | Per-node trace entries (skip/render decisions)                                  |
| `silvery:content:cell`  | Per-cell debug (node coverage at target coords)                                 |
| `silvery:measure`       | Measure phase debug (text measurement calls)                                    |
| `silvery:mount`         | Component lifecycle stream: mount/update/unmount with compact identifying props |
| `silvery:bytes_out`     | Render-output throughput monitor (WARN/PANIC events, frame summaries)           |
| `silvery:flicker`       | Repaint-storm monitor (PANIC on fast repeated destructive clears; frame dumps)  |
| `silvery:cursor`        | Hardware-cursor target vs replayed terminal cursor diagnostics                  |
| `silvery:mem`           | In-process heap poll (30s `process.memoryUsage()` samples + WARN on doubling)   |
| `silvery:trace`         | `SILVERY_TRACE=1`: decoded stdout writes, doRender and subscription markers     |
| `silvery:perf`          | `DEBUG=silvery:perf`: per-frame and per-event render timings                    |
| `silvery:output`        | Output-phase diff, size and `SILVERY_DEBUG_CAPTURE` status lines                |
| `@silvery/ag-react`     | React reconciler pipeline spans                                                 |

### Enriched STRICT Errors

When `SILVERY_STRICT` detects a mismatch, the `IncrementalRenderMismatchError` automatically captures:

- Render-phase stats (nodes visited/rendered/skipped, per-flag breakdown)
- Cell attribution (mismatch debug context)
- Dirty flags, scroll state, fast-path analysis

The scheduler auto-enables instrumentation for the STRICT comparison render. No need for separate `SILVERY_INSTRUMENT` or `SILVERY_CELL_DEBUG` runs when diagnosing STRICT failures.

## What Each Mode Catches (and Misses)

| Mode                                              | Catches                                                                                                   | Misses                                                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `STRICT=1` (`incremental`)                        | Render phase bugs (wrong dirty flag evaluation, skipped nodes, wrong region clearing, scroll tier errors) | Output phase bugs, terminal interpretation bugs, stale-prev-cell carry-over (canary + residue are tier 2) |
| `STRICT=2` (`incremental` + `canary` + `residue`) | Tier 1 + degenerate-frame harness misconfig + sentinel-compare residue check + every-action invariants    | Same as tier 1 for output/terminal bugs                                                                   |
| `STRICT=canary`                                   | Just the degenerate-frame canary (debugging isolate)                                                      | All other render bugs                                                                                     |
| `STRICT=residue`                                  | Just the sentinel-compare residue check (debugging isolate)                                               | All other render bugs                                                                                     |
| `STRICT_TERMINAL=vt100`                           | changesToAnsi bugs where our parser disagrees with our generator (style transitions, cursor arithmetic)   | Bugs where parser and generator agree but real terminals disagree (pending-wrap, `\x1b[K` in wrap state)  |
| `STRICT_TERMINAL=xterm`                           | Terminal interpretation bugs (xterm.js-specific: OSC 66, wide char cursor, buffer overflow)               | Ghostty-specific bugs, bugs requiring accumulated state                                                   |
| `STRICT_TERMINAL=ghostty`                         | Ghostty-specific terminal interpretation bugs                                                             | xterm.js-specific bugs                                                                                    |
| `STRICT_ACCUMULATE`                               | Compounding errors across multiple frames                                                                 | Same limitation as vt100 (self-referential parser)                                                        |

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

Priority (highest wins): `FORCE_COLOR` env → `NO_COLOR` env →
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

## Render-path debug primitive — "where does X live?"

Visual / first-paint / layout bugs often have one root cause: the bug report claims component X renders inside lane A, but the actual mounted tree has it inside lane B. Static-trace this before deeper debugging to catch misframed reports early.

The primitive is a pure read of the committed AgNode tree — no env knob, no logging hook, no instrumentation cost. Use it in tests for structural invariants, and in ad-hoc REPL/console for live exploration.

```ts
import {
  getRenderPath,
  getMountTree,
  formatRenderPath,
  printRenderPath,
  findNodesByComponentName,
} from "@silvery/ag-react/debug/render-path"

// In a termless test — app exposes the conveniences directly.
const path = app.renderPath("ToolBlock")
//   → [{ name: "silvery-root" }, { name: "App" }, { name: "Body" },
//      { name: "ToolBlock", boxRect: {...} }]
formatRenderPath(path)
//   → "silvery-root > App > Body > ToolBlock"

// Full structural dump for snapshot tests.
const tree = app.mountTree()
expect(tree).toMatchInlineSnapshot(...)
```

**Component name resolution** (mirrors `getDebugComponentName` in the reconciler):

1. `data-component="X"` prop → `"X"`
2. else `testID="y"` → `"${hostType}#y"` (e.g., `"Box#tool-1"`)
3. else `id="y"` → `"${hostType}#y"`
4. else bare host type (`"Box"`, `"Text"`, `"silvery-root"`)

Add `data-component="X"` to any component you want render-path-addressable. The reconciler already uses it for `silvery:mount` logs, so it's a doubly-useful convention.

**When to reach for render-path** vs other diagnostics:

| Bug shape                                             | Reach for                                           |
| ----------------------------------------------------- | --------------------------------------------------- |
| "component X jumps after first paint"                 | [CLS](../reference/cls.md) — detects SHIFTS         |
| "component X mounted in wrong lane / parent"          | render-path — answers WHERE                         |
| "component X mounted, then immediately unmounted"     | `DEBUG=silvery:mount` — mount/update/unmount events |
| "what was the parent chain at the moment of the bug?" | render-path on `app.getContainer()`                 |

**Anti-pattern**: don't grep source to guess the render path — the JSX you read is the static structure, but conditional rendering, suspense boundaries, and provider wrappers can shift the actual mounted parent. The debug primitive walks the LIVE tree.

## Panic on render error — auto-restore + stderr dump

Silvery routes uncaught React render errors (and effect errors that escape every `ErrorBoundary`) to the same `panicApp` path that `handle.panic()` uses. Concretely:

1. The fiber root is created with an `onUncaughtError` callback that calls `panicApp(error, { title: "react" })`.
2. The outermost `SilveryErrorBoundary` calls `panicApp(error)` from its `onError` — so caught render errors panic too, instead of surfacing in the altscreen overlay where they're invisible after process exit.
3. `panicApp` records the panic, drains late stdin bytes, disables interactive protocols (raw mode, mouse, Kitty keyboard, alt-screen), then writes the panic report to **stderr** — on the user's normal screen, not the alt-screen — with the message, details, dump-file path, and the full `Error.stack` inline.
4. `process.exitCode` is set to 1 (or `options.exitCode`) so scripts and CI notice.

The user-facing shape after a render error:

```
react: Rendered more hooks than during the previous render. (dump: /tmp/silvery-panic-…txt)
Error: Rendered more hooks than during the previous render.
    at … (Component.tsx:42:8)
    …
```

Both the inline stack and the dump file are preserved. The dump file is the canonical artifact when the stack is long enough to exceed the user's scrollback; the inline stack is what CI grep, scripts, and screenshots capture.

### What you DON'T need to wire yourself

When using `run()` or `createApp().run()`, you do NOT need to:

- Register your own `process.on("uncaughtException", …)` to restore the terminal on render errors — the fiber root does it.
- Manually catch React errors with an outer `<ErrorBoundary>` — silvery's outermost boundary already routes through `panicApp`. Inner error boundaries that you author still work; they're for graceful recovery within the app, not for panic handling.
- Call `process.stderr.write(error.stack)` from your own crash handler — `panicApp` does it after the terminal is restored.

### When to disable panicking

Tests that explicitly want to verify render-error behavior (without exiting the test process) should mock `process.exitCode` and `process.stderr.write` around the `run()` call — see `tests/runtime/panic.test.tsx` for the canonical pattern. The panic still records the error; the harness just observes it without the global side effects.

For production code, there's currently no `panicOnRenderError: false` opt-out — render errors should always panic. Add one only if you have a concrete production use case for resuming a tree after an uncaught error.

### Related primitives

- `handle.panic(reason, options?)` — explicit panic from outside the React tree.
- `usePanic()` from `silvery/runtime` — explicit panic from inside the React tree (effects, event handlers).
- `panicApp` — internal; not exported. Wired into the fiber root + the outer boundary.

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
