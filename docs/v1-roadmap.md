# inkx v1.0 Roadmap

Current version: **0.1.0**

## What 1.0 Means

A 1.0 release signals: the core API is stable for external adopters, Ink migration works reliably, the package is published on npm, and breaking changes require a major version bump. It does NOT mean every feature is complete -- experimental render targets (Canvas, DOM) and speculative features (React Native, PDF) remain outside the stability guarantee.

## Release Criteria

Every box must be checked before tagging 1.0.

### Ink API Compatibility

- [x] Core components work as drop-in replacements: Box, Text, Newline, Spacer, Static
- [x] Core hooks compatible: `useInput()`, `useApp()`, `useStdout()`, `useStdin()`
- [x] `render()` API works (element-first signature)
- [x] All flexbox props (direction, justify, align, wrap, grow, shrink, basis)
- [x] All border styles (single, double, round, bold, classic, etc.)
- [x] Ink compatibility test suite passes (`tests/compat/`)
- [x] Migration guide written and tested (`docs/guides/migration.md`)
- [ ] Migration guide validated against 3+ real Ink apps (not just synthetic tests)

### Core API Frozen

These APIs are the 1.0 stability contract. After 1.0, changes to these require a major version bump:

- [x] **Components**: Box, Text, VirtualList, Static, Console, TextInput, TextArea, Link, Transform, Image, Spinner, ProgressBar, SelectList, Table, Badge, Divider, Newline, Spacer
- [x] **Hooks**: useContentRect, useScreenRect, useInput, useApp, useTerm, useFocusable, useFocusWithin, usePaste, useAnimation, useAnimatedTransition, useInterval
- [x] **Runtime**: `run()`, `createApp()`, `createRuntime()`
- [x] **Store**: `createStore()`, `inkxUpdate`, `defaultInit`, `withFocusManagement`
- [x] **Render**: `render()`, `renderStatic()`, `renderString()`
- [x] **Testing**: `createRenderer()`, locator API, `app.press()`, `app.click()`, `app.text`, `app.ansi`
- [x] **Plugins**: `withCommands()`, `withKeybindings()`, `withDiagnostics()`
- [x] **Focus**: `createFocusManager()`, `FocusManagerContext`
- [x] **Input**: `InputLayerProvider`, `useInputLayer`
- [x] **Theming**: `ThemeProvider`, `useTheme`, `defaultDarkTheme`, `defaultLightTheme`
- [ ] API surface audit: review all public exports across all entry points, remove accidental leaks

### Layered Entry Points

- [x] `inkx` -- main components and hooks
- [x] `inkx/ink` -- Ink compatibility shim
- [x] `inkx/layout` -- layout primitives
- [x] `inkx/runtime` -- run(), createApp(), useInput
- [x] `inkx/components` -- component exports
- [x] `inkx/focus` -- focus system
- [x] `inkx/input` -- input layer stack
- [x] `inkx/theme` -- theming
- [x] `inkx/animation` -- animation hooks
- [x] `inkx/testing` -- test utilities
- [x] `inkx/store` -- TEA store
- [x] `inkx/core` -- pure types and effect constructors
- [x] `inkx/plugins` -- plugin exports
- [x] `inkx/canvas` -- Canvas 2D adapter (experimental)
- [x] `inkx/dom` -- DOM adapter (experimental)
- [x] `inkx/toolbelt` -- withDiagnostics and driver utilities
- [ ] Layered architecture restructured so minimal core is importable without pulling in all extensions (bead `km-inkx.layered-arch`)
- [ ] Tree-shaking verified: unused entry points don't increase bundle size

### Reliability

- [x] Memory leak tests exist (`tests/memory.test.tsx` -- EventEmitter, mount/unmount cycles)
- [ ] Long-running session memory test: 10,000+ render cycles with stable heap
- [x] No known rendering correctness bugs blocking 1.0
- [x] `withDiagnostics` catches incremental vs. fresh render mismatches in CI
- [ ] Known inkx bugs resolved:
  - [ ] Border text overflow (text bleeds into right border of Box with borderStyle)
  - [ ] Audit other known rendering issues from bead history

### Performance

- [x] Benchmark suite exists (`benchmarks/`)
- [x] Ink comparison benchmarks exist (`benchmarks/ink-comparison/`)
- [x] Performance claims documented (`docs/deep-dives/performance.md`)
- [ ] Benchmark numbers verified on clean machine and recorded in release notes
- [ ] Bundle size measured and documented (bead `km-inkx.bundle-audit`):
  - [ ] Core-only import size measured
  - [ ] Full import size measured
  - [ ] Comparison with Ink bundle size

### Packaging

- [x] `package.json` has `engines` field (`node >=18`, `bun >=1.0`)
- [x] `package.json` has comprehensive `exports` map (17 entry points)
- [x] `sideEffects: false` set
- [ ] `npm pack --dry-run` produces a clean tarball
- [ ] Published on npm as `inkx`
- [x] MIT license
- [x] Peer dependencies declared: `react`, `flexture` (optional), `yoga-wasm-web` (optional)

### Documentation

