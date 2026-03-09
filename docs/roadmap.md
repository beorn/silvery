# Silvery Roadmap

## Current Status

Terminal target is production-ready (used in [km](https://github.com/beorn/km)). Canvas and DOM adapters are implemented as experimental. Not yet published on npm — pending 1.0 release.

## 1.0 Release

1.0 signals: stable core API, reliable Ink migration, published on npm, semver for breaking changes. Experimental targets (Canvas, DOM) are excluded from the stability guarantee.

### What's done

- **Ink compatibility**: Box, Text, Newline, Spacer, Static, all hooks, `render()`, flexbox props, border styles, compat test suite, migration guide
- **Core API frozen**: 18 components, 11 hooks, runtime (`run()`, `createApp()`), store, render, testing, plugins, focus, input, theming, animation
- **Entry points**: 17 layered entry points (`silvery`, `silvery/ink`, `silvery/runtime`, etc.)
- **Reliability**: memory leak tests, `withDiagnostics` mismatch detection
- **Performance**: benchmark suite with Ink comparison
- **Docs**: README, migration guide, component/hook/plugin reference, architecture deep dive, testing guide, comparison docs, CLAUDE.md

### What's left

| Task                                                                                                         | Bead                    |
| ------------------------------------------------------------------------------------------------------------ | ----------------------- |
| Validate migration guide against 3+ real Ink apps                                                            | —                       |
| API surface audit (remove accidental public exports)                                                         | —                       |
| Tree-shaking verification                                                                                    | km-silvery.layered-arch |
| Long-running memory test (10k+ render cycles)                                                                | —                       |
| Fix border text overflow bug                                                                                 | —                       |
| Bundle size measurement + comparison with Ink                                                                | km-silvery.bundle-audit |
| `npm pack --dry-run` clean tarball                                                                           | —                       |
| Publish `silvery@1.0.0`                                                                                      | —                       |
| CHANGELOG.md                                                                                                 | —                       |
| Terminal compatibility matrix (Ghostty, Kitty, iTerm2, WezTerm, Terminal.app, Windows Terminal, tmux/Zellij) | km-silvery.term-compat  |

### Release sequence

1. Flexily 1.0 published (Silvery depends on it)
2. Layered architecture restructure + tree-shaking verification
3. Bundle audit
4. Fix border text overflow
5. Validate migration against real Ink apps
6. Terminal compatibility matrix
7. Tag and publish `silvery@1.0.0`

## Future Targets

| Target       | Value         | Status       | Entry Point      |
| ------------ | ------------- | ------------ | ---------------- |
| Terminal     | High (proven) | Production   | `@silvery/term`  |
| Canvas 2D    | High          | Experimental | `silvery/canvas` |
| DOM          | Medium        | Experimental | `silvery/dom`    |
| WebGL        | High          | Future       | —                |
| React Native | High          | Future       | —                |
| PDF/Email    | Medium        | Future       | —                |

**Why multi-target matters**: Silvery's core innovation is two-phase rendering with synchronous layout feedback — components know their size during render via `useContentRect()`. This solves the "ResizeObserver dance" problem across all targets, not just terminals.

**Reuse from core**: Reconciler (100%), layout engine (100%), `useContentRect` (100%), style system (partial). ~30% of the codebase is directly reusable.

## Beyond React

The two-phase pattern is framework-agnostic. Potential future adapters: Svelte (compile-time, no reconciler overhead), Solid (fine-grained reactivity), framework-agnostic core (layout + buffer + diffing as standalone library). React is the priority.

## Semver Policy (post-1.0)

| Change                         | Bump                    |
| ------------------------------ | ----------------------- |
| Breaking core API              | Major (2.0)             |
| Breaking experimental targets  | Minor (1.x) with notice |
| New component/hook/entry point | Minor                   |
| Bug fix, perf, docs            | Patch                   |

The `silvery/ink` compat layer is part of the 1.0 stability contract.
