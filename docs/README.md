# inkx Documentation

## Where to Start

- **New to inkx?** Start with [Getting Started](guides/getting-started.md) -- build your first app in 5 minutes
- **Migrating from Ink?** Read [inkx vs Ink](inkx-vs-ink.md) and [Migration Guide](guides/migration.md)
- **Building an app?** [Components](reference/components.md) + [Hooks](reference/hooks.md) + [Input Features](reference/input-features.md)
- **Testing?** [Testing](testing.md) + [Plugins](reference/plugins.md) (withCommands, withDiagnostics)
- **Understanding internals?** [Architecture](deep-dives/architecture.md) → [Internals](deep-dives/internals.md) → [Performance](deep-dives/performance.md)
- **Something broken?** [Troubleshooting](troubleshooting.md)
- **Contributing?** See [CONTRIBUTING.md](../CONTRIBUTING.md)

## Suggested Reading Order

1. [Getting Started](guides/getting-started.md) -- first app, input handling, layout feedback
2. [Components](reference/components.md) -- Box, Text, VirtualList, Console, inputs
3. [Hooks](reference/hooks.md) -- useContentRect, useInput, useApp, animations
4. [Architecture](deep-dives/architecture.md) -- five-phase pipeline, RenderAdapter

## Guides

Tutorials, walkthroughs, and migration paths.

| Document                                                  | Description                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------ |
| [Getting Started](guides/getting-started.md)              | First app tutorial, basic input, layout feedback             |
| [State Management](guides/state-management.md)            | Four levels: Component → Shared → Actions → Pure (effects)  |
| [Runtime Layers](guides/runtime-layers.md)                | createApp, createRuntime, createStore, streams, tick sources |
| [Migration from Ink](guides/migration.md)                 | Drop-in migration guide                                      |
| [Migration from legacy inkx](guides/runtime-migration.md) | Migrating to inkx/runtime API                                |

## Reference

API documentation for components, hooks, and subsystems.

| Document                                                    | Description                                                          |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| [Components](reference/components.md)                       | Box, Text, VirtualList, Console, Image, Transform, inputs            |
| [Hooks](reference/hooks.md)                                 | useContentRect, useScreenRect, useInput, useApp, useTerm, animations |
| [Input Features](reference/input-features.md)               | Keyboard (Kitty protocol), mouse (SGR), hotkeys, modifier symbols    |
| [Theming](reference/theming.md)                             | ThemeProvider, semantic `$token` colors, custom themes               |
| [Plugins](reference/plugins.md)                             | withCommands, withKeybindings, withDiagnostics, driver pattern       |
| [Streams](reference/streams.md)                             | AsyncIterable helpers (merge, map, filter, throttle)                 |
| [Scroll Regions](reference/scroll-regions.md)               | DECSTBM-based scroll optimization                                    |
| [Text Cursor](reference/text-cursor.md)                     | Cursor offset to visual position mapping (Layer 0)                   |
| [Terminal Capabilities](reference/terminal-capabilities.md) | Detection, render modes, protocols                                   |
| [Text Sizing (OSC 66)](reference/text-sizing.md)            | PUA character width control for nerdfont/powerline icons             |
| [Terminal Lifecycle](reference/lifecycle.md)                | Suspend/resume (Ctrl+Z), interrupt (Ctrl+C), state save/restore      |
| [Recipes](reference/recipes.md)                             | Common patterns for building inkx apps                               |
| [React DevTools](reference/devtools.md)                     | Connect React DevTools standalone for component tree inspection      |

## Deep Dives

Architecture, internals, and performance analysis.

| Document                                     | Description                                                    |
| -------------------------------------------- | -------------------------------------------------------------- |
| [Architecture](deep-dives/architecture.md)   | Five-phase pipeline, RenderAdapter interface                   |
| [Internals](deep-dives/internals.md)         | Reconciler, dirty tracking, content phase                      |
| [Containment](deep-dives/containment.md)     | Layout feedback loop prevention (useContentRect safe patterns) |
| [Performance](deep-dives/performance.md)     | Optimization techniques, profiling guide                       |
| [Focus Routing](deep-dives/focus-routing.md) | Focus-based input routing, commands, keybindings               |

## Design Documents

Design rationale for implemented or proposed features.

| Document                                                   | Description                                           |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| [Terminal Rendering Design](design/design.md)              | Five-phase pipeline, Unicode, scrolling (implemented) |
| [Mouse Events Design](design/mouse-events-design.md)       | React DOM parity for mouse events (implemented)       |
| [DOM Render API Design](design/dom-api-design.md)          | Unified render API with nested mounting (RFC)         |
| [Virtual Columns Design](design/virtual-columns-design.md) | 2D grid virtualization (RFC)                          |
| [Canvas Playground Design](design/playground-design.md)    | Live-editing playground (RFC)                         |

## Top Level

Cross-cutting docs that don't fit a single category.

| Document                              | Description                                                                |
| ------------------------------------- | -------------------------------------------------------------------------- |
| [Testing](testing.md)                 | Testing strategy, createRenderer, locators, withDiagnostics                |
| [inkx vs Ink](inkx-vs-ink.md)         | Detailed feature/performance comparison with Ink                           |
| [Benchmarks](benchmarks.md)           | Raw benchmark tables and data                                              |
| [Comparison](comparison.md)           | Cross-framework comparison (BubbleTea, Textual, Notcurses, FTXUI, blessed) |
| [Troubleshooting](troubleshooting.md) | Common issues and debugging                                                |
| [Roadmap](roadmap.md)                 | Render targets, multi-platform vision                                      |
| [Blog: Launch Post](blog-launch.md)   | Announcement blog post                                                     |
