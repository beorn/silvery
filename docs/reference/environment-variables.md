---
title: Environment Variables
description: Complete reference for all SILVERY_ environment variables — verification, debugging, diagnostics, and layout configuration.
---

# Environment Variables

Silvery reads `SILVERY_*` environment variables at startup for verification, debugging, diagnostics, and configuration. None are required for normal operation.

## Verification

These variables enable automatic correctness checking. They add overhead and are intended for development and CI, not production.

### SILVERY_STRICT

The canonical truth-of-render gate. Single env var that enables every runtime check (incremental ≡ fresh, degenerate-frame canary, sentinel-compare residue, future invariants).

|             |                                                                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Values**  | Comma-separated list of numeric tiers (`1`, `2`, `3`) and check slugs (`incremental`, `canary`, `residue`). `!slug` skips a check. `0` / unset disables. |
| **Default** | Disabled                                                                                                                                                 |

```bash
SILVERY_STRICT=1                # tier 1 — incremental ≡ fresh check (back-compat)
SILVERY_STRICT=2                # tier 2 — tier 1 + canary + residue + every-action invariants
SILVERY_STRICT=canary           # only the degenerate-frame canary (debugging isolate)
SILVERY_STRICT=residue,canary   # combine specific checks without going full-tier
SILVERY_STRICT=2,!canary        # tier 2 minus canary (per-test escape hatch)
```

**Built-in checks (slugs):**

| Slug          | Tier | What it catches                                                                                                                                                                                  |
| ------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `incremental` | 1    | Incremental render phase produces the same buffer as a fresh redraw (the historical STRICT=1).                                                                                                   |
| `canary`      | 2    | Degenerate frame: large buffer (≥ 4000 cells) where < 5% of cells are painted after first render — usually means the root component has no `<Screen>` or `<Box width height>` wrapper.           |
| `residue`     | 2    | Stale-prev-cell carry-over: poisons the prev buffer with a sentinel, runs the regular incremental render, then compares against a fresh-from-zero render. Catches cyan-strip-class residue bugs. |

**Design contract: no other `SILVERY_*` enable env vars.** New checks pick a slug + a tier and inherit the umbrella. `bun run test:fast` (which sets `SILVERY_STRICT=1` by default) gets every new check without env config changes.

When any check fires, throws `IncrementalRenderMismatchError` with diagnostic context (cell coordinates, prev / incremental / fresh values, render-phase stats).

### SILVERY_STRICT_TERMINAL

ANSI-level verification via terminal emulator backends. Replays the ANSI output through one or more terminal emulators and compares the resulting screen against the buffer.

|             |                                                                                    |
| ----------- | ---------------------------------------------------------------------------------- |
| **Values**  | `vt100`, `xterm`, `ghostty`, `all`, or a comma-separated list (e.g. `vt100,xterm`) |
| **Default** | Disabled (empty string)                                                            |

- `vt100` — fast internal parser (stateless)
- `xterm` — xterm.js emulator (stateful, higher fidelity)
- `ghostty` — Ghostty terminal emulator (stateful)
- `all` — equivalent to `vt100,xterm,ghostty`

```bash
SILVERY_STRICT_TERMINAL=vt100 bun run app
SILVERY_STRICT_TERMINAL=all bun run app
```

### SILVERY_STRICT_ACCUMULATE

Replays ALL frames from the start on every render to catch compounding errors. O(N^2) cost.

|             |                                                          |
| ----------- | -------------------------------------------------------- |
| **Values**  | `1`, `true` to enable; `0`, `false`, or unset to disable |
| **Default** | Disabled                                                 |

Separate from `SILVERY_STRICT` — opt-in only because of the quadratic cost. Catches errors that only manifest after many incremental renders accumulate small drifts.

```bash
SILVERY_STRICT_ACCUMULATE=1 bun run app
```

### SILVERY_STABILITY_SKIP_LINES

Skip specific lines during stability checks in `withDiagnostics()`. Useful when certain lines contain non-deterministic content (timestamps, spinners).

