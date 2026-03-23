# Changelog

All notable changes to Silvery are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-03-23

### Breaking Changes

- **Era2 package renames** — `@silvery/react` → `@silvery/ag-react`, `@silvery/term` → `@silvery/ag-term`, `@silvery/ui` merged into `@silvery/ag-react/ui`, `@silvery/compat` → `@silvery/ink`
- **TeaNode → AgNode** — core node type renamed across the entire codebase
- **createApp moved to @silvery/tea** — canonical import is now `@silvery/tea/create-app` (ag-term re-exports for backwards compat)

### Added

- **`@silvery/ag` package** — core types (AgNode, BoxProps, keys, focus) extracted from tea
- **`render()` beginner API** — zero-ceremony entry point: `await render(<App />).run()`
- **Component-tier examples** — 7 simple examples using `run()` + React hooks (no TEA required)
- **Subpath exports** — `silvery/runtime`, `silvery/theme`, `silvery/ui` for targeted imports
- **Build script** — `bun run build` produces pre-built JS bundles via Bun.build()

### Changed

- **3 public packages** — `silvery`, `@silvery/tea`, `@silvery/test`. Internal packages (`@silvery/ag`, `@silvery/ag-react`, `@silvery/ag-term`, `@silvery/theme`, `@silvery/ink`) are published but not user-facing.
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
- `@silvery/tea` package for optional TEA (The Elm Architecture) state machines with `zustand-tea` middleware.
- `@silvery/ag-react/ui` package with 23+ components: ModalDialog, Toast, SplitView, CommandPalette, SelectList, Table, ScrollbackView, ErrorBoundary, Tabs, and more.
- VitePress documentation site at silvery.dev with migration guide, API reference, and live xterm.js demos.
- Examples directory with interactive demos (dashboard, live-resize, outline, scrollback, Kitty protocol).

### Changed

- **Renamed**: hightea -> silvery across all packages, imports, docs, and URLs.
- **Renamed**: decant -> loggily (logging library).
- **Renamed**: flexture -> flexily (layout engine).
- **Renamed**: swatch -> @silvery/theme (absorbed into monorepo).
- Package structure: monolith split into `@silvery/ag-react`, `@silvery/ag-term`, `@silvery/tea`, `@silvery/ansi`, `@silvery/ag-react/ui`, `@silvery/theme`, `@silvery/test`, `@silvery/ink`.
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
- `useContentRect()` / `useScreenRect()` hooks for synchronous layout feedback (no useEffect, no layout thrashing).
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
- Hooks: `useInput`, `useApp`, `useContentRect`, `useScreenRect`, `useCursor`, `useScrollback`, `useTerm`, `useConsole`.
- Runtime: `render()`, `run()`, `createApp()`, `createStore()`, `createTerm()`.
- Testing: `createRenderer()` with auto-refreshing locators, `withDiagnostics()`, `debugTree()`.

### Added — Theming

- `@silvery/theme` with `ColorPalette` and `Theme` types (33 semantic tokens).
- 45 built-in color palettes (Snazzy, Monokai, and more).
- `$token` color resolution in all style props via active theme context.
- `Box` `theme` prop for per-subtree theme override.
- `detectTheme()` / `deriveTheme()` for automatic terminal theme detection.

### Added — State Management

- TEA (The Elm Architecture) optional integration via `@silvery/tea`.
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
- `useContentRect` returning 0x0 in xterm renderer.
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

[Unreleased]: https://github.com/beorn/silvery/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/beorn/silvery/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/beorn/silvery/compare/v0.0.1...v0.1.0
[0.0.x]: https://github.com/beorn/silvery/releases/tag/v0.0.1
