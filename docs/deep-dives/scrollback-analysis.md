# Scrollback Analysis: Interactivity in Inline Mode

> **Bead**: km-silvery.scrollback-analysis
> **Date**: 2026-02-25

## The Core Question

**How much interactivity can a terminal app have in inline mode when the user can scroll — and how can useScrollback help?**

## Terminal Fundamentals

### The Two-Buffer Model

Every terminal emulator maintains two distinct areas:

1. **Viewport** (mutable grid): The visible rows × cols grid. Applications write to it via ANSI escape sequences. Cursor positioning (`CUU`, `CUD`, `CHA`, `CUP`) works freely within this grid.

2. **Scrollback buffer** (append-only): When content is pushed off the top of the viewport (via newline at the bottom row, or scroll-up within DECSTBM scroll regions), it enters the scrollback buffer. **Once there, it is immutable.** No escape sequence can modify scrollback content.

### When Content Enters Scrollback

Per wezterm's maintainer: _"When a newline is processed, if the cursor position would move off the bottom of the screen, and the scroll margins match the full viewport height, then the top row of the grid is moved into immutable scrollback."_

Key: content only enters scrollback when it is **pushed off the top of the viewport**. Cursor-up commands (CUU) are clamped at row 0 — they cannot reach into scrollback.

### Viewport Behavior When User Scrolls Up

Terminal emulators handle this differently:

