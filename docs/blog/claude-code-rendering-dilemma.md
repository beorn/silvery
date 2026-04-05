---
title: "Why Claude Code Flickers (And What It Would Take to Fix It)"
description: "Claude Code's 700+ upvote flickering bug, their NO_FLICKER rewrite, and why the new fullscreen mode still shows blank areas. A technical deep dive into the rendering architecture that causes it — and the pipeline design that prevents it."
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

Claude Code has a flickering problem. It's been their [most-upvoted bug](https://namiru.ai/blog/claude-code-s-terminal-flickering-700-upvotes-9-months-still-broken) for nine months, across [12+ open GitHub issues](https://github.com/anthropics/claude-code/issues/42670). They've [rewritten the renderer from scratch](https://news.ycombinator.com/item?id=46701013), [shipped a NO_FLICKER mode](https://x.com/bcherny/status/2039421575422980329), and moved to an entirely different rendering strategy — and users are still reporting blank areas and visual glitches.

I'm not picking on Claude Code. I'm using it as the example because Anthropic has shared more about their rendering challenges in public than almost anyone else. The team is clearly talented — chrislloyd [described their pipeline](https://news.ycombinator.com/item?id=46701013) as "a small game engine" operating within a 16ms frame budget. To be fair, Anthropic is solving this under production constraints across xterm.js, VS Code, tmux, SSH, Windows, and native terminals — a much harder environment than a greenfield framework. And the underlying problem isn't unique to them — any terminal app that wants rich interactivity, native scrollback, and stable streaming updates runs into some version of the same constraint.

I don't have Claude Code's internal renderer code. The discussion below is based on public comments, GitHub issues, and observed behavior.

But the constraints are solvable. This post walks through why the problem is so persistent, what it would take to actually fix it, and how a different rendering architecture — the one I built into [Silvery](https://silvery.dev) — is designed to avoid it.

## Two bugs hiding under "flicker"

Claude Code's public saga contains three different classes of bug:

1. **Clear-and-redraw flicker** — mutable content crosses into terminal-owned scrollback, forcing a full redraw on every token. This is the original flickering that drove 700+ upvotes.
2. **Layout feedback loop** — a component renders, measures its size, the size changed, it re-renders, the new size is different, it re-renders again. This oscillation causes visible jumping between two layout states.
3. **Fullscreen corruption** — even after switching to the alternate buffer, the diff renderer gets out of sync, producing blank areas, overlapping text, and stale content. This is the residual bug that persists today.

These stem from different parts of the rendering pipeline — output strategy, layout architecture, and state management — and require different solutions.

## The timeline

- **April 2025**: [#769](https://github.com/anthropics/claude-code/issues/769) — inline flickering during streaming. The status indicator redraws the entire terminal buffer.
- **Jan 2026**: Anthropic [rewrites the renderer](https://www.threads.com/@boris_cherny/post/DSZbZatiIvJ/) with differential rendering using TypedArray double-buffering. Flicker [reduced by ~85%](https://news.ycombinator.com/item?id=46701013).
- **March 2026**: [NO_FLICKER mode](https://x.com/bcherny/status/2039421575422980329) ships — switches to the alternate screen buffer. Flicker largely solved, but [scrollback and Cmd+F are gone](https://github.com/anthropics/claude-code/issues/42670). Users still report non-deterministic blank areas in fullscreen mode.

Each fix addresses a symptom. The flickering is a consequence of something deeper.

## How terminals actually work

To understand the problem, you need to understand terminal buffers.

Most xterm-style terminals expose two screen buffers:

<HtmlDiagram :html="buffersDiagram" />

**Main buffer** is what you normally see. Output accumulates as scrollback — Cmd+F searches it, text selection works across history, content persists after the app exits. This is the buffer `echo`, `git log`, and every line-oriented CLI writes to.

**[Alternate buffer](https://terminfo.dev/feature/screen.alternate-screen)** is a separate canvas the app takes over, like vim or htop. Full cell-level control — the app can update any character at any position. But there's no scrollback. When the app exits, the alternate buffer is discarded and the original main buffer is restored.

Most TUI apps pick one. Line-oriented tools use the main buffer. Full-screen apps use the alternate buffer. The problem starts when you need both.

## Problem 1: Why inline rendering flickers

Let's say you're building an AI agent TUI. You choose the main buffer because you want scrollback — users should be able to scroll up and search past exchanges with Cmd+F.

The first few exchanges work great. Content scrolls up naturally. Then a response gets long. The AI drafts an 80-line plan, taller than the terminal. It's still streaming, so the content is live — changing every frame. But part of it has scrolled into the scrollback region above the visible viewport.

Now the AI sends the next token. You need to redraw the live content. But some of it is in scrollback. And here's the constraint: **if mutable content has already scrolled into terminal-owned history, you can't surgically patch that history.** Terminals have [scroll regions](https://terminfo.dev/feature/scroll.scroll-region) (`DECSTBM`), insert/delete line, and cursor addressing — these help isolate a live region. But they don't give you random-access mutation of content the terminal has already claimed as scrollback. Many inline renderers therefore end up redrawing a large region, sometimes the entire app area.

Every token, you clear and redraw. That's the flicker.

<HtmlDiagram :html="clearRedrawDiagram" />

It gets worse. If your app has 50 completed exchanges above the live one, you're reprinting all of them too — not because they changed, but because the clear operation is all-or-nothing for your output region. The more history, the more data you're pushing to the terminal on every update.

And there's one more problem: **auto-scroll behavior.** Behavior varies a lot by emulator and settings. In some terminals — especially embedded or browser-based ones — new output while you're scrolled up can snap you back to the bottom. For a streaming app, this makes history review awkward or impossible during active output.

This is why teams eventually give up and switch to the alternate buffer. It's not that they don't want scrollback. It's that live, mutable UI and native scrollback don't coexist well in the same buffer.

## Problem 2: The layout feedback loop

There's a second, subtler source of flicker that affects both inline and fullscreen modes. It happens when layout depends on render output:

1. Component renders → text wraps to 3 lines → height is 3
2. Container adjusts to height 3 → text reflows → now 2 lines → height is 2
3. Container adjusts to height 2 → text reflows → now 3 lines → height is 3
4. Repeat forever

This oscillation is visible as the UI jumping between two states every frame. Ink had this problem because `measureElement()` returns dimensions _after_ render, triggering a state update, which triggers another render. The render→measure→render cycle runs in separate event loop turns, so each intermediate state flashes on screen.

Silvery avoids this by doing layout _before_ render. The layout engine ([Flexily](https://github.com/beorn/flexily)) measures text and computes positions in one pass — components know their available width before they render, so they never need to re-render because they "discovered" their size changed. There's no feedback loop because there's no feedback.

## The dilemma

Claude Code tried inline mode first and hit all of these problems — flickering, performance issues (4,000+ scroll events/sec in tmux), even VS Code crashes. They switched to the alternate buffer, which solved flicker but required rebuilding search (`Ctrl+O` then `/`), text selection, scrolling, clipboard handling (OSC 52 for SSH/tmux), and history review. That `Ctrl+O` → `[` escape hatch — dumping the conversation back to native scrollback — shows the team knows users want scrollback. They just can't provide it in fullscreen mode.

## Problem 3: Why fullscreen mode still breaks

Here's the part that surprised me. Even after switching to the alternate buffer — the approach that gives the app total control over every cell — users still see **garbled output**: blank areas where content should be, overlapping text, wrong colors, stale content that should have been cleared. It's non-deterministic — sometimes the screen renders correctly, sometimes huge sections are empty. Switch away and back, and the problem may appear or disappear.

How can a diff-based renderer on the alternate buffer — the approach that should give perfect control — still produce these artifacts?

The team's renderer is genuinely sophisticated — chrislloyd [described it](https://news.ycombinator.com/item?id=46701013) as running in ~5ms with packed TypedArrays, double buffering, DECSTBM hardware scrolling, and style/character pooling. But a [community analysis](https://github.com/anthropics/claude-code/issues/42010) of the renderer identified specific failure modes: the scroll optimization contaminates the previous frame's buffer, the style cache overflows after ~524K unique styles, and there's no recovery mechanism when the terminal's buffer is disturbed by a focus change or multiplexer.

These are implementation bugs, but they point to a deeper architectural pattern: better diffing alone won't solve them. The harder problems are **transactional frame generation**, **authoritative screen state**, and **reliable resynchronization** when the terminal diverges from the app's model.

## What a more robust pipeline looks like

Here's the contrast between a split pipeline where phases happen in separate event loop turns, and a transactional pipeline where they're fused:

<HtmlDiagram :html="pipelineDiagram" />

Each phase feeds the next. Both pipelines use React for reconciliation. Both can use Yoga for layout. The difference isn't the tools — it's the execution model.

**Why the split matters for terminals but not the web:** React 18+ uses concurrent rendering to keep web UIs responsive — it can pause a heavy render, handle a keystroke, then resume. On the web, this works because the app doesn't directly control presentation. React prepares work off-DOM, commits DOM mutations atomically from the app's perspective, and the browser owns paint timing. The user never sees a half-updated frame.

In a terminal, stdout _is_ the presentation API. ANSI bytes are processed immediately. If the pipeline computes a frame from inconsistent state — some components reflecting new props, others still using old ones — that's what the user sees. Consider a streaming chat app: a new message arrives, React adds it to the tree, but layout hasn't recalculated yet. The renderer draws the new message using the old layout dimensions. Result: overlapping text or blank gaps. On the web, the browser would hold the old frame until layout completes. In the terminal, the wrong frame is already on screen.

**Why frameworks in this family can't easily fix this:** Frameworks built on React's standard reconciler with default scheduling don't naturally give you an explicit reconcile→layout→output transaction. Retrofitting that tends to be architectural work, not a small patch.

**Why Silvery doesn't have this problem:** Silvery uses a custom React reconciler that controls when reconciliation flushes. After React produces a new tree, the entire layout → render → output pipeline runs as a single synchronous transaction. No `nextTick`, no deferred callbacks, no gap where buffer state can change between phases. The reconciler APIs — Suspense, `useTransition`, `useDeferredValue` — remain available, though some concurrent rendering semantics matter less in a renderer that flushes synchronously.

The only thing you lose is render interruptibility — React's ability to pause a long render to handle a keystroke, then resume. On the web, this matters because a complex component tree might take 50ms+ to reconcile. In the terminal, a typical Silvery frame takes 169 microseconds. There's nothing to interrupt.

### Inline mode with dynamic scrollback

This is the mode that addresses the inline flicker dilemma directly. Instead of choosing between "flicker with scrollback" or "no flicker without scrollback," Silvery splits the output into three zones:

<HtmlDiagram :html="zonesDiagram" />

1. **Live screen** — the bottom of the terminal. React components render here with incremental updates. This is where the current streaming response and input prompt live.
2. **App scrollback** — content above the screen that the app still manages. Pre-rendered as strings, cheaply re-emittable on resize. When the live screen finishes rendering a response, it gets virtualized into this zone.
3. **Terminal scrollback** — content the app has released to the terminal. The terminal owns it. Cmd+F works. Text selection works. It persists after the app exits.

```tsx
<Static items={completedExchanges}>
  {(exchange) => <ExchangeView key={exchange.id} exchange={exchange} />}
</Static>
<LiveExchange exchange={activeExchange} />
<InputPrompt />
```

When a response finishes and enters the `completedExchanges` array, `Static` renders it once, virtualizes the output to app scrollback, and unmounts the React component. (Silvery calls this "dynamic scrollback" internally. Ink has a similar `<Static>` concept, though the implementation differs.) From there it graduates to terminal scrollback as a static string. The active render tree stays bounded regardless of conversation length. Total memory depends on how much app-managed scrollback you retain before releasing it.

The live screen handles the frequent updates — streaming tokens, spinner animations, user typing — with incremental rendering. Only changed cells generate output bytes. A typical interactive update — cursor move in a 1000-node tree, measured on Apple M1 Max, 80×24, warm cache — takes [169 microseconds](https://silvery.dev/guide/silvery-vs-ink#performance).

The auto-scroll problem? Mitigated by the zone split. New output only happens in the live screen at the bottom. Graduated scrollback doesn't trigger terminal auto-scroll because it's already above the viewport.

### Fullscreen mode with transactional rendering

For apps that want full screen control, Silvery provides it with the same components, the same incremental rendering, and the same transactional pipeline. Layout runs before render. Render produces a buffer. The output phase diffs it against the previous buffer. No async gap. This removes a whole class of pipeline-timing bugs.

The pipeline also maintains authoritative screen state and a full resync path. If anything disrupts the terminal's buffer — resize, tmux detach/attach, focus change — the framework detects it and forces a full repaint from its authoritative model. Most diff renderers don't have this recovery mechanism.

```tsx
render(<App />, term) // fullscreen
render(<App />, term, { mode: "inline" }) // inline with scrollback
```

Same components, one-line switch.

### Screen-level diff vs per-node dirty tracking

Beyond the transactional pipeline, there's a second architectural difference: where change tracking happens.

<HtmlDiagram :html="dirtyTrackingDiagram" />

A screen-level diff compares the whole buffer now vs. before — if the buffer was built from stale state, the diff is wrong. Silvery tracks changes at the source: per-node dirty flags in the render tree. Only dirty nodes re-render. The buffer diff is just the final output optimization, not the correctness mechanism.

::: details How deep does the incremental rendering go?
The layout engine — [Flexily](https://github.com/beorn/flexily), a pure TypeScript flexbox implementation — caches layout results and skips recalculation for unchanged subtrees. The text measurement layer caches grapheme widths and line-break results, so re-wrapping only happens when content or width actually changes. The render phase writes only changed cells to the buffer. The output phase diffs the buffer and emits only changed ANSI sequences. A typical interactive update: 169 microseconds end-to-end.
:::

## How you'd catch these bugs before shipping

Rendering bugs like these are notoriously hard to catch with traditional testing. A unit test that checks ANSI escape code output will pass — the escape codes are correct. The problem is that when a real terminal emulator processes those codes in a particular order, the result can be garbled — blank cells, overlapping text, wrong colors. You need emulator-level assertions, not string comparison.

This is why we built [Termless](https://termless.dev) — like Playwright, but for terminal apps. Where Playwright tests across Chromium, Firefox, and WebKit, Termless tests across real terminal emulator engines: xterm.js (VS Code's engine), Ghostty, Alacritty, WezTerm, Kitty, and more — 11 backends in all. If your app renders correctly in xterm.js but breaks in Ghostty, the test catches it.

<HtmlDiagram :html="termlessDiagram" />

```tsx
import { createTermless } from "@silvery/test"
import { run } from "silvery/runtime"
import "@termless/test/matchers"

using term = createTermless({ cols: 80, rows: 24 })
const app = await run(<StreamingChat />, term)

await app.dispatch({ type: "token", text: "Hello " })
await app.dispatch({ type: "token", text: "world" })
expect(term.screen).toContainText("Hello world")

// Scroll up, back down — verify nothing disappeared
await app.press("PageUp")
await app.press("PageDown")
expect(term.screen).toContainText("Hello world")

// Resize triggers full repaint — verify recovery
term.resize(80, 24)
expect(term.screen).toContainText("Hello world")
```

The key: `term.screen` isn't ANSI output — it's the terminal's **screen buffer** after the emulator processes all escape codes. If a diff renderer leaves blank cells, the screen buffer shows blank cells — and if it happens in Ghostty but not xterm.js, the multi-backend matrix catches it. Silvery's own correctness is verified by fuzz tests that compare incremental renders against fresh renders across thousands of random state transitions.

## How the approaches compare

|                         | Naive inline                  | Fullscreen (alt buffer)    | Transactional fullscreen       | Inline + dynamic scrollback           |
| ----------------------- | ----------------------------- | -------------------------- | ------------------------------ | ------------------------------------- |
| **Buffer**              | Main                          | Alternate                  | Alternate                      | Main                                  |
| **Terminal scrollback** | Yes, but disrupted by redraws | Not while active           | Not while active               | Yes (content graduates out)           |
| **Cmd+F**               | Native (but flickers)         | Reimplemented in-app       | Reimplemented in-app           | Native (terminal scrollback) + in-app |
| **Pipeline**            | Split (gap between phases)    | Split (gap between phases) | Single synchronous transaction | Single synchronous transaction        |
| **Desync recovery**     | None                          | None                       | Full repaint from model        | Full repaint from model               |
| **Render tree growth**  | Grows with conversation       | Only visible content       | Only visible content           | Bounded (items graduate out)          |

> Claude Code started in column 1 and moved to column 2. Silvery provides columns 3 and 4.

## What about synchronized output?

Terminal-savvy readers will think of [synchronized output](https://terminfo.dev/feature/output.synchronized-output) (DEC mode 2026) — a protocol where the terminal batches all output between `\e[?2026h` and `\e[?2026l` and paints it atomically. Ghostty, kitty, iTerm2, and WezTerm support it.

It helps — visibly. Synchronized output eliminates visible tearing by ensuring partial frames never hit the screen. But it doesn't address the deeper issues:

- It doesn't fix state mismatches within the app's pipeline. If the diff is computed against stale state, synchronized output paints the wrong frame atomically instead of painting it torn.
- It doesn't solve the scrollback constraint. Mutable content in terminal-owned history is still unreachable.
- It doesn't help with desync recovery. If anything disrupts the terminal's buffer state (focus change, tmux detach/attach, SSH reconnect), the app needs to detect and force a full repaint.

Silvery uses synchronized output when available — it reduces visible artifacts further. But the architecture doesn't depend on it for correctness.

## Honest caveats

This isn't magic. There are real constraints.

**The scrollback tradeoff is still there.** Silvery can't incrementally update scrollback either. The difference is _when_ redraws happen. Without dynamic scrollback, every state change triggers a full clear-and-redraw. With it, redraws happen on infrequent structural events — terminal resize, item graduation. In practice users rarely see flickering, but on resize with thousands of graduated items there's a brief pause.

**Graduation requires an immutability boundary.** Once content is released to terminal scrollback, changing it means replaying or rebuilding history. If old items can still change — retroactive status updates, collapsible tool output, edited messages — they need to stay in app scrollback, not terminal scrollback.

**Subprocess output can bypass the renderer.** If child processes or tools write raw bytes directly to the terminal, the cached previous frame is invalid. The app either needs passthrough mode with repaint on return, or it must capture all output through the renderer.

**Emulator variability is real.** xterm.js behaves differently from Ghostty, tmux changes behavior, Windows terminals differ. Some of Claude Code's worst reports may be emulator-specific, not purely app-architecture-specific. This is why multi-backend testing matters.

## The pattern

If you're building a terminal app that streams output — an AI agent, a test runner, a build tool, a deployment dashboard — you'll hit this dilemma. The question is whether you:

1. Accept flickering (inline rendering, full redraw on every update)
2. Give up scrollback (alternate screen, reimplement terminal features in your app)
3. Use dynamic scrollback (inline + incremental + content graduation)

Option 3 isn't just a feature. It's a different rendering architecture — transactional pipeline, authoritative screen state, per-node dirty tracking, zone-based output management, desync recovery. You can't bolt it onto an existing render-first framework. It has to be designed in from the start.

This is the architecture I built into Silvery. The [scrollback example](https://silvery.dev/examples/scrollback) and [AI agent example](https://silvery.dev/examples/ai-chat) show it in practice.

---

_Silvery is an open-source React framework for terminal UIs. [GitHub](https://github.com/beorn/silvery) / [Docs](https://silvery.dev) / [Discord](https://discord.gg/silvery)_
