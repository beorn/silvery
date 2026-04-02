---
title: About Silvery
description: "About Silvery — a React TUI framework for modern terminal applications. Built by Bjorn Stabell, author of Flexily, Termless, and terminfo.dev."
---

# About Silvery

## What

Silvery is a React-based TUI (Terminal User Interface) framework for building polished terminal applications. It provides 45+ components, incremental rendering with per-node dirty tracking, and full support for modern terminal capabilities like Kitty keyboard protocol, truecolor, SGR mouse reporting, synchronized output, and Sixel/Kitty graphics.

Silvery works with Bun, Node.js (23.6+), and Deno. It uses pure TypeScript with no native dependencies or WASM -- just JavaScript all the way down.

## Origin Story

Silvery grew out of building [km](https://github.com/beorn/km) (Knowledge Machine), an agentic workspace for knowledge workers that unifies notes, tasks, and calendar in a terminal UI. The project started with Ink, which pioneered React in the terminal and remains a solid choice for simpler CLIs.

But km hit architectural limits that couldn't be worked around. The core problem: in Ink, React renders components first, then Yoga calculates layout. By the time layout runs, rendering is already done. Components that need to adapt to their available space -- truncating text, choosing between compact and full layouts, fitting content into responsive columns -- have to use post-render effects or prop drilling. This has been a [known limitation](https://github.com/vadimdemedes/ink/issues/5) since 2016.

km needed layout-first rendering for responsive column layouts (a kanban board where columns adapt to terminal width) and per-node dirty tracking for sub-millisecond interactive updates in large trees (thousands of notes and tasks). Rather than work around these limits with increasingly complex hacks, a new renderer was built from scratch -- one where layout runs before rendering, and only changed nodes are updated.

That renderer became Silvery.

## Technical Philosophy

Silvery is built on a few core principles:

**Layout-first architecture.** Silvery inverts the standard React terminal pipeline: layout runs first, then components render with actual dimensions available via `useContentRect()`. This means components can adapt to their container's size without prop drilling, post-render measurement, or `width: 0` on first paint. It also enables native scrollable containers with `overflow="scroll"` and automatic text truncation.

**Incremental rendering.** Every node in the render tree has 7 independent dirty flags. When a user presses a key, only the nodes that actually changed are re-rendered. A typical interactive update (cursor move in a 1000-node tree) takes 169 microseconds -- compared to 20.7 milliseconds in Ink, which re-renders the full React tree and runs full Yoga layout on every state change. See the [benchmark comparison](/guide/silvery-vs-ink#performance) for detailed numbers.

**Pure TypeScript, no WASM.** The entire framework -- including the Flexily layout engine -- is written in TypeScript with no native dependencies. No WASM heap management, no C++ compilation, no platform-specific binaries. This makes installation fast, debugging straightforward, and deployment predictable across Bun, Node.js, and Deno.

**The Silvery Way.** Ten design principles that guide how Silvery apps should be built. Use canonical high-level components (SelectList, TextInput, VirtualList) instead of manual low-level equivalents. Use semantic theme tokens instead of hardcoded ANSI codes. Use focus scopes instead of manual focus management. The framework should handle the common cases so application code stays focused on business logic. Read [The Silvery Way](/guide/the-silvery-way) for the full manifesto.

## Ecosystem

Silvery is part of a suite of open-source terminal development tools, all MIT licensed:

- **[Flexily](https://beorn.codes/flexily)** -- Yoga-compatible flexbox layout engine, pure TypeScript. Silvery's layout layer. Flexily runs layout without WASM or native dependencies while maintaining API compatibility with Yoga. It's roughly 1.5x faster than Yoga WASM for typical terminal layouts.

- **[Termless](https://termless.dev)** -- Headless terminal testing framework ("Playwright for terminals"). Runs a full xterm.js terminal emulator in-process, so tests can verify actual ANSI output, box drawing, colors, scrollback, and cursor positioning -- not just stripped text.

- **[terminfo.dev](https://terminfo.dev)** -- Terminal feature compatibility database. A "caniuse.com for terminals" that tracks which terminal emulators support which escape sequences, keyboard protocols, and graphics capabilities. Used by Silvery for capability detection research.

- **[Loggily](https://beorn.codes/loggily)** -- Structured debug logging with namespace filtering. Used internally by Silvery for pipeline debugging (`silvery:render`, `silvery:mouse`, `flexily:layout`).

## By the Numbers

- **45+ components** -- from basics (Box, Text) to advanced (VirtualList, CommandPalette, TreeView, SplitView, Table, Form)
- **23 color palettes** -- with semantic tokens, auto-detection of terminal background color, and WCAG-aware contrast
- **98.9% Ink test compatibility** -- existing Ink code works with minimal changes via the compatibility layer
- **Works everywhere** -- Bun, Node.js (23.6+), and Deno, with no native dependencies

## Built By

Created by [Bjorn Stabell](https://beorn.codes), a serial entrepreneur and open-source developer based in Oslo. Bjorn has been building developer tools and infrastructure for over two decades, from distributed computing frameworks to AI-powered productivity tools.

Silvery grew from the conviction that terminal UIs deserve the same quality of tooling that web UIs enjoy -- responsive layouts, incremental rendering, rich component libraries, and modern protocol support. The terminal is not a legacy interface; it is a fast, focused, keyboard-driven environment that rewards good design.

Bjorn is also the author of [Flexily](https://beorn.codes/flexily), [Termless](https://termless.dev), and [terminfo.dev](https://terminfo.dev), and maintains several other open-source packages in the terminal ecosystem.