| Terminal         | Behavior When User Scrolls Up + New Output Arrives                                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ghostty          | Viewport stays pinned where user scrolled. `scroll-to-bottom` config: default is `keystroke, no-output` (the `output` option is _currently unimplemented_). |
| iTerm2           | Stays pinned on scroll-up. Scrolls to bottom on next keystroke.                                                                                             |
| WezTerm          | Configurable: `scroll_to_bottom_on_input` (default: true).                                                                                                  |
| Windows Terminal | Viewport should stay pinned, but has bugs around it (issue #7222).                                                                                          |
| xterm            | `scrollTtyOutput` controls this. When false, output doesn't auto-scroll, but content still updates at the cursor position.                                  |

**Critical insight**: When the user scrolls up and the app writes new output at the cursor position (bottom of viewport), the terminal updates the viewport content at the bottom BUT does not force the user's view to scroll down. The user sees stale content until they scroll back.

## silvery Inline Mode Architecture

### How It Works Now

```
┌─────────────────────────────────┐
│  Scrollback (immutable)         │  ← useScrollback writes here
│  ...frozen exchanges...         │     via stdout.write()
├─────────────────────────────────┤
│  Viewport (mutable)             │  ← render() writes here
│  ┌─ Live exchanges ──────────┐  │     via cursor-up + full re-render
│  │  Active exchange           │  │
│  │  Streaming indicator       │  │
│  │  Status bar                │  │
│  └────────────────────────────┘  │
└─────────────────────────────────┘
```

Key mechanisms:

- **Layout width**: `stdout.columns ?? 80` (correct, matches terminal)
- **Layout height**: `NaN` (auto-sizes to content, no fixed constraint)
- **Output capping**: Content taller than `termRows` (terminal height) is truncated to prevent scrollback corruption
- **Render strategy**: Always full re-render (no incremental diff for inline mode)
- **Cursor management**: `\x1b[${cursorOffset}A\r` (cursor-up + CR) to reach render region start
- **scrollbackOffset**: Tracks lines written via useScrollback, consumed on next render

### useScrollback Hook

```tsx
const frozenCount = useScrollback(exchanges, {
  frozen: (ex) => ex.frozen,
  render: (ex) => renderExchangeToJSX(ex),
})
```

1. Computes contiguous frozen prefix count
2. When frozen count increases, renders newly frozen items via `renderStringSync()` (styled JSX → ANSI string)
3. Writes directly to stdout (bypasses render pipeline)
4. Notifies scheduler via `notifyScrollback(linesWritten)` for cursor offset tracking (initial freeze only — NOT called during resize)
5. Returns frozen count so app can skip frozen items in live render

### What useScrollback Gives Us

| Capability                                                 | Status                          |
| ---------------------------------------------------------- | ------------------------------- |
| Frozen content becomes real scrollback                     | ✅ Works                        |
| Scrollback content is native text (searchable, selectable) | ✅ Works                        |
| Scrollback persists after app exit                         | ✅ Works                        |
| Live area stays small (only active content)                | ✅ Works                        |
| Frozen content rendered with JSX styling                   | ✅ Works (via renderStringSync) |

## The Interactivity Question

### What's Possible

1. **Small live area at bottom** — Only the current exchange + status bar are in the mutable viewport. This minimizes the "flicker zone" and maximizes scrollback content.

2. **User can scroll up freely** — Terminal scrollback works natively. User sees frozen exchanges as styled text. In Ghostty (default config), the viewport stays pinned where the user scrolled even as new output arrives.

3. **User can search scrollback** — Cmd+F (terminal native search) works on scrollback content since it's real text.

4. **User can select/copy from scrollback** — Native terminal selection works.

5. **Keyboard input scrolls back to bottom** — When the user types (presses Enter, etc.), the terminal auto-scrolls to bottom (Ghostty default: `scroll-to-bottom: keystroke`). The live area is then visible.

6. **Compaction flushes everything to scrollback** — On compaction, all live exchanges are frozen, written to scrollback, and the live area starts fresh. This is useful for very long sessions.

### What's NOT Possible (Terminal Limitations)

1. **Cannot detect if user has scrolled** — There is no escape sequence to query the viewport scroll position. The app has no way to know if the user is viewing scrollback or the live area.

2. **Cannot modify scrollback content** — Once frozen, content cannot be updated, re-styled, or removed.

3. **Cannot pause rendering when user scrolls up** — Without scroll detection (#1), the app can't know to pause. It keeps rendering at the cursor position regardless.

4. **Cannot make scrollback interactive** — No click handlers, no focus, no hover states in scrollback. It's static text. (Terminal hyperlinks via OSC 8 _do_ work in scrollback if the terminal supports them.)

5. **Cannot guarantee scrollback width matches terminal width** — If the user resizes the terminal, scrollback content remains at the old width. New content renders at the new width. This causes visual misalignment in scrollback.

6. **Live area can't exceed terminal height** — Content beyond `termRows` is truncated. If a single exchange with many tool calls exceeds the viewport, it gets cut off.

### What Claude Code Gets Wrong (And We Can Do Better)

Claude Code's inline mode has known issues:

| Issue                                                   | Claude Code                                            | silvery with useScrollback                                                |
| ------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| Scrollback contains stale TUI frames                    | ✅ Problem — every viewport redraw pushes stale frames | ✅ **Solved** — frozen content is rendered once as clean text             |
| Auto-scroll to top when output arrives during scroll-up | ✅ Problem (issue #10769)                              | ✅ **Solved** — live area stays at cursor, user's viewport is undisturbed |
| /clear wipes scrollback                                 | ✅ Problem (issue #2479)                               | N/A — compaction freezes to scrollback, doesn't clear                     |
| Native Cmd+F search                                     | ✅ Works                                               | ✅ Works (better — scrollback is clean text, not stale frames)            |

**The key advantage of useScrollback**: Clean scrollback. Claude Code's scrollback is polluted with previous render frames because every viewport update pushes the old frame up. With useScrollback, frozen content is rendered exactly once as a final styled version. The scrollback contains a clean, readable conversation history.

### The claude-chill Pattern

A third-party tool called [claude-chill](https://github.com/davidbeesley/claude-chill) works around Claude Code's scrollback issues by:

1. Sitting as a PTY proxy between the terminal and the app
2. Intercepting DEC 2026 synchronized output blocks
3. Maintaining a VT100 emulated screen state + 100K line history buffer
4. Providing a "lookback mode" (Ctrl+6) that pauses rendering and dumps history

This is essentially what useScrollback does natively — but at the framework level instead of requiring an external proxy.

## Framework Comparison

| Framework                   | Mode                 | Scrollback                     | Scroll Detection | Live Updates        |
| --------------------------- | -------------------- | ------------------------------ | ---------------- | ------------------- |
| **silvery (useScrollback)** | Inline               | Clean frozen content           | No               | Yes, small viewport |
| **Claude Code**             | Inline               | Stale frames                   | No               | Yes, full viewport  |
| **pi-tui**                  | Inline               | Line-by-line native            | No               | Yes, differential   |
| **BubbleTea**               | Alt screen (default) | None                           | N/A              | Full screen         |
| **Textual**                 | Both                 | Inline: partial                | No               | Yes                 |
| **Ratatui**                 | Alt screen           | Optional via `insert_before()` | N/A              | Full screen         |
| **Blessed**                 | Alt screen           | None (configurable in widgets) | N/A              | Full screen         |

### pi-tui (Gold Standard for Inline)

pi-tui renders line-by-line to the normal screen buffer. Key technique: "Find the first line that differs, move cursor there, re-render from there to end." When changes occur above the viewport (user scrolled up), it does a full clear + re-render.

Uses DEC 2026 synchronized output for flicker prevention.

### Textual (Inline Mode)

Textual's inline mode anchors the frame to the bottom. Uses cursor repositioning to overwrite the frame. When the frame shrinks, emits clear-to-end-of-screen. Implemented smooth pixel-level scrolling for supporting terminals (Kitty, WezTerm).

## Edge Cases and Known Limitations

### 1. Content Exceeds Terminal Height

**Current behavior**: Output capped to `termRows` rows. Bottom content is truncated.

**Mitigation**: useScrollback keeps the live area small by freezing old exchanges. The live area should rarely exceed terminal height if the app freezes aggressively.

**Potential improvement**: Could use DECSTBM scroll regions to scroll within the live area, but this is terminal-dependent and adds complexity.

### 2. Terminal Resize During Session

**Current behavior**: Auto-compact on resize. All live exchanges are frozen to scrollback, and the app starts fresh at the new width.

**The problem**: Scrollback content remains at the old width. If the terminal narrows, old lines wrap. If it widens, old lines are short.

**Mitigation**: This is cosmetic-only. The content is still readable. No fix is possible (scrollback is immutable).

### 3. User Scrolls Up During Live Content

**Current behavior**: silvery keeps rendering at the cursor position. The user's viewport is undisturbed (Ghostty default). When the user presses a key, the terminal scrolls back to the bottom.

**The problem**: The user can't see live updates while scrolled up. They might miss important progress.

**No solution exists**: There is no escape sequence to detect scroll position. The app cannot know the user has scrolled.

**Possible workaround**: A visual bell or audio bell when important events occur (e.g., task completion) could alert the user to scroll back down.

### 4. Scrollback Content Width on Resize

The `renderExchangeToJSX` function uses `process.stdout.columns || 80` for width. This is correct at the time of rendering, but if the terminal resizes later, old scrollback content is at the old width.

**No fix needed**: This is inherent to terminal scrollback.

### 5. Very Long Sessions (100+ Exchanges)

**Current behavior**: With `MAX_LIVE_TURNS = 10`, only the last 10 exchanges are in the live area. All others are in scrollback.

**Performance**: `useScrollback` renders newly frozen items once via `renderStringSync`. No re-rendering of old content. The live area stays small and responsive.

**Scrollback size**: Limited by the terminal's scrollback buffer size (Ghostty default: 10,000 lines, configurable).

## Recommendations

### For the Demo (static-scrollback.tsx)

1. **Already good**: useScrollback + inline mode provides clean scrollback, small live area, native search/selection.
2. **Consider adding**: A "session complete — press q to quit, scroll up to review" message when done, to encourage the user to explore the scrollback.
3. **Consider adding**: Visual bell on compaction events if the user might be scrolled up.

### For silvery Framework

1. **Document the pattern**: useScrollback + inline mode is the recommended way to build Claude Code-style apps. Document the tradeoffs clearly.
2. **Consider**: An optional `scroll-to-bottom` hint that apps can emit (e.g., via OSC) for terminals that support it.
3. **Consider**: A `useScrollbackSummary` hook that writes a compact summary to scrollback instead of full exchange rendering — useful for very long sessions.

### For the Box Width Issue (Root Cause Found)

The layout engine and buffer are **correct** — every line is exactly `cols` visible characters. The visual overflow is caused by **terminal auto-wrap (DECAWM)**.

**Root cause**: When `bufferToAnsi` writes exactly N characters to an N-column line, the cursor enters a "pending wrap" state at position N. The subsequent `\n` then causes a double line advance, creating blank lines and visual overflow. This is standard DEC auto-wrap margin behavior — most terminal apps (vim, less, etc.) avoid it by limiting output to `cols - 1`.

**The fix** should be in `output-phase.ts` — either:

1. **Limit inline mode output to `cols - 1`** (simplest, standard practice)
2. Trim trailing whitespace before the last column
3. Reorder `\x1b[K` before the final character

See bead `km-silvery.inline-autowrap` for tracking.

### Enriching Scrollback Content

Modern terminal features that could enhance frozen scrollback:

1. **OSC 8 hyperlinks**: Wrap filenames and URLs in hyperlink sequences so users can Cmd+Click to open them. These remain functional in scrollback.
2. **Semantic markers (OSC 133)**: Emit shell-integration-style marks around exchanges for "jump to previous prompt" navigation in iTerm2/Kitty.
3. **Bell/notification on completion**: When the user is scrolled up and misses a task completion, emit `\a` or use OSC 9/99 notification to alert them.
4. **Inline images (Kitty/Sixel)**: Code snippets or diagrams could be rendered as images in scrollback for richer presentation.

## External Validation (O3 Deep Research)

Independent review by O3 confirms:

1. **Architecture is sound** — no major gaps or missing features. The "freeze prefix to scrollback" pattern is the right approach.
2. **DECSTBM scroll regions are a dead end** — lines scrolled within a non-full-screen region don't enter scrollback, defeating the purpose.
3. **Diff rendering not urgent** — the live area is small enough that full re-render is fast. Worth revisiting if live area grows or terminals without CSI 2026 are targeted.
4. **Terminal ecosystem is trending favorably** — synchronized output, modern protocols, and terminal maintainers open to new extensions all support this approach.
5. **No framework does this better** — pi-tui comes closest with line-level diffing, but lacks the explicit freeze/live separation that useScrollback provides.

## Summary

| Question                                                           | Answer                                                                                    |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Can we have interactivity in inline mode?                          | **Yes** — live area at bottom updates normally                                            |
| Can the user scroll through history?                               | **Yes** — native terminal scrollback via useScrollback                                    |
| Is the scrollback clean?                                           | **Yes** — unlike Claude Code, frozen content is rendered once as final styled text        |
| Can we detect user scroll position?                                | **No** — fundamental terminal limitation                                                  |
| Can we pause when user scrolls up?                                 | **No** — no scroll detection available                                                    |
| Can we update scrollback content?                                  | **No** — immutable once written                                                           |
| Does useScrollback solve the "stale frames in scrollback" problem? | **Yes** — this is its primary value                                                       |
| How does this compare to Claude Code?                              | **Better scrollback quality, same viewport behavior**                                     |
| Why do boxes appear to overflow?                                   | **DECAWM auto-wrap** when writing exactly `cols` chars to a line (fix: limit to `cols-1`) |
| Can we enrich scrollback?                                          | **Yes** — OSC 8 links, OSC 133 marks, bell notifications                                  |
