# inkx Documentation

## Learning Path

### Getting Started

- [Getting Started](getting-started.md) — Runtime layers, first app tutorial
- [Migration](migration.md) — Migrating from Ink to inkx

### Core Concepts

- [Architecture](architecture.md) — Five-phase pipeline, RenderAdapter
- [Components](components.md) — Box, Text, VirtualList, Console, inputs
- [Hooks](hooks.md) — useContentRect, useScreenRect, useInput, useApp, useTerm
- [Streams](streams.md) — AsyncIterable helpers (merge, map, filter, throttle)

### Building Apps

- [Focus Routing](focus-routing.md) — Input routing, commands, keybindings
- [Testing](testing.md) — createRenderer, locators, withDiagnostics
- [Terminal Capabilities](terminal-capabilities.md) — Detection, render modes, adaptive output

### Deep Dives

- [Internals](internals.md) — Reconciler, dirty tracking, content phase
- [Containment](containment.md) — Layout feedback loop prevention (useContentRect safe patterns)
- [Performance](performance.md) — Benchmarks, optimization techniques
- [Ink Comparison](ink-comparison.md) — Why inkx exists, detailed differences
- [Roadmap](roadmap.md) — Render targets, multi-platform vision

### Migration

- [Ink → inkx](migration.md) — Drop-in migration guide
- [Legacy inkx → runtime](runtime-migration.md) — Migrating to inkx/runtime API
