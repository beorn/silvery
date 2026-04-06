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

Claude Code has spent months rewriting its renderer. They've [shipped a NO_FLICKER mode](https://x.com/bcherny/status/2039421575422980329), moved to the [alternate screen](https://terminfo.dev/feature/screen.alternate-screen) buffer, built a [differential renderer with TypedArray double-buffering](https://news.ycombinator.com/item?id=46701013) — and users are still reporting blank areas and visual glitches across [12+ open GitHub issues](https://github.com/anthropics/claude-code/issues/42670). That strongly suggests the problem isn't only a bad diff. At least part of it is architectural.

I don't have Claude Code's internal code — the discussion below is based on public comments, GitHub issues, and observed behavior. The team is clearly talented, and they're solving this under production constraints across xterm.js, VS Code, tmux, SSH, Windows, and native terminals. Anthropic may well fix today's fullscreen glitches with targeted patches. My claim is narrower: the recurring tradeoff between stable streaming updates, native scrollback, and robust recovery is architectural.

This post explains why this class of bug is so persistent, and what rendering architecture actually prevents it.

## The terminal UI dilemma

Terminal apps with rich, mutable streaming output usually face a forced choice. Most xterm-style terminals expose two screen buffers:

<HtmlDiagram :html="buffersDiagram" />

**Main buffer** (also called the primary screen or normal buffer) is what your shell runs in — it's where `echo`, `git log`, and every line-oriented CLI writes output. Content accumulates as scrollback, Cmd+F works, text selection works across history, and everything persists after the app exits. This is what TUI frameworks call "inline mode."

