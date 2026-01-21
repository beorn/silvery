# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Scroll indicator display (`scrollTo` prop change detection improvement)
- Documentation for `Box` background colors and layout guides
- Ink compatibility analysis documentation
- **Nested Text styling with push/pop semantics**: Child Text elements properly override parent styles and restore them after. E.g., `<Text color="black">before <Text color="red">RED</Text> after</Text>` correctly renders "after" in black.

### Fixed

- `scrollTo` prop changes now correctly trigger layout recalculation
- **Black color (index 0) now renders correctly**: Fixed bug where `color="black"` was treated as no color due to using 0 as the sentinel value. Colors are now stored with +1 offset to distinguish null from black.

## [0.0.1] - 2025-01-19

### Added

#### Core Rendering

- React 18/19 compatible custom reconciler using `react-reconciler`
- Two-phase rendering: layout calculation before content rendering
- Double-buffered terminal output with efficient ANSI diffing
- Cursor movement optimization and style coalescing

#### Components

- `Box` - Flexbox container with full Yoga layout support
  - All standard flexbox properties (`flexDirection`, `flexGrow`, `alignItems`, `justifyContent`, etc.)
  - Padding, margin, and gap support
  - Border rendering with multiple styles (`single`, `double`, `round`, `bold`, `classic`)
  - Background colors
- `Text` - Text rendering with ANSI styling
  - Color support (named colors, hex, RGB)
  - Text attributes (`bold`, `dim`, `italic`, `underline`, `strikethrough`, `inverse`)
  - Wrap modes (`wrap`, `truncate`, `truncate-start`, `truncate-middle`, `truncate-end`)
  - Full chalk/ANSI compatibility with style preservation through truncation
- `Newline` - Explicit line break component
- `Spacer` - Flexible space component for layouts
- `Static` - Component for rendering content that should not be re-rendered

#### Hooks

- `useLayout()` - Returns computed dimensions (`{ width, height, x, y }`) for the current component
  - Enables components to know their size without prop threading
  - Automatically re-renders when layout changes
- `useInput()` - Keyboard input handling with parsed key information
  - Arrow keys, function keys, modifiers (Ctrl, Shift, Meta)
  - Raw character input
  - `isActive` option for conditional input handling
- `useApp()` - Application lifecycle control
  - `exit()` function for graceful shutdown
- `useStdout()` - Access to stdout stream and dimensions
- `useStdin()` - Access to stdin stream and raw mode control
- `useFocus()` - Make components focusable with tab navigation
  - `isFocused` state
  - `autoFocus` option
  - Custom focus IDs
- `useFocusManager()` - Programmatic focus control
  - `focusNext()`, `focusPrevious()`
  - `enableFocus()`, `disableFocus()`
  - `focus(id)` for direct focus

#### Scrolling

- `overflow="scroll"` support for Box components
  - Automatic scroll offset calculation
  - `scrollTo={index}` prop for programmatic scrolling to child index
  - Visual scroll indicators on borders
  - Hidden item counts (`hiddenAbove`, `hiddenBelow`)
- `position="sticky"` support within scroll containers
  - Sticky headers/footers that stay visible during scroll
  - `stickyTop` and `stickyBottom` offset configuration

#### Layout Engines

- Pluggable layout engine architecture
- **Yoga** (default) - Facebook's flexbox implementation via WASM
  - Full flexbox spec support
  - RTL layout support
  - Baseline alignment
- **Flexx** - Pure JS alternative layout engine
  - 2.5x faster performance
  - 5x smaller bundle size
  - Synchronous initialization

#### Testing

- `createTestRenderer()` - Testing library for Inkx components
  - `ink-testing-library` compatible API
  - Auto-cleanup between renders
  - `lastFrame()` for snapshot assertions
  - `frames` array for render history
  - `stdin.write()` for simulating keyboard input
  - `rerender()` for testing updates
  - Custom dimensions per render (`columns`, `rows`)
- `stripAnsi()` - Remove ANSI codes from strings
- `normalizeFrame()` - Normalize frame output for comparison
- `waitFor()` - Async condition waiting utility

#### Terminal Features

- Alternate screen buffer support (`alternateScreen` option)
- Terminal resize handling
- Ctrl+C exit handling (configurable via `exitOnCtrlC`)
- Console patching for clean output

#### Unicode Support

- Full Unicode grapheme cluster support
- Wide character handling (CJK, emoji)
- ANSI-aware text width calculation
- Proper text truncation preserving ANSI escape codes

#### ANSI/Chalk Compatibility

- Full chalk styling support in text content
- ANSI code detection and parsing
- Style merging (ANSI styles override base styles)
- Background color conflict detection with configurable behavior
  - `INKX_BG_CONFLICT` environment variable (`throw`, `warn`, `ignore`)

### Notes

- Ink-compatible API - designed as drop-in replacement
- Architecture follows standard two-phase rendering (layout then paint)
- TypeScript-first with full type definitions

[Unreleased]: https://github.com/beorn/inkx/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/beorn/inkx/releases/tag/v0.0.1
