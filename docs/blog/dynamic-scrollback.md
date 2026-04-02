---
title: "Dynamic Scrollback: Why Your TUI Should Use the Terminal's Native History"
description: "Most TUI frameworks trap everything in the alternate screen. Here's what you lose and how dynamic scrollback gives it back."
date: 2026-04-02
---

# Dynamic Scrollback: Why Your TUI Should Use the Terminal's Native History

Open vim. Type some text. Quit vim. The text is gone -- your terminal looks exactly as it did before you launched vim. This is the alternate screen buffer at work, and it's how nearly every TUI framework operates.

The alternate screen is an important tool, but it comes with a cost that most TUI developers don't think about. This article is about that cost, and an alternative approach I call dynamic scrollback.

## What the Alternate Screen Does

When a terminal application sends `\x1b[?1049h`, the terminal switches to a second buffer. The original screen content -- your shell prompt, your last command output, everything -- is preserved but hidden. The application draws whatever it wants on the alternate screen. When it sends `\x1b[?1049l` (or exits), the terminal switches back, and the original content reappears.

This is elegant for editors, dashboards, games -- anything that owns the full screen temporarily. The problem is that "temporarily" has become "always." Modern TUI frameworks default to alternate screen mode, and most applications never leave it.

## What You Lose

In the alternate screen, the user loses four things:

**Native scrollback.** The terminal's scroll buffer doesn't work. Mouse wheel scrolling, scrollbar dragging, trackpad gestures -- none of them scroll through your application's history. If the application doesn't implement its own scrolling (and most implement it poorly), the user has no way to see content that has scrolled past.

**Terminal search.** Cmd+F (or the terminal's built-in search) searches the scrollback buffer. On the alternate screen, there is no scrollback buffer. The user can't search for text in your application's output unless the application implements search itself.

**Text selection.** On the normal screen, the user can select text across multiple screenfuls of scrollback. On the alternate screen, selection is limited to what's currently visible. Content that has scrolled past the viewport is unreachable.

**History persistence.** When the application exits, the alternate screen vanishes. There's no record of what the application displayed. If the user wants to reference something the application showed them, they need to have copied it before closing.

For some applications, these tradeoffs are fine. A text editor should own the full screen. A game should own the full screen. But for applications that produce output the user wants to review later -- test runners, chat interfaces, build tools, agent UIs -- the alternate screen throws away the terminal's best feature: its scrollable history.

## The Insight

Claude Code doesn't use the alternate screen. It runs in inline mode: output goes to the normal terminal buffer, scrolls up naturally, and becomes part of the terminal's permanent history. When you finish a conversation, you can scroll up to the beginning. You can Cmd+F to search for something the agent said. You can select and copy entire exchanges.

The insight behind this is that not all output is equal. In an AI agent conversation, completed exchanges are done -- they'll never change. The current exchange is live -- tokens are still streaming, tool calls are still running. The live part needs React components, state management, and interactivity. The completed parts don't. They're just text.

So the question is: can you keep the live part on screen as active components while letting completed content graduate to the terminal's native scrollback?

## How Dynamic Scrollback Works

The approach is a three-zone model. From bottom to top:

**The live screen.** The bottom of the terminal. This is where React components render normally -- the current streaming response, the input prompt, the status bar. Full interactivity, incremental rendering, the whole framework pipeline.

**Dynamic scrollback.** Content above the visible screen that the application still tracks. These are pre-rendered strings -- the output of completed items that have scrolled off screen. The application retains the data and can re-emit these strings if needed (for example, on terminal resize).

**Static scrollback.** Content the application has released. The terminal owns these lines. The user can scroll to them and select text, but the application can't modify them and doesn't try to preserve them.

The lifecycle of an item (a chat message, a test result, a build step) goes:

1. **Mounted**: Active React component on the live screen. Normal rendering, hooks, state.
2. **Virtualized**: Scrolled off screen. The component unmounts, but its rendered output is cached as a string. The application can re-emit it cheaply.
3. **Gone**: Pushed past the history limit. Data dropped. The terminal has the rendered text in its scrollback until the next buffer clear.

The key mechanism: when dynamic scrollback needs to update (a new item pushes content up, the terminal resizes), the application clears the scrollback with `\x1b[3J` and re-emits all tracked items as pre-rendered strings, then renders the live screen below. This is fast because pre-rendered items are just string writes -- no React reconciliation, no layout computation, no diffing.

## When To Use It

Dynamic scrollback fits applications where:

- Output accumulates over time (chat, test runners, build logs, agent conversations)
- Completed items don't change (once a message is sent, it's done)
- Users want to scroll back through history
- Users want to search through output
- Users want to copy text from earlier output

In Silvery, this pattern is expressed through `ScrollbackView`:

```tsx
import { ScrollbackView } from "silvery"

interface TestResult {
  id: string
  name: string
  status: "running" | "pass" | "fail"
  output: string
  duration?: number
}

function TestRunner({ results }: { results: TestResult[] }) {
  return (
    <ScrollbackView
      items={results}
      keyExtractor={(r) => r.id}
      isFrozen={(r) => r.status !== "running"}
      footer={<ProgressBar total={results.length} done={results.filter((r) => r.status !== "running").length} />}
    >
      {(result) => <TestResultView result={result} />}
    </ScrollbackView>
  )
}
```

`isFrozen` tells Silvery which items are done changing. Frozen items can be safely pre-rendered and virtualized when they scroll off screen. Unfrozen items (still running) stay mounted as React components longer, resisting virtualization until they're well past the screen edge.

## When Not To Use It

Dynamic scrollback is wrong for text editors, games, dashboards -- anything that owns the full screen for interactive manipulation. Stick with alternate screen for those. It's also unnecessary for short-lived CLIs that print output and exit.

The boundary: if your application produces output the user might want to review later, dynamic scrollback is worth considering.

## The Tradeoffs

**Static scrollback is destroyed on redraw.** When the dynamic zone needs updating, `\x1b[3J` clears the terminal's scrollback buffer. Items promoted past the history limit are lost after the next redraw. This is the fundamental cost.

**No scroll position detection.** No terminal protocol tells the application whether the user has scrolled up. The app can't show a "new content below" indicator.

**Resize re-renders everything.** All pre-rendered items need re-rendering at the new width. In practice this is fast (string rendering, no React), but it's O(N) work.

**More pipeline complexity.** Virtualization states, pre-rendering, zone transitions -- unnecessary for applications that don't need scrollback history.

One design dead-end worth mentioning: DECSTBM (scroll regions) can't be used to pin a footer, because lines that scroll out of a scroll region are discarded -- they never enter the terminal's scrollback buffer. I confirmed this across Ghostty, Kitty, iTerm2, and xterm.

## The Bigger Picture

The terminal's scrollback buffer is one of its most underappreciated features. It's a free, universally-supported, infinite-ish text history with built-in search, selection, and scrolling. Every terminal already has it. Every user already knows how to use it.

Most TUI frameworks throw it away by defaulting to the alternate screen. For applications that produce output over time -- and that's a lot of applications, from chat to CI to test runners -- using the normal screen and letting completed output graduate to scrollback gives users capabilities that would take significant engineering effort to replicate inside the application.

Dynamic scrollback isn't appropriate for every TUI. But for the growing category of streaming, output-heavy terminal applications -- AI agents being the most prominent example -- the terminal already has most of the infrastructure you need. The trick is building a pipeline that uses it rather than replacing it.
