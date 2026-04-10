# Changelog

All notable changes to Silvery are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.12.0] - 2026-04-10

### Added

- **Pretext-inspired text layout** — `width="snug-content"` finds the tightest box width that keeps the same line count ([Pretext: "shrinkwrap"](https://chenglou.me/pretext/bubbles/)). `wrap="even"` uses minimum-raggedness dynamic programming for globally-optimal line breaks. See [Text Layout guide](/guide/layouts#text-layout).
- **PreparedText cache** — three-level per-node text analysis cache (plain text, collected styled text, formatted lines per width). 27-49% faster on resize workloads, zero regression on cursor move.
- **Floating component defaults** — ModalDialog, Toast, Tooltip default to `width="snug-content"` (tightest fit around content). All accept spread BoxProps for overriding.
- **Pretext demo** — `examples/pretext-demo.tsx` with interactive chat bubbles, even wrapping, and combined showcase.
- **Node.js 23.6+ CLI** — `bunx silvery examples` works on both Bun and Node.
- **Benchmarks** — resize/fold, scroll container, large terminal (400×200), Pretext algorithms, reconciliation profiling.

### Fixed

- **Wide char STRICT** — grapheme cluster handling (CJK, emoji, ZWJ sequences) in STRICT output verification parser.
- **VT100 pending wrap** — STRICT_OUTPUT false positives on fold/collapse operations.
- **Pretext correctness** — 5 bugs fixed after GPT 5.4 Pro review: shrinkwrap lower bound, newline handling in Knuth-Plass DP, ANSI-aware trimming, L3 cache invalidation.

### Changed

- **Reactive cascade is production path** — alien-signals computeds drive rendering by default. Imperative oracle runs only under `SILVERY_STRICT=1`.
- **Bit-packed dirty flags** — 7 epoch fields (56 bytes) → dirtyBits + dirtyEpoch (16 bytes per node).
- **Pipeline simplification** — -1,111 LOC (STRICT extraction to output-verify.ts, instrumentation consolidation, cascade dedup).

### Performance

- Massive performance improvements across the rendering pipeline: reactive cascade, bit-packed dirty flags, PreparedText cache (27-49% faster resize), layout-on-demand gate, container-level layout skip, dirty-set rendering.

## [0.11.0] - 2026-04-09

### Added

- **Ink 7.0 compat — BackgroundContext shim** — exposes Ink 7.0's context-based background inheritance API via `packages/ink/src/bg-context.ts`. Makes +27 Ink 7.0 tests pass on the compat layer.
- **Ink 7.0 compat — maxFps render throttle** — `maxFps` option in the compat renderer throttles render rate to match Ink 7.0's behavior.
- **Ink 7.0 compat — debug cursor API shim** — Ink-compatible cursor debug API for visibility/position interaction tests.
- **Ink 7.0 compat — `wrap="hard"`** — character-level text truncation for Ink 7.0 parity (vs word-boundary wrapping).
- **Ink 7.0 compat — per-side `borderBackgroundColor`** — `borderTopBackgroundColor`, `borderRightBackgroundColor`, etc., matching Ink 7.0's per-side border background prop API.
- **Text — CJK wide-character overlay clearing** — when overwriting a continuation cell, the owning wide-char cell is cleared to a space. Fixes rendering when CJK cells are partially occluded.
- **Flexily — overflow clipping at edges** — left/right overflow clipping works cleanly with borders and margins via `minCol` parameter in text render.
- **Pre-built `dist/` via tsup** — silvery now ships both raw TypeScript source (for Bun consumers, `src/`) and pre-built `.js` + `.d.ts` (for npm consumers, `dist/`) via conditional exports. Zero build step for Bun users; instant imports for everyone else.
- **Long-lived `Ag` renderer in `createApp`** — reuse Ag instance across frames instead of creating per-render. Combined with dirty node SET optimization for O(1) layout-dirty checks.
- **Dirty node SET + propsEqual collapse** — per-node dirty tracking with independent flags, 3-pass prop comparison collapsed into 1 pass. Yields measurable perf win on kanban and memo'd workloads.
- **Atomicity framing in docs + blog** — docs now explain the three axes of atomicity (time, space, content) that the layout-first pipeline + cell-level diff + DEC mode 2026 enable. See the updated homepage, `silvery-vs-ink.md`, and the forthcoming blog post on Claude Code's rendering dilemma.
- **Interactions runtime** — selection, find, copy-mode, and drag as composable runtime features (`SelectionFeature`, `FindFeature`, `CopyModeFeature`, `DragFeature`) in `@silvery/ag-term/features/`. Each feature is wired automatically by its provider (`withDomEvents` for selection and drag, `withFocus` for find and copy-mode).
- **InputRouter** — centralized input routing in `@silvery/create/internal/` dispatches keyboard and mouse events to registered feature handlers with priority ordering.
- **CapabilityRegistry** — runtime capability discovery in `@silvery/create/internal/`. Features register themselves; React components access them via `CapabilityRegistryContext`.
- **`useSelection` hook** — reads selection state from the CapabilityRegistry. Replaces the old `useTerminalSelection` + `TerminalSelectionProvider` pattern.
- **Composition docs** — new guide pages: [Providers and Plugins](docs/guide/providers.md) and [Headless Machines](docs/guide/headless-machines.md).
- **`@silvery/commander`: typed inline arg syntax** — `command("deploy <service> [env]")` now parses positional arguments embedded in the command name string and contributes them to the typed `Args` tuple and `ArgsRecord`.
- **`@silvery/commander`: `.actionMerged()`** — explicit opt-in for the merged named-object form. Receives `(params, cmd)` where `params` contains all positional args (camelCased) merged with options.
- **`@silvery/commander`: multi-line console blocks in help sections** — `addHelpSection` row terms can now contain `\n`-separated lines.
- **`@silvery/commander`: shell prompt detection across all sections** — lines starting with `$ `, `# `, `> `, or `❯ ` get console-block styling in any `addHelpSection`.
- **Rect hook rename** — `contentRect` → `boxRect`, `renderRect` → `screenRect`, `screenRect` → `scrollRect`. Six hooks consolidated into three via overloads. Migration guide in docs.

### Fixed

- **STRICT env bug** — `isStrictOutput()` treated the string `"0"` as truthy, so `SILVERY_STRICT=0` didn't actually disable STRICT mode. Bench runs before the fix paid full O(cells) verification overhead every iteration; post-fix numbers are 2.5-5.2× faster than Ink 7.0 on mounted workloads (all 16 scenarios).
- **Render phase typo** — `AgNode["boxRectt"]` → `AgNode["boxRect"]` in render-phase.ts.
- **Output phase — text clipping at left edge** — text in `overflow="hidden"` containers now clips correctly at the left edge via `minCol` parameter.
- **Ink compat — kitty keyboard default flags** — matches Ink's byte-wise compat for disambiguate escape codes.
- **Ink compat — stderr replay frame in debug mode** — emits replay frame for stderr writes during debug mode capture.
- **`useCallbackRect` subscription stability** — `getRect` was captured per-render, invalidating subscriptions on every re-render. Wrapped in a ref for stability, matching the `callbackRef` pattern.
- **Contentprops dead code** — removed deprecated `propsEqual` / `layoutPropsChanged` / `contentPropsChanged` with zero callers.

### Performance

- **Output phase — combined SGR codes** — combine consecutive SGR codes into a single escape sequence where possible.
- **2.5-5.2× faster than Ink 7.0** on mounted workloads (cursor move, kanban card edit, memo'd list toggles). Wins all 16 benchmark scenarios. Run `bun run bench` to reproduce.
- **28-192× less output** than full redraw on incremental updates — cell-level buffer diff + relative cursor addressing.
- **Bundle parity with Ink+Yoga** — `silvery/runtime` is 114.9 KB gzipped vs Ink+Yoga's 116.6 KB (0.99×). `silvery/ink` compat layer is 119.2 KB (+2.2 KB over Ink baseline).

### Documentation

- **Homepage** — "React for modern terminal apps" hero. Merged Responsive Layout and Atomic Rendering cards (same architectural root). Replaced "100x" claim with 2.5-5.2× honest numbers. Bulleted rendering mode list (inline incremental / fullscreen / static / virtual).
- **silvery-vs-ink.md** — added "The atomicity story" section covering time/space/content atomicity. Replaced cold-init perf table with canonical mounted benchmarks. Updated compat stats to 918+/931 (~98.6%) against Ink 7.0.
- **why-silvery.md, faq.md, README.md, about.md, compatibility.md** — uniform update to new framing and numbers.

### Breaking Changes

- **Removed hooks** — `useTerminalSelection`, `usePointerState`, `useFind`, `useFindProvider`, `useCopyMode`, `useCopyProvider` are superseded by the feature-based architecture. The old hooks still exist for backwards compatibility but are no longer the recommended API.
- **Text selection** now activates automatically via `withDomEvents()` — no explicit hook setup required.
- **Find** now activates automatically via `withFocus()` with `Ctrl+F` — no explicit `useFind` setup required.
- **Copy-mode** now activates automatically via `withFocus()` with `Esc, v` — no explicit `useCopyMode` setup required.
- **Rect hook rename** (see Added): if you use `contentRect` / `renderRect` / `screenRect` names, they've been renamed. See the Layout Coordinates guide for the migration.

## [0.9.0] - 2026-03-29

### Added

- **Interactive canvas rendering** — `renderToCanvas()` now supports full keyboard input via hidden textarea, RuntimeContext, FocusManager, ThemeProvider, and CursorProvider. Showcase demos switched from xterm.js to canvas.
- **Variable-height virtualizer** — `VirtualList` supports dynamic item heights via measurement, not just fixed `itemHeight`.
- **Canvas input handler** — new `createCanvasInput()` for DOM KeyboardEvent → terminal escape sequence conversion.

### Fixed

- **Kitty keyboard: shifted punctuation** — `Shift+1` now correctly produces `!` (not `1`) via `shifted_codepoint`. Default Kitty flags upgraded to `DISAMBIGUATE | REPORT_EVENTS | REPORT_ALL_KEYS` (11). Warns when shifted info is missing.
- **`matchHotkey` layout-independent** — single-character hotkeys (`"!"`, `"J"`, `"@"`) skip shift check. Works across all keyboard layouts.
- **Mouse mode 1003** — restored any-event tracking for hover support.
- **Commander: `NO_COLOR`** — `colorizeHelp` now respects `NO_COLOR` environment variable.

### Documentation

- Example pages: added `npx silvery examples` run commands with code-group tabs (npm/bun/pnpm/vp).
- Removed placeholder blog and live-demo pages.
- Showcase inventory updated for canvas renderer.

## [0.4.0] - 2026-03-23

### Breaking Changes

- **Era2 package renames** — `@silvery/react` → `@silvery/ag-react`, `@silvery/term` → `@silvery/ag-term`, `@silvery/ui` merged into `@silvery/ag-react/ui`, `@silvery/compat` → `@silvery/ink`
- **TeaNode → AgNode** — core node type renamed across the entire codebase
- **createApp moved to @silvery/create** — canonical import is now `@silvery/create/create-app` (ag-term re-exports for backwards compat)

### Added

- **`@silvery/ag` package** — core types (AgNode, BoxProps, keys, focus) extracted from tea
- **`render()` beginner API** — zero-ceremony entry point: `await render(<App />).run()`
- **Component-tier examples** — 7 simple examples using `run()` + React hooks (no TEA required)
- **Subpath exports** — `silvery/runtime`, `silvery/theme`, `silvery/ui` for targeted imports
- **Build script** — `bun run build` produces pre-built JS bundles via Bun.build()

### Changed

- **3 public packages** — `silvery`, `@silvery/create`, `@silvery/test`. Internal packages (`@silvery/ag`, `@silvery/ag-react`, `@silvery/ag-term`, `@silvery/theme`, `@silvery/ink`) are published but not user-facing.
- **Examples reorganized** — `examples/components/` (no TEA) and `examples/apps/` (with TEA)
- **Docs rewritten** — rendering-first positioning, TEA is optional, Ink-compatible messaging

### Fixed

- Border text overflow: scroll indicator text now truncates when box is narrower than indicator text
- Package export resolution in vitest (dist/ vs src/ conditions)

## [0.3.0] - 2026-03-20

README rewrite, website positioning, docs site restructuring. No code changes.

## [0.2.0] - 2026-03-09

The Silvery release. Complete rename from hightea to silvery, monorepo restructured as `@silvery/*` packages, and ecosystem-wide migration (loggily, flexily, @silvery/theme).

### Added

- `silvery/ink` and `silvery/chalk` compatibility subpaths for zero-effort migration from Ink/Chalk.
- `@silvery/ink` package for ink/chalk API compatibility layer.
- `@silvery/theme` package (absorbed from standalone swatch project) with 45 built-in color palettes and 33 semantic design tokens.
- `@silvery/test` package with unified `createRenderer()` API, auto-refreshing locators, and Playwright-style assertions.
- `@silvery/create` package for optional TEA (The Elm Architecture) state machines with `zustand-tea` middleware.
- `@silvery/ag-react/ui` package with 23+ components: ModalDialog, Toast, SplitView, CommandPalette, SelectList, Table, ScrollbackView, ErrorBoundary, Tabs, and more.
- VitePress documentation site at silvery.dev with migration guide, API reference, and live xterm.js demos.
- Examples directory with interactive demos (dashboard, live-resize, outline, scrollback, Kitty protocol).

### Changed

- **Renamed**: hightea -> silvery across all packages, imports, docs, and URLs.
- **Renamed**: decant -> loggily (logging library).
- **Renamed**: flexture -> flexily (layout engine).
- **Renamed**: swatch -> @silvery/theme (absorbed into monorepo).
- Package structure: monolith split into `@silvery/ag-react`, `@silvery/ag-term`, `@silvery/create`, `@silvery/ansi`, `@silvery/ag-react/ui`, `@silvery/theme`, `@silvery/test`, `@silvery/ink`.
- GitHub repositories renamed: beorn/hightea -> beorn/silvery, beorn/decant -> beorn/loggily, beorn/flexture -> beorn/flexily.

## [0.1.0] - 2026-03-05

The hightea release. Renamed from inkx to hightea, with new domain (hightea.dev) and monorepo consolidation.

### Added

- Custom domain: hightea.dev.
- `@hightea/core` package for shared types.
- `@hightea/ansi` merged into monorepo (previously standalone `@beorn/chalkx`).
- `@hightea/ui` merged into monorepo (previously standalone `@beorn/inkx-ui`).

### Changed

- **Renamed**: inkx -> hightea, chalkx -> @hightea/ansi across all source, docs, and URLs.
- Package structure: `@beorn/inkx` -> `@hightea/term`, `@beorn/chalkx` -> `@hightea/ansi`, `@beorn/inkx-ui` -> `@hightea/ui`.

## [0.0.x] - 2026-01-19 to 2026-03-04

The inkx era. Initial development as a high-performance Ink alternative with incremental rendering.

### Added — Rendering Engine

- **Incremental content phase**: per-node dirty tracking with 7 independent flags (`contentDirty`, `stylePropsDirty`, `bgDirty`, `subtreeDirty`, `childrenDirty`, `layoutDirty`, `layoutChangedThisFrame`). Only changed nodes re-render, producing 28-192x fewer bytes on typical incremental updates.
- **Three-tier scroll optimization**: buffer shift (Tier 1, scroll-only changes), full viewport clear (Tier 2, structural changes), and subtree-dirty-only (Tier 3, targeted re-render).
- **Sticky children**: `position="sticky"` with two-pass rendering (normal flow first, then sticky headers on top). Works inside and outside scroll containers.
- **Inline incremental rendering**: `createOutputPhase()` with instance-scoped cursor tracking. Relative cursor positioning for inline mode achieves parity with fullscreen incremental rendering.
- **Text background inheritance**: explicit `inheritedBg` parameter through the render tree, decoupling text rendering from buffer state. Eliminates `getCellBg` mismatches on incremental renders.
- **BgSegment tracking**: strips ANSI background from text content and tracks bg ranges per-segment, preventing background bleed across wrapped lines.
- **SILVERY_STRICT mode**: verifies incremental render produces identical output to fresh render, cell-by-cell, including vt100 ANSI output verification.
- **CJK/wide character support**: correct cursor advancement, continuation cells, and boundary handling for double-width characters.
- **True color row pre-check**: `rowExtrasEquals()` for Map-based data (true colors, underline colors, hyperlinks) prevents stale color artifacts.

### Added — Layout

- **Pluggable layout engine**: Yoga and Flexily adapters with zero-allocation option.
- `useBoxRect()` / `useScrollRect()` hooks for synchronous layout feedback (no useEffect, no layout thrashing).
- `overflow="scroll"` containers with `scrollTo` (edge-based) and `scrollOffset` (explicit) control.
- `position="sticky"` with `stickyTop` / `stickyBottom` offsets.
- `position="absolute"` with three-pass paint-order rendering (normal flow, sticky, absolute).
- `outlineStyle` prop: border characters that overlap content without affecting layout (CSS `outline` equivalent).
- `overflowIndicator` prop: scroll indicators on bordered or borderless containers.
- `display="none"` support.

### Added — Input and Terminal Protocols

- **Kitty keyboard protocol**: full support with key press/repeat/release events, super/hyper/capsLock/numLock modifiers, and auto-detection (`detectKittySupport`).
- **SGR mouse events**: DOM-level mouse event system with hit testing, `pointerEvents` prop, and cross-chunk buffering.
- **Bracketed paste**: automatic paste detection and handling.
- **Clipboard**: read/write via OSC 52.
- **Images**: sixel and Kitty image protocol support.
- **Hyperlinks**: native OSC 8 hyperlink rendering in the pipeline.
- **Synchronized updates**: mode 2026 for flicker-free rendering.
- **Cursor styles**: DECSCUSR cursor shape control.
- **Terminal queries**: cursor position, colors, device attributes, focus, DECRQM, pixel size.
- **Terminal capability detection**: `termtest` diagnostic suite for terminal feature verification.

### Added — Components and Hooks

- Core: `Box`, `Text`, `Transform`.
- Layout: `VirtualList`, `HorizontalVirtualList`, `ScrollbackView`, `ScrollbackList`, `SplitView`, `Fill`.
- Input: `TextInput`, `TextArea` (with selection and DECSCUSR cursor styles), `EditContext` (unified text editing with invertible ops), `InputBoundary`.
- UI: `SelectList`, `Table`, `Spinner`, `ProgressBar`, `Image`, `Link`, `Tabs`, `Toast`, `ModalDialog`, `CommandPalette`, `ErrorBoundary` (with resetKeys).
- Focus: DOM-native focus system with spatial navigation, peer scope system (`activateScope`), `useFocusable`, `useFocusWithin`.
- Hooks: `useInput`, `useApp`, `useBoxRect`, `useScrollRect`, `useCursor`, `useScrollback`, `useTerm`, `useConsole`.
- Runtime: `render()`, `run()`, `createApp()`, `createStore()`, `createTerm()`.
- Testing: `createRenderer()` with auto-refreshing locators, `withDiagnostics()`, `debugTree()`.

### Added — Theming

- `@silvery/theme` with `ColorPalette` and `Theme` types (33 semantic tokens).
- 45 built-in color palettes (Snazzy, Monokai, and more).
- `$token` color resolution in all style props via active theme context.
- `Box` `theme` prop for per-subtree theme override.
- `detectTheme()` / `deriveTheme()` for automatic terminal theme detection.

### Added — State Management

- TEA (The Elm Architecture) optional integration via `@silvery/create`.
- `zustand-tea` middleware: TEA effects for Zustand stores.
- `createSlice()` helper for ops-as-data patterns.
- Four-level state management progression documented: component -> store -> ops-as-data -> pure machine.

### Added — Developer Experience

- `SILVERY_INSTRUMENT=1`: exposes skip/render counts, cascade depth, scroll tier decisions.
- `DEBUG=silvery:* DEBUG_LOG=/tmp/silvery.log`: pipeline debug output.
- `renderString()` for static one-shot rendering.
- `app.resize()` for virtual terminal resize in tests.
- Bundle size measurement script for all entry points.
- Headless screenshot support.
- Slow frame warnings and render profiling (`SILVERY_PROFILE_RENDER`).

### Added — Browser Support

- xterm.js render target with VitePress live demo component.
- `Symbol.dispose` polyfill for Safari compatibility.
- `child_process` stub for browser builds.

### Fixed

- Scrollback compaction loop and resize corruption in `run()` runtime.
- `ScrollbackView` footer auto-sizes to content (deprecate `footerHeight`).
- `useBoxRect` returning 0x0 in xterm renderer.
- SGR mouse cross-chunk buffering and browser renderer coordinates.
- Text background bleed across wrapped lines (BgSegment fix).
- Output phase true-color row pre-check skipping Map diffs.
- CJK wide character cursor drift in `bufferToAnsi`.
- Scrollback promotion jump-up in leftover erasure.
- Window resize: clear scrollback + screen instead of selective re-emit.
- Inline mode resize: smart clear and persistent cursor tracking.
- Raw mode auto-enable in `render()` API for interactive apps.
- `useInput` graceful no-op without InputContext (renderStatic compat).
- Focus system: `useFocusWithin` edge cases and peer scope memory.

### Performance

- Incremental rendering: 28-192x fewer bytes per keystroke vs full re-render.
- Buffer shift optimization for scroll-only changes (Tier 1).
- Measure function caching: eliminates O(n) measure overhead.
- `contentDirty` scoping: border-only paint changes no longer cascade through child subtrees.
- `layoutChangedThisFrame` flag: eliminates permanent O(N) content-phase recalculation from stale `prevLayout`.
- Zero-allocation Flexily layout engine option.

[Unreleased]: https://github.com/beorn/silvery/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/beorn/silvery/compare/v0.4.0...v0.9.0
[0.4.0]: https://github.com/beorn/silvery/compare/v0.2.0...v0.4.0
[0.2.0]: https://github.com/beorn/silvery/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/beorn/silvery/compare/v0.0.1...v0.1.0
[0.0.x]: https://github.com/beorn/silvery/releases/tag/v0.0.1
