---
title: About Silvery
---

# About Silvery

## What

Silvery is a React-based TUI (Terminal User Interface) framework for building polished terminal applications. It provides 30+ components, incremental rendering with per-node dirty tracking, and full support for modern terminal capabilities.

## Why

Ink pioneered React in the terminal, but its full-screen redraw model hits a wall at scale — every keystroke re-renders the entire tree. It also lacks components for common needs (virtual lists, tables, command palettes) and doesn't support modern terminal protocols like Kitty keyboard or synchronized output. Silvery was built to close these gaps. See [The Silvery Way](/guide/the-silvery-way) for the design philosophy.

## How It's Different

- **100x faster updates** — incremental rendering, not full redraws. [Benchmarks](/guide/silvery-vs-ink)
- **30+ components** — TextInput, SelectList, VirtualList, Table, ProgressBar, and more. [Components](/guides/components)
- **Modern terminal support** — Kitty keyboard, truecolor, mouse SGR, synchronized output. [Compatibility at terminfo.dev](https://terminfo.dev)
- **The Silvery Way** — 10 design principles for building great TUIs. [Read the guide](/guide/the-silvery-way)

## Ecosystem

Silvery is part of a suite of terminal development tools:

- **[Flexily](https://beorn.codes/flexily)** — the layout engine (Yoga-compatible, pure JS)
- **[Termless](https://termless.dev)** — headless terminal testing ("Playwright for terminals")
- **[terminfo.dev](https://terminfo.dev)** — terminal feature compatibility database
- **[Loggily](https://beorn.codes/loggily)** — structured logging used internally

## Built By

Created by [Bjorn Stabell](https://beorn.codes), serial entrepreneur and open-source developer. Silvery grew out of building [km](https://github.com/beorn/km), a workspace for agentic knowledge workers.
