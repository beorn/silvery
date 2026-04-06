---
title: "Why Claude Code Flickers"
subtitle: "And What It Would Take to Fix It"
description: "I use Claude Code every day. I also build terminal apps. When their flickering bug hit ~700 upvotes, I recognized every symptom — because I'd spent months debugging the same class of bugs in my own app. Here's what I learned from both sides."
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

# Why Claude Code Flickers

<p style="font-size: 1.2em; color: var(--vp-c-text-2); margin-top: -8px; font-weight: 400">And What It Would Take to Fix It</p>

I've used Claude Code since it came out, and I've been building some bigger terminal apps — a task board with React components, streaming AI responses, and keyboard-driven navigation. So I've experienced terminal rendering problems from both sides: as a user hitting [~700-upvote flickering bugs](https://github.com/anthropics/claude-code/issues/3648), and as a developer debugging the same class of bugs in my own code.

Anthropic has thrown serious engineering at this. They [rewrote their renderer](https://news.ycombinator.com/item?id=46701013) with TypedArray double-buffering, [shipped NO_FLICKER mode](https://x.com/bcherny/status/2039421575422980329), moved to the alternate screen buffer. And users still report [blank regions, stale rows, and scrollback breakage](https://github.com/anthropics/claude-code/issues/42670) across dozens of GitHub issues. I recognized every symptom — the full-screen redraws, the blank areas after switching windows, the layout jumping between two states — because I'd been debugging the same things.

I don't have their internal code — everything below is based on public comments, GitHub issues, and observed behavior. Anthropic may well fix today's glitches with targeted patches. But from having lived through the same problems, I think the recurring tradeoff — stable streaming updates vs. native scrollback vs. robust recovery — is architectural.

## The terminal UI dilemma

Here's the thing that took me too long to understand. Terminals give you two buffers, and neither one does what a streaming app actually needs.

<HtmlDiagram :html="buffersDiagram" />

**Main buffer** is what your shell runs in — `echo`, `git log`, every line-oriented CLI writes here. Content accumulates as scrollback, Cmd+F works, text selection works across history, everything persists after the app exits. TUI frameworks call this "inline mode."

**Alternate buffer** is what vim, htop, and other fullscreen apps use — a separate canvas with full cell-level control, but no scrollback. When the app exits, the buffer is discarded and the original main buffer is restored.

Append-only logs don't have this problem — output scrolls up and stays. The hard case is output that keeps changing after some of its earlier lines have already scrolled off-screen. That's what every AI agent, streaming test runner, and deployment dashboard needs — and it doesn't fit neatly into either buffer.

From here, the failure modes split cleanly: in the main buffer, flicker comes from redrawing content you no longer own. In fullscreen, it comes from emitting frames you can't generate and recover authoritatively.

## Inline redraws

As long as your mutable region still fits on screen, terminals can update it incrementally. The pathology starts once part of that region scrolls into history.

I learned this the hard way. My app worked great for the first few exchanges. Then a response got long — taller than the terminal — and part of it scrolled into the scrollback region above the viewport. Now the AI sends the next token. I need to update the live content, but some of it has crossed into terminal-owned history.

**No terminal provides random-access mutation of scrollback.** They have scroll region (`DECSTBM`), insert/delete line, and cursor positioning (`CUP`) — but none of these can reach content above the visible screen. At that point, the only option is a clear-and-repaint cycle — an ED (Erase in Display) clear followed by re-emission of the entire app region, on every token.

<HtmlDiagram :html="clearRedrawDiagram" />

If your app has 50 completed exchanges above the live one, you're redrawing all of them — not because they changed, but because the clear is all-or-nothing. The more history, the more wasted bytes. In one public tmux report, Claude Code's inline mode produced [4,000–6,700 scroll events per second](https://github.com/anthropics/claude-code/issues/9935) — ~400K scroll events in under two minutes. Users correlated this with severe [VS Code instability and crashes](https://github.com/anthropics/claude-code/issues/10794).

## Non-authoritative frames

There's a deeper source of visual instability that follows you to fullscreen mode. It happens when the rendering pipeline isn't fused — when reconciliation, layout, rendering, and output happen in separate event loop turns with gaps between them.

I hit two forms of this:

**The async gap.** A new message arrives, React adds it to the tree, but layout hasn't recalculated yet. The renderer draws the new message using the old layout dimensions. Result: overlapping text or blank gaps. On the web, the browser holds the old frame until layout completes. In a terminal, stdout _is_ the presentation API — the wrong frame is already on screen.

**Layout feedback loops.** A component renders, measures its size, discovers it changed, and re-renders. Text wraps to 3 lines, container adjusts, text reflows to 2 lines, container adjusts again — visible oscillation between two states. Ink has hit this with `measureElement()`, which returns dimensions _after_ render, triggering a state update, triggering another render. Each intermediate pass flashes on screen.

Claude Code's move to the alternate screen appears to have reduced the worst scrollback-driven flicker. But they also had to recreate several affordances users normally get from the main buffer: search (`Ctrl+O` then `/` instead of Cmd+F), text selection (custom drag handling), scrolling (PgUp/PgDn/mouse wheel capture), clipboard (OSC 52 for SSH/tmux), and history review. That `Ctrl+O` → `[` transcript dump is itself evidence that users still want a bridge back to native scrollback.

But even with full cell-level control over the active screen, users still report blank regions, stale rows, and occasional overlap. It's non-deterministic — sometimes the screen renders correctly, sometimes entire sections are empty.

In one [public reverse-engineering thread](https://github.com/anthropics/claude-code/issues/42010), contributors proposed several plausible failure modes: previous-frame corruption during scroll region optimization, a style-cache edge case, and missing full-repaint recovery after terminal state disturbances (focus change, multiplexer reattach). The exact bugs may differ, but the failure shape is the same: the renderer emits a frame based on an incorrect belief about what the screen currently shows, and then lacks a reliable way to recover.

If the failure includes state incoherence or desync, better diffing alone won't fix it.

## What I think actually matters

After several rewrites of my own renderer, I sat down and asked: what are the actual rules? If I had to write them on a napkin, what would they be?

I came up with three:

1. **Coherent frame generation** — every emitted frame is derived from one consistent snapshot of app state, layout, and styling. No gaps where state can drift between phases.
2. **Authoritative screen state** — the app maintains a model of what's on screen. The diff is computed against this model, not against what the terminal might have.
3. **Reliable resynchronization** — when the app knows it may have lost sync with the terminal (resize, reattach, exiting passthrough), it resets the terminal state it depends on and forces a full repaint from its model.

These are actually two different ownership problems. In inline mode, the terminal owns anything that has scrolled into history — you can't patch it. In fullscreen mode, you own the visible cells — but only if you also own a coherent model of them and can repaint when reality diverges.

Here's the contrast between a pipeline where phases happen in separate event loop turns, and one where they're fused:

<HtmlDiagram :html="pipelineDiagram" />

**Why the split matters for terminals but not the web:** React can prepare work off-DOM and commit atomically — the browser owns paint timing, so the user never sees a half-updated frame. In a terminal, ANSI escape sequences written to stdout are processed immediately — there's no compositor holding back a partial frame. If the pipeline computes a frame from inconsistent state, that's what the user sees.

**Why layout-before-render prevents feedback loops:** Frameworks that measure _after_ render create the oscillation I described above. When the layout engine runs first — computing positions and sizes before any rendering — components know their dimensions on the first pass. There's no feedback loop because there's no feedback.

I built [Silvery](https://silvery.dev) around those three invariants. After React produces a new tree, the entire layout → render → output pipeline runs as a single synchronous transaction. The reconciler APIs — Suspense, `useTransition`, `useDeferredValue` — remain available, though concurrent rendering semantics matter less in a renderer that flushes synchronously. The tradeoff is reduced interruptibility, but in my benchmarked workloads the cost has been small: a typical Silvery frame is about [169 microseconds](https://silvery.dev/guide/silvery-vs-ink#performance).

## How Silvery avoids it

Silvery is one implementation of this pattern. The broader point is the invariants, not any specific library. But here's how I applied them.

### App-managed scrollback

Instead of choosing between "flicker with scrollback" or "no flicker without scrollback," I split the output into three zones:

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

When a response finishes, `Static` materializes it into app-managed immutable history and unmounts the live React subtree. Later, that immutable history can graduate into native terminal scrollback. That keeps the live render tree bounded even as the overall conversation grows. New output only happens at the bottom — graduated scrollback doesn't trigger auto-scroll, so the user can review history while content streams below.

### Incremental rendering

Both Claude Code and Silvery use incremental rendering in fullscreen mode — diffing the current frame against the previous one and only emitting changed cells. Claude Code's renderer uses TypedArray double-buffering for this; Silvery uses per-node dirty flags in the render tree.

<HtmlDiagram :html="dirtyTrackingDiagram" />

The difference is where change tracking happens. A screen-level diff compares entire buffers — fast, but if the buffer was built from stale state, the diff is correct for the _wrong frame_. Silvery tracks changes at the source: only dirty nodes re-render, only changed cells generate output. If a component re-renders but produces identical output, zero bytes go to stdout. This is a performance optimization layered on top of the invariants above, not a substitute for them.

::: details How deep does it go?
The layout engine ([Flexily](https://github.com/beorn/flexily)) caches layout results and skips unchanged subtrees. The text measurement layer caches grapheme widths and line-break results. The render phase writes only changed cells. The output phase diffs the buffer and emits only changed ANSI sequences. End-to-end: ~169 microseconds for a typical interactive update (cursor move in a 1000-node tree, Apple M1 Max, 80×24, warm cache).
:::

### One component model, two output modes

```tsx
render(<App />, term) // fullscreen
render(<App />, term, { mode: "inline" }) // inline with scrollback
```

Same components in both modes. Fullscreen gets atomic frame generation, an authoritative screen model, and repaint recovery. Inline keeps the same core pipeline, then layers app-managed scrollback on top.

### How the approaches compare

|                             | CC inline (observed, pre-NO_FLICKER)     | CC fullscreen (observed, NO_FLICKER)            | Silvery fullscreen         | Silvery inline                                  |
| --------------------------- | ---------------------------------------- | ----------------------------------------------- | -------------------------- | ----------------------------------------------- |
| **Scrollback**              | Native (but redraws disrupt it)          | None while active (`Ctrl+O [` dumps transcript) | None while active          | Graduated: app scrollback → terminal scrollback |
| **Cmd+F**                   | Native                                   | Reimplemented (`Ctrl+O /`)                      | In-app                     | Native for graduated + in-app                   |
| **Incremental rendering**   | Observed: frequent large-region redraws  | Yes (cell-level buffer diff)                    | Yes (per-node dirty flags) | Yes (dirty flags + ED3 on structural events)    |
| **Pipeline**                | Appears multi-turn / non-atomic          | Appears multi-turn / non-atomic                 | Synchronous transaction    | Synchronous transaction                         |
| **Layout**                  | Appears measure-after-render             | Appears measure-after-render                    | Layout-before-render       | Layout-before-render                            |
| **Desync recovery**         | No public evidence of recovery           | No public evidence of recovery                  | Full repaint from model    | Full repaint from model                         |
| **History while streaming** | Users report being pulled back to bottom | `Ctrl+O [` to browse                            | Scroll within app          | Scroll naturally                                |

> **Note:** Claude Code cells are based on public comments, issue reports, and observed behavior — not internal source code.

> Claude Code has clearly moved from column 1 toward column 2. Silvery aims to offer columns 3 and 4. The key differences are frame atomicity, layout timing, scrollback strategy, and repaint recovery.

## Honest caveats

I won't pretend this solves everything.

**Silvery inline mode still redraws scrollback.** When app scrollback needs re-emission (resize, item graduation), Silvery does ED3 + re-emit — the same clear-and-redraw mechanism as inline flicker. The difference is frequency: this happens on infrequent structural events (a few times per session) instead of on every streaming token (50 times per second). The mechanism is the same; the trigger is different. In fullscreen mode, normal updates are incremental cell diffs; full repaints are reserved for recovery events.

**Graduation requires an immutability boundary.** Once content is released to terminal scrollback, changing it means replaying history. Items that might still change (collapsible output, edited messages) stay in app scrollback.

**Subprocess output can bypass the renderer.** If child processes write directly to the terminal, the cached frame is invalid. The app needs passthrough mode with repaint on return, or it must capture all output through the renderer.

**Emulator variability is real.** xterm.js behaves differently from Ghostty, tmux changes behavior, Windows terminals differ. Some of Claude Code's worst reports may be emulator-specific. This is why multi-backend testing matters.

::: details What about synchronized output?
Synchronized output (mode 2026) batches terminal output between `\e[?2026h` and `\e[?2026l` so partial frames never hit the screen. It helps — Silvery uses it when available. But it doesn't fix state mismatches within the pipeline, doesn't solve scrollback ownership, and doesn't help with desync recovery. It paints the wrong frame atomically instead of painting it torn.
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

If you're building a terminal app with long-lived mutable output, you'll likely hit this dilemma. The question isn't "inline or fullscreen." It's whether your rendering pipeline generates frames from consistent state, maintains an authoritative screen model, and can recover when reality diverges.

Claude Code could absolutely move in this direction. The invariants aren't Silvery-specific — they're properties any terminal renderer can be built around.

I built [Silvery](https://silvery.dev) around them because I needed them for my own app. The [scrollback example](https://silvery.dev/examples/scrollback) and [AI agent example](https://silvery.dev/examples/ai-chat) show it in practice.

---

_Silvery is an open-source React framework for terminal UIs. [GitHub](https://github.com/beorn/silvery) / [Docs](https://silvery.dev) / [Discord](https://discord.gg/silvery)_
