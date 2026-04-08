# Debugging Silvery

Canonical reference for debugging rendering issues. All other docs link here instead of duplicating.

## Environment Variables

### Verification Modes

```bash
# Buffer-level: incremental render phase must produce same buffer as fresh render
SILVERY_STRICT=1 bun run app

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

- `SILVERY_STRICT=1` → enables buffer-level check AND vt100 output verification
- `SILVERY_STRICT_TERMINAL=all` → shorthand for `vt100,xterm,ghostty`
- These terminal verification modes use [Termless](https://termless.dev) backends internally

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
| `silvery:render`      | Frame-level spans with per-phase timing           |
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
| `STRICT`                  | Render phase bugs (wrong dirty flag evaluation, skipped nodes, wrong region clearing, scroll tier errors) | Output phase bugs, terminal interpretation bugs                                                          |
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

## Diagnostic Workflow

1. **Start with STRICT**: `SILVERY_STRICT=1 bun vitest run ...` catches any incremental vs fresh render divergence immediately.

2. **Write a failing test**: If fuzz found it, extract the seed. If user-reported, construct a `withDiagnostics(createBoardDriver(...))` test with minimal reproduction steps.

3. **Read the mismatch error**: The enhanced error includes cell values, node path, dirty flags, scroll context, and fast-path analysis. This tells you exactly which node diverged and why it was skipped.

4. **Check instrumentation**: `SILVERY_INSTRUMENT=1` enables stats collection. View with `DEBUG=silvery:content DEBUG_LOG=/tmp/silvery.log` (loggily output) or programmatically via `globalThis.__silvery_content_detail`. Useful for understanding whether too many or too few nodes rendered.

5. **Check the five critical formulas**: `layoutChanged`, `contentAreaAffected`, `contentRegionCleared`, `skipBgFill`, `childrenNeedFreshRender` in `renderNodeToBuffer` (render-phase.ts). If any is wrong, the cascade propagates errors to the entire subtree.

6. **Text bg inheritance**: Text nodes inherit bg via `inheritedBg` (from `findInheritedBg`), not buffer reads. Viewport clears and region clears still affect buffer state, which matters for the `getCellBg` legacy fallback (used by scroll indicators). If your fix clears a region, verify it clears to the correct bg (usually `null` to match fresh render state).

## Symptom → Check Cross-Reference

| Symptom                                                    | Check First                                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Stale background color persists                            | `bgDirty` flag; `inheritedBg` from `findInheritedBg`; is region being cleared?                                                 |
| Border artifacts after color change                        | `stylePropsDirty` vs `contentAreaAffected` distinction; border-only change should NOT cascade                                  |
| Scroll glitch (content jumps/disappears)                   | Scroll tier selection; Tier 1 unsafe with sticky; Tier 3 needs `stickyForceRefresh`                                            |
| Children blank after parent changes                        | `childrenNeedFreshRender` → `childHasPrev=false`; is viewport clear setting `childHasPrev` correctly?                          |
| Absolute child disappears                                  | Two-pass rendering order; absolute children need `ancestorCleared=false` in second pass                                        |
| Content correct initially, wrong after navigation          | Incremental rendering bug; `SILVERY_STRICT=1` will catch it                                                                    |
| Colors wrong but characters correct (garble)               | Output phase: `diffBuffers` row pre-check skipping true-color Map diffs; check `rowExtrasEquals`                               |
| Text bg different from parent Box bg                       | `inheritedBg` from `findInheritedBg`; check if ancestor Box has `backgroundColor`; check region clearing                       |
| Flickering on every render                                 | Check `layoutChangedThisFrame` flag; verify `syncPrevLayout` runs at end of render phase                                       |
| Stale overlay pixels after shrink (black area)             | `clearExcessArea` not called; check `contentRegionCleared` + `forceRepaint` interaction                                        |
| CJK/wide char garble, text shifts right                    | `bufferToAnsi` cursor drift: wide char without continuation at col+1. Run `SILVERY_STRICT_TERMINAL=xterm`                      |
| Flag emoji garble at wide terminals (200+ cols)            | `bufferToAnsi`/`changesToAnsi` cursor re-sync after wide chars; `wrapTextSizing`                                               |
| Stale chars in ancestor border/padding after child shrinks | Descendant overflow: `clearExcessArea` clips to immediate parent. Use `hasDescendantOverflowChanged()` for recursive detection |