- [x] README with quick start, features, architecture overview
- [x] `CONTRIBUTING.md` with dev setup, testing, PR guidelines
- [x] Migration guide from Ink (`docs/guides/migration.md`)
- [x] Component reference (`docs/reference/components.md`)
- [x] Hooks reference (`docs/reference/hooks.md`)
- [x] Plugin reference (`docs/reference/plugins.md`)
- [x] Architecture deep dive (`docs/deep-dives/architecture.md`)
- [x] Performance deep dive (`docs/deep-dives/performance.md`)
- [x] Testing guide (`docs/testing.md`)
- [x] Ink comparison (`docs/inkx-vs-ink.md`)
- [x] Cross-framework comparison (`docs/comparison.md`)
- [x] Input features reference (`docs/reference/input-features.md`)
- [x] Terminal capabilities reference (`docs/reference/terminal-capabilities.md`)
- [x] CLAUDE.md -- AI-readable framework reference
- [ ] CHANGELOG.md started
- [ ] Terminal compatibility matrix documented (which terminals support which protocols)

### Terminal Compatibility

- [ ] Tested and documented on:
  - [ ] Ghostty
  - [ ] Kitty
  - [ ] iTerm2
  - [ ] WezTerm
  - [ ] Terminal.app (macOS default)
  - [ ] Windows Terminal
  - [ ] tmux / Zellij (multiplexer behavior)
- [ ] Graceful degradation verified: app works (reduced features) on terminals without Kitty/mouse support

## Known Gaps / Blockers

1. **Layered architecture** (bead `km-inkx.layered-arch`) -- Entry points exist but the internal structure hasn't been restructured for minimal core imports. Tree-shaking behavior is unverified.
2. **Bundle audit** (bead `km-inkx.bundle-audit`) -- Blocked by layered-arch. Bundle size not formally measured.
3. **Vendor rename** (bead `km-infra.vendor-rename-impl`) -- npm publish blocked until the vendor directory rename is executed across the monorepo.
4. **Border text overflow** -- Known bug where text bleeds into right border of Box with `borderStyle`. Currently worked around with `paddingRight={1}` in km-tui. Needs a proper fix in inkx.
5. **Terminal compatibility matrix** (bead `km-inkx.term-compat`) -- No formal testing across terminal emulators yet.
6. **Migration validation** -- Migration guide exists but hasn't been tested against real-world Ink applications beyond synthetic tests.

## What's NOT in 1.0

These are explicitly excluded from the 1.0 stability guarantee:

| Feature                     | Status       | Entry Point         | Notes                             |
| --------------------------- | ------------ | ------------------- | --------------------------------- |
| Canvas 2D adapter           | Experimental | `inkx/canvas`       | API may change without major bump |
| DOM adapter                 | Experimental | `inkx/dom`          | API may change without major bump |
| WebGL adapter               | Future       | --                  | Not started                       |
| React Native target         | Future       | --                  | Not started                       |
| PDF/Email generation        | Future       | --                  | Not started                       |
| `useScrollRegion` (DECSTBM) | Experimental | `inkx/hooks`        | May stabilize in 1.x              |
| React DevTools integration  | Experimental | `enableInspector()` | Debug-only, API may change        |

Experimental entry points are available but carry no stability guarantee. They can have breaking changes in minor versions (1.1, 1.2) with documentation.

## Semver Policy

After 1.0:

| Change                                                                      | Version Bump                            |
| --------------------------------------------------------------------------- | --------------------------------------- |
| Breaking change to core API (component props, hook signatures, runtime API) | **Major** (2.0)                         |
| Breaking change to experimental entry points (canvas, dom)                  | **Minor** (1.x) with deprecation notice |
| New component, hook, or entry point                                         | **Minor** (1.1, 1.2)                    |
| Bug fix, performance improvement, documentation                             | **Patch** (1.0.1)                       |
| New terminal protocol support                                               | **Minor**                               |

**Ink compatibility contract**: The `inkx/ink` entry point and the Ink-compatible subset of the main API are part of the 1.0 contract. If Ink adds new API surface, inkx may adopt it in a minor release. Removing Ink-compatible API is a breaking change.

## Release Sequence

inkx should reach 1.0 **after** Flexx, because:

1. inkx depends on Flexx for its default layout engine
2. A stable Flexx (^1.0.0 peer dependency) simplifies inkx's stability story
3. inkx has a larger API surface with more to audit

Suggested order:

1. Flexx 1.0 published on npm
2. Complete layered architecture restructure
3. Run bundle audit with Flexx 1.0 as dependency
4. Fix border text overflow bug
5. Validate migration guide against real Ink apps
6. Document terminal compatibility matrix
7. Complete vendor rename
8. Tag and publish `inkx@1.0.0`

## Relationship to Existing Roadmap

The existing `docs/roadmap.md` covers the **maximum vision** for inkx across all render targets (terminal, canvas, DOM, React Native, PDF). This document (`v1-roadmap.md`) defines what specifically ships in 1.0 -- which is the terminal target at production quality with a stable public API. The broader multi-target vision remains the long-term direction but is not gated on 1.0.