|             |                                                         |
| ----------- | ------------------------------------------------------- |
| **Values**  | Comma-separated line numbers (0-indexed), e.g. `0,5,12` |
| **Default** | None                                                    |

```bash
SILVERY_STABILITY_SKIP_LINES=0,23 bun run test
```

## Debugging

These variables produce diagnostic output to help trace rendering issues.

### SILVERY_INSTRUMENT

Enable stats collection for the render pipeline. Exposes skip/render counts, cascade depth, and scroll tier decisions.

|             |                       |
| ----------- | --------------------- |
| **Values**  | `1`, `true` to enable |
| **Default** | Disabled              |

Stats are available via `DEBUG=silvery:content` log output and programmatically on `globalThis.__silvery_content_detail`. Automatically enabled when `SILVERY_STRICT` is active.

```bash
SILVERY_INSTRUMENT=1 DEBUG=silvery:content DEBUG_LOG=/tmp/silvery.log bun run app
```

### SILVERY_CELL_DEBUG

Trace which nodes cover a specific cell position. Produces per-cell diagnostic output showing the render cascade for that coordinate.

|             |                          |
| ----------- | ------------------------ |
| **Values**  | `col,row` (e.g. `77,85`) |
| **Default** | Disabled                 |

Requires `DEBUG=silvery:content:cell` and `DEBUG_LOG` to see output.

```bash
SILVERY_CELL_DEBUG=77,85 DEBUG=silvery:content:cell DEBUG_LOG=/tmp/silvery.log bun run app
```

### SILVERY_CAPTURE_OUTPUT

Capture the ANSI output written to the terminal after each frame. Appends frame-delimited output to the specified file path.

|             |                                             |
| ----------- | ------------------------------------------- |
| **Values**  | File path (e.g. `/tmp/silvery-output.ansi`) |
| **Default** | Disabled                                    |

Each frame is prefixed with a header showing the frame number and byte count.

```bash
SILVERY_CAPTURE_OUTPUT=/tmp/silvery-output.ansi bun run app
```

### SILVERY_CAPTURE_RAW

Capture raw ANSI output from the runtime diff phase to a fixed file path (`/tmp/silvery-runtime-raw.ansi`).

|             |                             |
| ----------- | --------------------------- |
| **Values**  | Any truthy value (e.g. `1`) |
| **Default** | Disabled                    |

Unlike `SILVERY_CAPTURE_OUTPUT` (which captures scheduler output with frame headers), this captures the raw diff patches from the runtime layer.

```bash
SILVERY_CAPTURE_RAW=1 bun run app
```

### SILVERY_DEV

Enable the dev inspector for live tree inspection and diagnostics.

|             |                       |
| ----------- | --------------------- |
| **Values**  | `1`, `true` to enable |
| **Default** | Disabled              |

```bash
SILVERY_DEV=1 bun run app
```

### SILVERY_DEV_LOG

Set the log file path for the dev inspector. Only meaningful when `SILVERY_DEV` is enabled.

|             |                                         |
| ----------- | --------------------------------------- |
| **Values**  | File path (e.g. `/tmp/silvery-dev.log`) |
| **Default** | None (logs to default output)           |

```bash
SILVERY_DEV=1 SILVERY_DEV_LOG=/tmp/silvery-dev.log bun run app
```

## Configuration

These variables change runtime behavior.

### SILVERY_ENGINE

Select the layout engine. Silvery ships with two layout backends.

|             |                             |
| ----------- | --------------------------- |
| **Values**  | `flexily` (default), `yoga` |
| **Default** | `flexily`                   |

Flexily is a zero-allocation Yoga-compatible flexbox engine written in TypeScript. Yoga is the original C++ engine via WASM. Both produce identical layouts for supported properties.

```bash
SILVERY_ENGINE=yoga bun run app
```

### SILVERY_SYNC_UPDATE

Force synchronous terminal output updates by wrapping output in DCS synchronized update sequences.

|             |                       |
| ----------- | --------------------- |
| **Values**  | `1`, `true` to enable |
| **Default** | Disabled              |

Prevents tearing on terminals that support synchronized output. Currently disabled by default due to a Ghostty rendering bug with incremental diff output.

