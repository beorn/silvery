---
title: "Why Claude Code Flickers (And What It Would Take to Fix It)"
description: "Claude Code's 700+ upvote flickering bug, their NO_FLICKER rewrite, and why the new fullscreen mode still shows blank areas. A technical deep dive into why this class of terminal rendering bug is so persistent — and the pipeline architecture that prevents it."
date: 2026-04-04
---

<script setup>
import buffersDiagram from '../public/blog/diagrams/01-buffers.html?raw'
import clearRedrawDiagram from '../public/blog/diagrams/06-clear-reprint.html?raw'
import pipelineDiagram from '../public/blog/diagrams/02-pipelines-compared.html?raw'
import dirtyTrackingDiagram from '../public/blog/diagrams/07-dirty-tracking.html?raw'
import termlessDiagram from '../public/blog/diagrams/05-termless.html?raw'
import zonesDiagram from '../public/blog/diagrams/04-zones.html?raw'
</script>

# Why Claude Code Flickers (And What It Would Take to Fix It)

Claude Code has spent months rewriting its renderer. They've [shipped a NO_FLICKER mode](https://x.com/bcherny/status/2039421575422980329), moved to the alternate screen buffer, built a [differential renderer with TypedArray double-buffering](https://news.ycombinator.com/item?id=46701013) — and users are still reporting blank areas and visual glitches across [12+ open GitHub issues](https://github.com/anthropics/claude-code/issues/42670). That tells you this isn't just a diffing bug. It's a deeper architectural constraint.

I don't have Claude Code's internal code — the discussion below is based on public comments, GitHub issues, and observed behavior. The team is clearly talented, and they're solving this under production constraints across xterm.js, VS Code, tmux, SSH, Windows, and native terminals. But the underlying problem isn't unique to them. Any terminal app that wants rich interactivity, native scrollback, and stable streaming updates runs into some version of the same constraint.

This post explains why the problem is so persistent, and what rendering architecture actually prevents it.

## The terminal UI dilemma

Every terminal app that streams output faces a forced choice. Most xterm-style terminals expose two screen buffers:

<HtmlDiagram :html="buffersDiagram" />

