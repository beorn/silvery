# inkx Documentation

## Where to Start

- **New to inkx?** Start with [Getting Started](getting-started.md) — build your first app in 5 minutes
- **Migrating from Ink?** Read [Ink Comparison](ink-comparison.md) and [Migration Guide](migration.md)
- **Building an app?** [Components](components.md) + [Hooks](hooks.md) + [Input Features](input-features.md)
- **Testing?** [Testing](testing.md) + [Plugins](plugins.md) (withCommands, withDiagnostics)
- **Understanding internals?** [Architecture](architecture.md) → [Internals](internals.md) → [Performance](performance.md)
- **Something broken?** [Troubleshooting](troubleshooting.md)
- **Contributing?** See [CONTRIBUTING.md](../CONTRIBUTING.md)

## Learning Path

### Getting Started

- [Getting Started](getting-started.md) — Runtime layers, first app tutorial
- [Migration from Ink](migration.md) — Drop-in migration guide
- [Migration from legacy inkx](runtime-migration.md) — Migrating to inkx/runtime API

### Core Concepts

- [Architecture](architecture.md) — Five-phase pipeline, RenderAdapter
- [Components](components.md) — Box, Text, VirtualList, Console, inputs
- [Hooks](hooks.md) — useContentRect, useScreenRect, useInput, useApp, useTerm
- [Streams](streams.md) — AsyncIterable helpers (merge, map, filter, throttle)

### Building Apps

- [Input Features](input-features.md) — Keyboard (Kitty protocol), mouse (SGR), hotkeys, modifier symbols (⌘⌥⌃⇧✦)
- [Focus Routing](focus-routing.md) — Input routing, commands, keybindings
- [Plugins](plugins.md) — withCommands, withKeybindings, withDiagnostics, driver pattern
- [Testing](testing.md) — createRenderer, locators, withDiagnostics
- [Terminal Capabilities](terminal-capabilities.md) — Detection, render modes, protocols
- [Troubleshooting](troubleshooting.md) — Common issues and debugging

### Text Editing

- [Text Cursor](text-cursor.md) — Cursor offset ↔ visual position mapping (Layer 0)

### Debugging

- [React DevTools](devtools.md) — Connect React DevTools standalone for component tree inspection

### Deep Dives

- [Internals](internals.md) — Reconciler, dirty tracking, content phase
- [Containment](containment.md) — Layout feedback loop prevention (useContentRect safe patterns)
- [Performance](performance.md) — Benchmarks, optimization techniques
- [Ink Comparison](ink-comparison.md) — Detailed feature/performance comparison, real-world impact
- [Roadmap](roadmap.md) — Render targets, multi-platform vision

### Design Documents

These documents describe the design rationale for implemented or proposed features.

- [Terminal Rendering Design](design.md) — Five-phase pipeline, Unicode, scrolling (implemented)
- [Mouse Events Design](mouse-events-design.md) — React DOM parity for mouse events (implemented)
- [DOM Render API Design](dom-api-design.md) — Unified render API with nested mounting (RFC)
- [Virtual Columns Design](virtual-columns-design.md) — 2D grid virtualization (RFC)
- [Canvas Playground Design](playground-design.md) — Live-editing playground (RFC)
