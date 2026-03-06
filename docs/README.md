# hightea Documentation

> Start simple, sip some TEA (The Elm Architecture), or go full TEA.

hightea is a React-based TUI framework with a graduated architecture. Your first app is five lines. When you need shared state, undo, testable I/O, or composable plugins — each level builds on the last. You never rewrite; you grow. The unifying idea: every level turns something invisible into data — state transitions, side effects, event processing — making it loggable, testable, replayable, and portable.

```tsx
import { run, useInput } from "@hightea/term/runtime"
import { Text } from "@hightea/term"

function Counter() {
  const [count, setCount] = useState(0)
  useInput((input) => {
    if (input === "j") setCount((c) => c + 1)
    if (input === "k") setCount((c) => c - 1)
    if (input === "q") return "exit"
  })
  return <Text>Count: {count} (j/k to change, q to quit)</Text>
}

await run(<Counter />)
```

## Where to Start

- **New to hightea?** Start with [Getting Started](guides/getting-started.md) -- build your first app in 5 minutes
- **Migrating from Ink?** Read [hightea vs Ink](hightea-vs-ink.md) and [Migration Guide](guides/migration.md)
- **Building an app?** [Components](reference/components.md) + [Hooks](reference/hooks.md) + [Input Features](reference/input-features.md)
- **Testing?** [Testing](testing.md) + [Plugins](reference/plugins.md) (withCommands, withDiagnostics)
- **Understanding internals?** [Architecture](deep-dives/architecture.md) → [Internals](deep-dives/internals.md) → [Performance](deep-dives/performance.md)
- **Something broken?** [Troubleshooting](troubleshooting.md)
- **Contributing?** See [CONTRIBUTING.md](../CONTRIBUTING.md)

## Suggested Reading Order

1. [Getting Started](guides/getting-started.md) -- first app, input handling, layout feedback
2. [Building an App](guides/building-an-app.md) -- from Counter to full TEA: state + events evolve together, one level at a time
3. [Components](reference/components.md) -- Box, Text, VirtualList, Console, inputs
4. [Hooks](reference/hooks.md) -- useContentRect, useInput, useApp, animations
5. [State Management](guides/state-management.md) / [Event Handling](guides/event-handling.md) -- API references for createApp, createSlice, withCommands, plugins
6. [Architecture](deep-dives/architecture.md) -- five-phase pipeline, RenderAdapter

## Guides

Tutorials, walkthroughs, and migration paths.

| Document                                                     | Description                                                                 |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| [Getting Started](guides/getting-started.md)                 | First app tutorial, basic input, layout feedback                            |
| [Building an App](guides/building-an-app.md)                 | Unified progression: Counter → Todo → Board, state + events evolve together |
| [State Management](guides/state-management.md)               | API reference: createApp, createSlice, tea() middleware, createStore        |
| [Event Handling](guides/event-handling.md)                   | API reference: withDomEvents, withCommands, plugins, event sources          |
| [Runtime Layers](guides/runtime-layers.md)                   | createApp, createRuntime, createStore, streams, tick sources                |
| [Migration from Ink](guides/migration.md)                    | Drop-in migration guide                                                     |
| [Migration from legacy hightea](guides/runtime-migration.md) | Migrating to hightea/runtime API                                            |

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
| [Signals](reference/signals.md)                             | Fine-grained reactivity with @preact/signals-core                    |
| [Robust Ops](reference/robust-ops.md)                       | Identity-based, idempotent ops for collaboration and sync            |
| [Recipes](reference/recipes.md)                             | Common patterns for building hightea apps                            |
| [React DevTools](reference/devtools.md)                     | Connect React DevTools standalone for component tree inspection      |

## Deep Dives

Architecture, internals, and performance analysis.

| Document                                                   | Description                                                    |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| [Architecture](deep-dives/architecture.md)                 | Five-phase pipeline, RenderAdapter interface                   |
| [Internals](deep-dives/internals.md)                       | Reconciler, dirty tracking, content phase                      |
| [Containment](deep-dives/containment.md)                   | Layout feedback loop prevention (useContentRect safe patterns) |
| [Performance](deep-dives/performance.md)                   | Optimization techniques, profiling guide                       |
| [Focus Routing](deep-dives/focus-routing.md)               | Focus-based input routing, commands, keybindings               |
| [Architecture Enables](deep-dives/architecture-enables.md) | Effect combinators, structured logging, undo, time-travel      |

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
| [hightea vs Ink](hightea-vs-ink.md)   | Detailed feature/performance comparison with Ink                           |
| [Benchmarks](benchmarks.md)           | Raw benchmark tables and data                                              |
| [Comparison](comparison.md)           | Cross-framework comparison (BubbleTea, Textual, Notcurses, FTXUI, blessed) |
| [Troubleshooting](troubleshooting.md) | Common issues and debugging                                                |
| [Roadmap](roadmap.md)                 | Render targets, multi-platform vision                                      |
| [Blog: Launch Post](blog-launch.md)   | Announcement blog post                                                     |