```bash
SILVERY_SYNC_UPDATE=1 bun run app
```

### SILVERY_BG_CONFLICT

Control how background color conflicts are handled when a Text node has both an explicit background and an inherited background from an ancestor Box.

|             |                                     |
| ----------- | ----------------------------------- |
| **Values**  | `throw` (default), `warn`, `ignore` |
| **Default** | `throw`                             |

- `throw` — fail fast on programming errors (recommended)
- `warn` — log a warning but continue
- `ignore` — silently ignore conflicts

```bash
SILVERY_BG_CONFLICT=warn bun run app
```

### SILVERY_NO_INCREMENTAL

Disable incremental rendering entirely. Every frame performs a full fresh render.

|             |                                        |
| ----------- | -------------------------------------- |
| **Values**  | `1` to disable incremental rendering   |
| **Default** | Disabled (incremental rendering is on) |

Useful for isolating whether a bug is in the incremental rendering logic or in the base pipeline.

```bash
SILVERY_NO_INCREMENTAL=1 bun run app
```

### SILVERY_NO_TEXT_CACHE

Disable the text measurement cache. Forces re-measurement of every text node on every render.

|             |                             |
| ----------- | --------------------------- |
| **Values**  | Any truthy value (e.g. `1`) |
| **Default** | Disabled (cache is on)      |

Useful for benchmarking the cache's performance impact or debugging stale measurement issues.

```bash
SILVERY_NO_TEXT_CACHE=1 bun run app
```

### SILVERY_NONTTY

Override the non-TTY rendering mode. Used in examples to test non-interactive output modes.

|             |                                                  |
| ----------- | ------------------------------------------------ |
| **Values**  | `auto`, `tty`, `line-by-line`, `static`, `plain` |
| **Default** | `auto`                                           |

```bash
SILVERY_NONTTY=plain bun run examples/inline/inline-nontty.tsx
```

### SILVERY_THEME

Override the color theme by name. Used by the examples viewer to switch palettes.

|             |                                                                               |
| ----------- | ----------------------------------------------------------------------------- |
| **Values**  | Any built-in palette name (e.g. `catppuccin-mocha`, `dracula`, `tokyo-night`) |
| **Default** | Auto-detected from terminal                                                   |

```bash
SILVERY_THEME=catppuccin-mocha bun run examples/banner.tsx
```

## Quick Reference

| Variable                       | Purpose                            | Category      |
| ------------------------------ | ---------------------------------- | ------------- |
| `SILVERY_STRICT`               | Incremental vs fresh render check  | Verification  |
| `SILVERY_STRICT_TERMINAL`      | ANSI output via terminal emulators | Verification  |
| `SILVERY_STRICT_ACCUMULATE`    | Replay all frames (O(N^2))         | Verification  |
| `SILVERY_STABILITY_SKIP_LINES` | Skip lines in stability checks     | Verification  |
| `SILVERY_INSTRUMENT`           | Render pipeline stats              | Debugging     |
| `SILVERY_CELL_DEBUG`           | Per-cell render trace              | Debugging     |
| `SILVERY_CAPTURE_OUTPUT`       | Capture ANSI frames to file        | Debugging     |
| `SILVERY_CAPTURE_RAW`          | Capture raw diff patches to file   | Debugging     |
| `SILVERY_DEV`                  | Dev inspector                      | Debugging     |
| `SILVERY_DEV_LOG`              | Dev inspector log file             | Debugging     |
| `SILVERY_ENGINE`               | Layout engine selection            | Configuration |
| `SILVERY_SYNC_UPDATE`          | Synchronized terminal output       | Configuration |
| `SILVERY_BG_CONFLICT`          | Background conflict handling       | Configuration |
| `SILVERY_NO_INCREMENTAL`       | Disable incremental rendering      | Configuration |
| `SILVERY_NO_TEXT_CACHE`        | Disable text measurement cache     | Configuration |
| `SILVERY_NONTTY`               | Non-TTY rendering mode             | Configuration |
| `SILVERY_THEME`                | Theme override                     | Configuration |