**[Alternate buffer](https://terminfo.dev/feature/screen.alternate-screen)** (also called altscreen or fullscreen mode) is what vim, htop, and other fullscreen apps use — a separate canvas with full cell-level control, but no scrollback. When the app exits, the alternate buffer is discarded and the original main buffer is restored, as if the app was never there.

Append-only logs don't have this problem — output scrolls up and stays. The hard case is output that keeps changing after earlier lines have already scrolled away. That's what every AI agent, streaming test runner, and deployment dashboard needs — and it doesn't fit neatly into either buffer. From here, the failure modes split cleanly: in the main buffer, flicker comes from redrawing content you no longer own; in fullscreen, it comes from emitting frames you can't generate and recover authoritatively.

## Flicker reason 1: Inline redraws

Choose the main buffer and you get scrollback. But the moment your streaming content grows taller than the terminal — which happens within the first long AI response — part of it scrolls into the scrollback region above the viewport.

Now the AI sends the next token. You need to update the live content, but some of it has crossed into terminal-owned history. **Terminals don't give you random-access mutation of scrollback.** They have [scroll regions](https://terminfo.dev/feature/scroll.scroll-region) (`DECSTBM`), [insert](https://terminfo.dev/feature/edit.insert-line)/[delete line](https://terminfo.dev/feature/edit.delete-line), and [cursor positioning](https://terminfo.dev/feature/cursor.cursor-position) (`CUP`) — but none of these can reach content above the visible screen. A common fallback is to erase the screen ([ED](https://terminfo.dev/feature/edit.erase-display) — Erase in Display) and redraw everything — sometimes the entire app area — on every token.

<HtmlDiagram :html="clearRedrawDiagram" />

If your app has 50 completed exchanges above the live one, you're redrawing all of them — not because they changed, but because the clear is all-or-nothing. The more history, the more wasted bytes. In one public tmux report, Claude Code's inline mode produced [4,000–6,700 scroll events per second](https://news.ycombinator.com/item?id=46699072), which users correlated with severe [VS Code instability and crashes](https://github.com/anthropics/claude-code/issues/10794).

## Flicker reason 2: Non-authoritative frame renders

There's a deeper source of visual instability that follows you to fullscreen mode. It happens when the rendering pipeline isn't fused — when reconciliation, layout, rendering, and output happen in separate event loop turns with gaps between them.

Two forms of this:

**The async gap.** A new message arrives, React adds it to the tree, but layout hasn't recalculated yet. The renderer draws the new message using the old layout dimensions. Result: overlapping text or blank gaps. On the web, the browser holds the old frame until layout completes. In a terminal, stdout _is_ the presentation API — the wrong frame is already on screen.

**Layout feedback loops.** A component renders, then measures its size, discovers it changed, and re-renders. Text wraps to 3 lines, container adjusts, text reflows to 2 lines, container adjusts, text wraps to 3 lines — visible oscillation between two states. Ink has hit this class of problem with `measureElement()`, which returns dimensions _after_ render, triggering a state update, triggering another render. Each intermediate pass flashes on screen.

Claude Code's move to the [alternate screen](https://terminfo.dev/feature/screen.alternate-screen) appears to have reduced the worst scrollback-driven flicker (reason 1). But they had to rebuild everything the main buffer gives you for free: search (`Ctrl+O` then `/` instead of Cmd+F), text selection (custom click-and-drag handler), scrolling (PgUp/PgDn/mouse wheel capture), clipboard ([OSC 52](https://terminfo.dev/feature/osc.clipboard) for SSH/tmux), and history review. That `Ctrl+O` → `[` escape hatch — dumping the conversation back to native scrollback — shows the team knows users want scrollback.

But even with total cell-level control, users still see **garbled output**: blank areas, overlapping text, stale content. It's non-deterministic — sometimes the screen renders correctly, sometimes entire sections are empty.

In one [public reverse-engineering thread](https://github.com/anthropics/claude-code/issues/42010), contributors proposed several plausible failure modes: previous-frame corruption during [DECSTBM](https://terminfo.dev/feature/scroll.scroll-region) scroll optimization, a style-cache edge case, and missing full-repaint recovery after terminal state disturbances (focus change, multiplexer reattach). The exact bugs may differ, but the failure shape is the same: the renderer emits a frame based on an incorrect belief about what the screen currently shows, and then lacks a reliable way to recover.

If the failure includes state incoherence or desync, better diffing alone won't fix it.

## The missing invariants

These are actually two different ownership problems. In inline mode, the terminal owns anything that has scrolled into history — the app can't patch it. In fullscreen mode, the app owns the visible cells — but only if it also owns a coherent model of them and can repaint when reality diverges.

For this class of app, a reliable renderer needs three invariants:

1. **Coherent frame generation** — every emitted frame is derived from one consistent snapshot of app state, layout, and styling. No async gaps where state can drift between phases.
2. **Authoritative screen state** — the app maintains a model of what's on screen. The diff is computed against this model, not against what the terminal might have.
3. **Reliable resynchronization** — when anything disrupts the terminal's buffer (resize, tmux detach/attach, focus change), the app detects it and forces a full repaint from its model.

Here's the contrast between a pipeline where phases happen in separate event loop turns, and one where they're fused:

<HtmlDiagram :html="pipelineDiagram" />

**Why the split matters for terminals but not the web:** React can prepare work off-DOM and commit atomically — the browser owns paint timing, so the user never sees a half-updated frame. In a terminal, [ANSI escape sequences](https://terminfo.dev/feature) written to stdout are processed immediately — there's no compositor holding back a partial frame. If the pipeline computes a frame from inconsistent state, that's what the user sees.

**Why layout-before-render prevents feedback loops:** Frameworks that measure _after_ render create the oscillation described above. When the layout engine runs first — computing positions and sizes before any rendering — components know their dimensions on the first pass. There's no feedback loop because there's no feedback.

[Silvery](https://silvery.dev) uses a custom React reconciler that enforces all three invariants. After React produces a new tree, the entire layout → render → output pipeline runs as a single synchronous transaction. The reconciler APIs — Suspense, `useTransition`, `useDeferredValue` — remain available, though concurrent rendering semantics matter less in a renderer that flushes synchronously. The tradeoff is reduced interruptibility — but in the workloads I've measured, a typical Silvery frame is about [169 microseconds](https://silvery.dev/guide/silvery-vs-ink#performance). The practical cost has been small.

## An architecture built to avoid it

Silvery is one implementation of this pattern; the broader point is the invariants, not any specific library.

### App-managed scrollback

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

When a response finishes, `Static` virtualizes the output to app scrollback and unmounts the React component. From there it graduates to terminal scrollback. The active render tree can stay bounded as completed items graduate out. New output only happens at the bottom — graduated scrollback doesn't trigger auto-scroll, so the user can review history while content streams below.

### Incremental rendering

<HtmlDiagram :html="dirtyTrackingDiagram" />

Silvery tracks changes at the source: per-node dirty flags in the render tree. Only dirty nodes re-render. Only changed cells generate output bytes. If a component re-renders but produces identical output, zero bytes go to stdout — no [ED3](https://terminfo.dev/feature/edit.erase-display) (erase scrollback), no screen clear, no flicker. This is a performance optimization layered on top of the invariants above, not a substitute for them.

::: details How deep does it go?
The layout engine ([Flexily](https://github.com/beorn/flexily)) caches layout results and skips unchanged subtrees. The text measurement layer caches grapheme widths and line-break results. The render phase writes only changed cells. The output phase diffs the buffer and emits only changed ANSI sequences. End-to-end: ~169 microseconds for a typical interactive update (cursor move in a 1000-node tree, Apple M1 Max, 80×24, warm cache).
:::

### Same components, one-line switch

```tsx
render(<App />, term) // fullscreen
render(<App />, term, { mode: "inline" }) // inline with scrollback
```

Same components in both modes. Fullscreen gets transactional rendering with authoritative screen state and desync recovery. Inline gets all of that plus app-managed scrollback.

### How the approaches compare

| | Inline redraw | Alt-screen diff renderer | Model-based fullscreen | Model-based inline + scrollback |
| ----------------------- | ----------------------------- | -------------------------- | ------------------------------ | ------------------------------------- |
| **Terminal scrollback** | Yes, but disrupted by redraws | Not while active | Not while active | Yes (content graduates out) |
| **Cmd+F** | Native (but flickers) | Reimplemented in-app | Reimplemented in-app | Native for graduated content + in-app |
| **Frame coherence** | Split (gap between phases) | Split (gap between phases) | Single synchronous transaction | Single synchronous transaction |
| **Desync recovery** | None typical | None typical | Full repaint from model | Full repaint from model |
| **Render tree growth** | Grows with conversation | Only visible content | Only visible content | Bounded (items graduate out) |

> These columns are architectural archetypes, not exact descriptions of every app. Viewed through this lens, Claude Code's public evolution looks more like a move from the first architecture toward the second. Silvery provides the third and fourth.

## Honest caveats

This isn't magic. There are real constraints.

**Silvery can't incrementally update scrollback either.** The difference is _when_ redraws happen — on infrequent structural events (resize, item graduation) instead of every token. In my testing, flicker is uncommon, but on resize with thousands of graduated items there's a brief pause.

**Graduation requires an immutability boundary.** Once content is released to terminal scrollback, changing it means replaying history. Items that might still change (collapsible output, edited messages) stay in app scrollback.

**Subprocess output can bypass the renderer.** If child processes write directly to the terminal, the cached frame is invalid. The app needs passthrough mode with repaint on return, or it must capture all output through the renderer.

**Emulator variability is real.** xterm.js behaves differently from Ghostty, tmux changes behavior, Windows terminals differ. Some of Claude Code's worst reports may be emulator-specific, not purely app-architecture-specific. This is why multi-backend testing matters.

::: details What about synchronized output?
[Synchronized output](https://terminfo.dev/feature/output.synchronized-output) ([DECSYNC](https://terminfo.dev/feature/output.synchronized-output), mode 2026) batches terminal output between `\e[?2026h` and `\e[?2026l` so partial frames never hit the screen. It helps — Silvery uses it when available. But it doesn't fix state mismatches within the pipeline, doesn't solve scrollback ownership, and doesn't help with desync recovery. It paints the wrong frame atomically instead of painting it torn.
:::

## How you verify a terminal renderer

Many rendering bugs like these are invisible to ANSI string snapshots — the escape codes are correct, but the emulator produces garbled output. You need emulator-level assertions. [Termless](https://termless.dev) tests across 11 real terminal emulator engines — xterm.js, Ghostty, Kitty, WezTerm, and more. If your app renders correctly in xterm.js but breaks in Ghostty, the test catches it.

<HtmlDiagram :html="termlessDiagram" />

```tsx
using term = createTermless({ cols: 80, rows: 24 })
const app = await run(<StreamingChat />, term)

await app.dispatch({ type: "token", text: "Hello world" })
expect(term.screen).toContainText("Hello world")

// Resize triggers full repaint — verify recovery
term.resize(100, 30)
expect(term.screen).toContainText("Hello world")
```

`term.screen` is the terminal's actual screen buffer after the emulator processes all escape codes — not the ANSI output. Silvery's own correctness is verified by fuzz tests comparing incremental renders against fresh renders across thousands of random state transitions.

## The real decision

If you're building a terminal app that streams output, you'll hit this dilemma. The question isn't "inline or fullscreen." It's whether your rendering pipeline is built around the right invariants: coherent frames from consistent state, an authoritative screen model, and a recovery path when the terminal diverges.

The broader point is that this tradeoff keeps reappearing unless the renderer owns both the frame model and the scrollback boundary.

This is the architecture I built into [Silvery](https://silvery.dev). The [scrollback example](https://silvery.dev/examples/scrollback) and [AI agent example](https://silvery.dev/examples/ai-chat) show it in practice.

---

_Silvery is an open-source React framework for terminal UIs. [GitHub](https://github.com/beorn/silvery) / [Docs](https://silvery.dev) / [Discord](https://discord.gg/silvery)_
