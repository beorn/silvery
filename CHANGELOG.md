# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Synchronized Update Mode (DEC 2026): all TTY output is wrapped with `CSI ? 2026 h` / `CSI ? 2026 l` for flicker-free rendering. Terminals paint atomically instead of showing intermediate states. Disable with `INKX_SYNC_UPDATE=0`.
- `ANSI.SYNC_BEGIN` and `ANSI.SYNC_END` constants exported from `output.ts`
- **Theming system**: `ThemeProvider`, `useTheme`, semantic `$token` color props with `defaultDarkTheme` and `defaultLightTheme` (Nord-inspired)
- **Animation hooks**: `useAnimation`, `useAnimatedTransition`, `useInterval` with easing presets (linear, ease, easeIn, easeOut, easeInCubic, easeOutCubic)
- **Inspector**: `enableInspector()` / `INKX_DEV=1` for render stats, tree dumps, and dirty flag visualization
- **Terminal capabilities detection**: `detectTerminalCaps()` for synchronous env-based capability detection
- **Image component**: Kitty graphics and Sixel protocol rendering with auto-detection and text fallback
- **Transform component**: Ink-compatible per-line string transformation
- **Outline props** on Box: `outlineStyle`, `outlineColor`, `outlineDimColor` — CSS outline equivalent that renders without affecting layout
- **Bracketed paste**: `usePaste` hook (runtime), `onPaste` option on `useInput` (render API)
- **OSC 52 clipboard**: `copyToClipboard`, `requestClipboard`, `parseClipboardResponse` for cross-SSH clipboard access
- **OSC 7 / OSC 8**: Hyperlink support via `<Link>` component
- **Kitty keyboard protocol**: Full support with `enableKittyKeyboard()`, `detectKittySupport()`, `queryKittyKeyboard()`, and auto-enable via `run(<App />, { kitty: true })`
- **Mouse events (SGR protocol)**: `parseMouseSequence`, DOM-level event props (`onClick`, `onDoubleClick`, `onWheel`, etc.) with hit testing and event bubbling
- **macOS modifier symbols**: `parseHotkey("⌘j")`, `matchHotkey()` — supports ⌘⌥⌃⇧✦ symbols
- **Focus system (tree-based)**: `FocusManager`, `useFocusable`, `useFocusWithin`, scope-aware Tab cycling, spatial navigation, click-to-focus
- **EditContext text editing system**: Multi-block cursor navigation, `cursorMoveUp`/`cursorMoveDown`, `stickyX` support, `EditContextDisplay` component
- **TEA sub-path barrel exports**: `inkx/core`, `inkx/store`, `inkx/react` for tree-shakeable imports
- **SplitView component** for workspace/pane layouts
- **Fill component** for `renderStatic` use cases
- **Spinner, ProgressBar, SelectList, Table, Badge, Divider** components
- **Scroll region optimization**: `useScrollRegion` hook using DECSTBM for efficient scrolling
- **Wide character handling** improvements for CJK text in boxes and truncation
- **React DevTools integration**: `REACT_DEVTOOLS=1` for component inspection

### Changed

- Removed legacy focus system (`FocusContext`, `useFocus`) in favor of tree-based `FocusManager`
- DOM-level text truncation replaces manual truncation logic

### Fixed

- Layout stabilization in `renderStatic` for Fill component
- Focus/blur event dispatch and scope-aware tab cycling
- Horizontal clipping for `overflow="hidden"` containers
- Operator orphan prevention in word-wrap
- `cursorMoveDown`/`cursorMoveUp` stuck at wrap boundaries when `stickyX=0`
- Clear stale inverse attributes via `paintDirty` witness + `scrollOffset` propagation
- Incremental rendering `getCellBg` stale background bug
- Virtual text dirty flags not cleared during incremental rendering
- Side borders extend to full content area when `borderTop`/`borderBottom` hidden
- Layout notifications enabled in test renderer and `createApp`

## [0.1.0] - 2026-02-06

### Added

- Five-phase render pipeline: reconcile, measure, layout, content, output
- `useContentRect()` and `useScreenRect()` hooks for synchronous layout feedback
- React 19 compatible reconciler with Suspense, ErrorBoundary, and useTransition
- Box component with full flexbox props, borders, padding, overflow
- Text component with auto-truncation, extended underlines, and color support
- VirtualList for efficient rendering of large lists
- Console component for capturing and displaying console output
- TextInput with full readline shortcuts
- `overflow="scroll"` with `scrollTo` for scrollable containers
- Input layer stack with DOM-style event bubbling (LIFO)
- Plugin composition: withCommands, withKeybindings, withDiagnostics
- Three runtime layers: createRuntime (Elm), run (hooks), createApp (Zustand)
- Terminal rendering modes: fullscreen, inline, static (renderString)
- Pluggable layout engines: Flexx (default) and Yoga (WASM)
- Canvas 2D and DOM render adapters (experimental)
- 28+ unicode utilities (grapheme splitting, display width, CJK, emoji)
- AsyncIterable stream helpers (merge, map, filter, throttle, debounce, batch)
- Playwright-style testing API with locators and auto-refreshing queries
- displayWidth LRU cache (45x faster repeated lookups)
- Buffer-level cellEquals for 3.3x faster "no changes" diffing
- Drop-in Ink compatibility with migration guide

[0.1.0]: https://github.com/beorn/inkx/releases/tag/v0.1.0
