---
title: About Silvery
description: "About Silvery — a React TUI framework for modern terminal applications. Origin story, technical approach, and ecosystem."
---

# About Silvery

Silvery is a React framework for building terminal UIs. 45+ components, incremental rendering, full modern terminal protocol support. Pure TypeScript, no WASM. Works with Bun, Node.js (23.6+), and Deno.

## How It Started

I was building a terminal application — a multi-pane workspace with a kanban-style board, thousands of nodes, and keyboard-driven navigation. I started with [Ink](https://github.com/vadimdemedes/ink), which is a great project and the right choice for most terminal apps.

I ran into two problems I couldn't work around:

**Components can't know their size during render.** In Ink, React renders first, then Yoga calculates layout. So when your component runs, it doesn't know how wide its container is. If you need to truncate text to fit, choose between a compact and full layout, or adapt columns to the terminal width — you're stuck with post-render effects and prop drilling. This is [Ink issue #5](https://github.com/vadimdemedes/ink/issues/5), open since 2016.

**Every keystroke re-renders everything.** When a user moves a cursor in a 1000-node tree, Ink re-runs React reconciliation and Yoga layout for the entire tree. For my application, that took about 20 milliseconds per keypress — noticeable at 60fps.

I needed layout to run *before* rendering (so components could access their dimensions), and per-node dirty tracking (so only changed nodes would re-render). That required a different rendering pipeline, which meant building a new renderer.

## How It Works

**Layout first, then render.** Silvery inverts the pipeline: [Flexily](https://beorn.codes/flexily) (a Yoga-compatible layout engine) calculates positions and sizes, then React renders components with actual dimensions available via `useContentRect()`. No prop drilling, no `width: 0` on first paint. This also makes `overflow="scroll"` and automatic text truncation possible — both depend on knowing "how much space do I have?"

**Incremental rendering.** Each node tracks 7 independent dirty flags. A typical interactive update — cursor move in a 1000-node tree — takes 169 microseconds. The [benchmark comparison](/guide/silvery-vs-ink#performance) has the full numbers and methodology.

**Pure TypeScript.** The entire stack, including the layout engine, is TypeScript with no native dependencies. No WASM heap to manage, no platform-specific binaries, no C++ build step.

**[The Silvery Way](/guide/the-silvery-way).** Ten design principles for building terminal apps with Silvery. The short version: use the high-level components (SelectList, TextInput, VirtualList), use semantic theme tokens (`$primary`, `$muted`), and let the framework handle focus management, key bindings, and scrolling.

## Ecosystem

These are all MIT-licensed and part of the same development effort:

- **[Flexily](https://beorn.codes/flexily)** — Yoga-compatible flexbox layout engine in pure TypeScript. Silvery's layout layer.
- **[Termless](https://termless.dev)** — Headless terminal testing framework. Runs a real xterm.js emulator in-process for testing ANSI output, colors, scrollback, and cursor positioning.
- **[terminfo.dev](https://terminfo.dev)** — Terminal feature database. Tracks which terminals support which escape sequences, protocols, and capabilities.
- **[Loggily](https://beorn.codes/loggily)** — Debug logging with namespace filtering (`silvery:render`, `flexily:layout`).

## Numbers

- 45+ components — Box, Text, SelectList, VirtualList, CommandPalette, TreeView, Table, Form, and more
- 23 color palettes with semantic tokens and WCAG-aware contrast
- 98.9% of Ink's test suite passes via the compatibility layer
- Runs on Bun, Node.js 23.6+, and Deno

## Author

I'm [Bjørn Stabell](https://beorn.codes), based in Oslo. I've been building developer tools for about twenty years — distributed systems, infrastructure, and more recently terminal and AI tooling. Silvery started because I needed it for my own work and couldn't find anything that did what I needed. The ecosystem around it ([Flexily](https://beorn.codes/flexily), [Termless](https://termless.dev), [terminfo.dev](https://terminfo.dev)) grew out of the same need.