**Main buffer** is what you normally see — output accumulates as scrollback, Cmd+F works, text selection works across history, content persists after the app exits. **[Alternate buffer](https://terminfo.dev/feature/screen.alternate-screen)** is a separate canvas the app takes over, like vim or htop — full cell-level control, but no scrollback. When the app exits, the alternate buffer is discarded.

Most TUI apps pick one. The problem starts when you need both: native scrollback _and_ stable, mutable UI. That's what every AI agent, streaming test runner, and deployment dashboard needs.

## Why inline mode flickers

Choose the main buffer and you get scrollback. But the moment your streaming content grows taller than the terminal — which happens within the first long AI response — part of it scrolls into the scrollback region above the viewport.

Now the AI sends the next token. You need to update the live content, but some of it has crossed into terminal-owned history. **Terminals don't give you random-access mutation of scrollback.** They have [scroll regions](https://terminfo.dev/feature/scroll.scroll-region), insert/delete line, and cursor addressing — but none of these let you patch content the terminal has already claimed. Many inline renderers end up clearing and redrawing a large region, sometimes the entire app area, on every single token.

<HtmlDiagram :html="clearRedrawDiagram" />

If your app has 50 completed exchanges above the live one, you're redrawing all of them — not because they changed, but because the clear is all-or-nothing. The more history, the more wasted bytes. Claude Code's inline mode generated [4,000–6,700 scroll events per second](https://news.ycombinator.com/item?id=46699072) in tmux — severe enough to [crash VS Code](https://github.com/anthropics/claude-code/issues/10794).

There's a subtler flicker source too: **layout feedback loops.** When a component renders, then measures its size, discovers it changed, and re-renders — over and over. Ink had this with `measureElement()`, which returns dimensions _after_ render, triggering a state update, triggering another render. Each intermediate layout flashes on screen. The fix is doing layout _before_ render, so components know their available width on the first pass.

## Why fullscreen mode still breaks

Claude Code switched to the alternate buffer. Flicker stopped — but they had to rebuild search (`Ctrl+O` then `/`), text selection, scrolling, clipboard handling (OSC 52 for SSH/tmux), and history review from scratch. That `Ctrl+O` → `[` escape hatch — dumping the conversation back to native scrollback — shows the team knows users want scrollback.

But even with total cell-level control, users still see **garbled output**: blank areas, overlapping text, stale content. It's non-deterministic — sometimes the screen renders correctly, sometimes entire sections are empty.

How? A [community analysis](https://github.com/anthropics/claude-code/issues/42010) identified specific failure modes: the scroll optimization contaminates the previous frame's buffer, the style cache overflows after ~524K unique styles, and there's no recovery mechanism when the terminal's buffer is disturbed by a focus change or multiplexer.

These are implementation bugs, but they point to a deeper pattern: better diffing alone won't fix them.

## The missing invariant

A terminal renderer that actually works needs three things:

1. **Transactional frame generation** — reconcile, layout, render, and output happen as one synchronous pass. No async gaps where state can drift between phases.
2. **Authoritative screen state** — the app maintains a model of what's on screen. The diff is computed against this model, not against what the terminal might have.
3. **Reliable resynchronization** — when anything disrupts the terminal's buffer (resize, tmux detach/attach, focus change), the app detects it and forces a full repaint from its model.

Here's the contrast between a pipeline where phases happen in separate event loop turns, and one where they're fused:

<HtmlDiagram :html="pipelineDiagram" />

**Why the split matters for terminals but not the web:** React can prepare work off-DOM and commit atomically — the browser owns paint timing, so the user never sees a half-updated frame. In a terminal, stdout _is_ the presentation API. If the pipeline computes a frame from inconsistent state — new tree, old layout — the wrong frame is already on screen.

**Why layout-before-render matters:** Frameworks that measure _after_ render create the feedback loop described above. When the layout engine runs first, components know their dimensions before they render. There's no oscillation because there's no feedback.

[Silvery](https://silvery.dev) uses a custom React reconciler that enforces all three invariants. After React produces a new tree, the entire layout → render → output pipeline runs as a single synchronous transaction. The reconciler APIs — Suspense, `useTransition`, `useDeferredValue` — remain available, though concurrent rendering semantics matter less in a renderer that flushes synchronously. The only tradeoff is render interruptibility — but a typical Silvery frame takes 169 microseconds. There's nothing to interrupt.

## The architecture that prevents it

### Dynamic scrollback

Instead of choosing between "flicker with scrollback" or "no flicker without scrollback," Silvery splits the output into three zones:

<HtmlDiagram :html="zonesDiagram" />

1. **Live screen** — React components with incremental updates. Streaming responses and the input prompt live here.
2. **App scrollback** — completed content the app still manages. Pre-rendered strings, cheaply re-emittable on resize.
3. **Terminal scrollback** — content released to the terminal. Cmd+F works. Text selection works. Persists after the app exits.

```tsx
<Static items={completedExchanges}>
  {(exchange) => <ExchangeView key={exchange.id} exchange={exchange} />}
</Static>
<LiveExchange exchange={activeExchange} />
<InputPrompt />
```

When a response finishes, `Static` virtualizes the output to app scrollback and unmounts the React component. From there it graduates to terminal scrollback. The active render tree stays bounded regardless of conversation length. New output only happens at the bottom — graduated scrollback doesn't trigger auto-scroll, so the user can review history while content streams below.

### Incremental rendering

<HtmlDiagram :html="dirtyTrackingDiagram" />

A screen-level diff compares the whole buffer — if the buffer was built from stale state, the diff is wrong. Silvery tracks changes at the source: per-node dirty flags in the render tree. Only dirty nodes re-render. Only changed cells generate output bytes. If a component re-renders but produces identical output, zero bytes go to stdout — no ED3, no redraw, no flicker.

::: details How deep does it go?
The layout engine ([Flexily](https://github.com/beorn/flexily)) caches layout results and skips unchanged subtrees. The text measurement layer caches grapheme widths and line-break results. The render phase writes only changed cells. The output phase diffs the buffer and emits only changed ANSI sequences. End-to-end: 169 microseconds for a typical interactive update.
:::

### Same components, one-line switch

```tsx
render(<App />, term) // fullscreen
render(<App />, term, { mode: "inline" }) // inline with scrollback
```

Same components in both modes. Fullscreen gets transactional rendering with authoritative screen state and desync recovery. Inline gets all of that plus dynamic scrollback.

### How the approaches compare

|                         | Naive inline                  | Fullscreen (alt buffer)    | Silvery fullscreen             | Silvery inline + scrollback           |
| ----------------------- | ----------------------------- | -------------------------- | ------------------------------ | ------------------------------------- |
| **Terminal scrollback** | Yes, but disrupted by redraws | Not while active           | Not while active               | Yes (content graduates out)           |
| **Cmd+F**               | Native (but flickers)         | Reimplemented in-app       | Reimplemented in-app           | Native + in-app                       |
| **Pipeline**            | Split (gap between phases)    | Split (gap between phases) | Single synchronous transaction | Single synchronous transaction        |
| **Desync recovery**     | None                          | None                       | Full repaint from model        | Full repaint from model               |
| **Render tree growth**  | Grows with conversation       | Only visible content       | Only visible content           | Bounded (items graduate out)          |

> Claude Code started in column 1 and moved to column 2. Silvery provides columns 3 and 4.

## Honest caveats

This isn't magic. There are real constraints.

**Silvery can't incrementally update scrollback either.** The difference is _when_ redraws happen — on infrequent structural events (resize, item graduation) instead of every token. In practice users rarely see flickering, but on resize with thousands of graduated items there's a brief pause.

**Graduation requires an immutability boundary.** Once content is released to terminal scrollback, changing it means replaying history. Items that might still change (collapsible output, edited messages) stay in app scrollback.

**Subprocess output can bypass the renderer.** If child processes write directly to the terminal, the cached frame is invalid. The app needs passthrough mode with repaint on return, or it must capture all output through the renderer.

**Emulator variability is real.** xterm.js behaves differently from Ghostty, tmux changes behavior, Windows terminals differ. Some of Claude Code's worst reports may be emulator-specific.

::: details What about synchronized output?
[Synchronized output](https://terminfo.dev/feature/output.synchronized-output) (DEC mode 2026) batches terminal output so partial frames never hit the screen. It helps — Silvery uses it when available. But it doesn't fix state mismatches within the pipeline, doesn't solve scrollback ownership, and doesn't help with desync recovery. It paints the wrong frame atomically instead of painting it torn.
:::

## How you verify a terminal renderer

Rendering bugs like these are invisible to ANSI string snapshots — the escape codes are correct, but the emulator produces garbled output. You need emulator-level assertions. [Termless](https://termless.dev) tests across 11 real terminal emulator engines — xterm.js, Ghostty, Kitty, WezTerm, and more. If your app renders correctly in xterm.js but breaks in Ghostty, the test catches it.

<HtmlDiagram :html="termlessDiagram" />

```tsx
using term = createTermless({ cols: 80, rows: 24 })
const app = await run(<StreamingChat />, term)

await app.dispatch({ type: "token", text: "Hello world" })
expect(term.screen).toContainText("Hello world")

// Resize triggers full repaint — verify recovery
term.resize(80, 24)
expect(term.screen).toContainText("Hello world")
```

`term.screen` is the terminal's actual screen buffer after the emulator processes all escape codes — not the ANSI output. Silvery's own correctness is verified by fuzz tests comparing incremental renders against fresh renders across thousands of random state transitions.

## The real decision

If you're building a terminal app that streams output, you'll hit this dilemma. The question isn't "inline or fullscreen." It's whether your rendering pipeline is built around the right invariant: one authoritative model, one synchronous transaction from reconciliation to output, and a recovery path when the terminal diverges.

This is the architecture I built into [Silvery](https://silvery.dev). The [scrollback example](https://silvery.dev/examples/scrollback) and [AI agent example](https://silvery.dev/examples/ai-chat) show it in practice.

---

_Silvery is an open-source React framework for terminal UIs. [GitHub](https://github.com/beorn/silvery) / [Docs](https://silvery.dev) / [Discord](https://discord.gg/silvery)_
