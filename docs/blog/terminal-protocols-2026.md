---
title: "Terminal Protocols You Should Know in 2026"
description: "The modern terminal feature landscape — Kitty keyboard, synchronized output, OSC 52 clipboard, graphics protocols, and which terminals support them."
date: 2026-04-02
---

# Terminal Protocols You Should Know in 2026

The VT100 shipped in 1978, but the terminal protocol landscape is evolving faster now than it has in decades. This article covers the protocols that matter for building terminal applications today, with support data from [terminfo.dev](https://terminfo.dev) (real probe tests, not documentation claims).

## Kitty Keyboard Protocol

**What it solves.** The traditional terminal keyboard protocol can't distinguish Ctrl+I from Tab (both byte `0x09`), Ctrl+M from Enter (`0x0d`), or Ctrl+[ from Escape (`0x1b`). This ambiguity is inherited from the VT100. Modern TUI applications want to bind all modifier combinations and distinguish every key unambiguously.

The Kitty keyboard protocol (CSI u) solves this:

- Every key gets a unique numeric code. No ambiguity.
- Modifier keys are reported explicitly (Shift, Ctrl, Alt, Super, Hyper, Meta).
- Key release events are optionally reported.
- The protocol is progressive -- applications enable it with capability flags and disable it when they exit.

**Support.** Ghostty, Kitty, iTerm2, WezTerm, and Warp all support it. Terminal.app does not. tmux has partial support (passthrough).

**For application developers.** If your TUI application needs reliable modifier detection or wants to bind keys like Ctrl+I independently from Tab, the Kitty keyboard protocol is the way to do it. Check for support at startup with a mode query (DECRPM for mode 2048) and fall back to legacy key parsing when it's not available.

## Synchronized Output (DEC Mode 2026)

**What it solves.** When a terminal application redraws the screen, it sends a series of escape sequences: move cursor here, write these characters, change this color, move there, write more. The terminal processes and displays these incrementally. If the update takes long enough -- say, redrawing a complex TUI -- the user sees intermediate states. Text appears on the left before the right side is drawn. Colors change before text. This can look like flickering.

Synchronized output wraps an update in begin/end markers:

```
\x1b[?2026h  ← begin synchronized update
... all the drawing commands ...
\x1b[?2026l  ← end synchronized update
```

The terminal buffers everything between the markers and presents it as a single atomic frame. No intermediate states visible to the user.

**Support.** This is widely adopted. Ghostty, Kitty, iTerm2, WezTerm, Warp, and Terminal.app all support it. tmux passes it through. Among the terminals I've tested on [terminfo.dev](https://terminfo.dev), I haven't found a modern terminal that doesn't support it.

**For application developers.** This is the kind of protocol you should just always enable when doing screen updates. The overhead of the begin/end markers is negligible, and terminals that don't understand the sequence simply ignore it (it's a private mode, not a command that produces visible output).

## OSC 52: Clipboard Access

**What it solves.** Terminal applications sometimes need clipboard access. A TUI text editor wants to support Ctrl+C/Ctrl+V. An agent wants to paste a code snippet. A tool wants to copy its output to the clipboard.

OSC 52 lets applications write to (and sometimes read from) the system clipboard through escape sequences. The remarkable thing about OSC 52 is that it works over SSH: the application running on a remote server sends the sequence, the local terminal processes it and writes to the local clipboard. No X11 forwarding, no special configuration.

```
\x1b]52;c;SGVsbG8=\x07    ← write "Hello" (base64-encoded) to clipboard
\x1b]52;c;?\x07            ← request clipboard contents
```

**Support.** All five major macOS terminals support clipboard writing. Clipboard reading is more restricted for security reasons -- an arbitrary application reading your clipboard silently is a real concern. iTerm2 allows clipboard reading by default; most others require explicit user opt-in.

**For application developers.** OSC 52 clipboard writing is safe to use broadly. Clipboard reading should be treated as a capability that may not be available. If your application needs to read the clipboard, check whether the terminal responds to the read query and handle the case where it doesn't.

## OSC 8: Hyperlinks

**What it solves.** Clickable links in terminal output. Before OSC 8, terminals used regex-based link detection -- they'd scan output for patterns that looked like URLs and make them clickable. This was fragile: long URLs would break across lines, and the visible text had to be the URL itself.

OSC 8 works like HTML anchor tags:

```
\x1b]8;;https://example.com\x07Click here\x1b]8;;\x07
```

The visible text ("Click here") can be anything. The URL is in the escape sequence. Lines can wrap without breaking the link. Multiple links can appear on the same line.

**Support.** All five major macOS terminals support OSC 8. It's also supported by tmux (since 3.4), VS Code's terminal, and most Linux terminals. This is one of those protocols that went from niche to universal in about three years.

**For application developers.** If your CLI output includes URLs, consider wrapping them in OSC 8. The visible text can be a shorter description while the full URL is preserved. Terminals that don't support OSC 8 will simply display the visible text without a link -- graceful degradation.

## Graphics: Sixel vs Kitty

Inline image display in the terminal. Two competing protocols, neither fully dominant.

**Sixel** is the older protocol, dating back to the DEC VT340 (1987). Images are encoded as a series of six-pixel-high horizontal bands. The format is well-defined and supported by xterm, Terminal.app (since macOS Sequoia), and others. It's simple but limited: no transparency, modest resolution, and the encoding is verbose.

**Kitty graphics protocol** is newer and more capable. Images are transmitted as PNG or RGB data, support transparency, can be placed at arbitrary positions, and can even be animated. Transmission happens out-of-band (the image data doesn't pollute the terminal stream).

| Feature           | Sixel         | Kitty Graphics         |
| ----------------- | ------------- | ---------------------- |
| Transparency      | No            | Yes                    |
| Animation         | No            | Yes                    |
| Image format      | Sixel-encoded | PNG, RGB, RGBA         |
| Placement control | Row-based     | Arbitrary              |
| Terminal.app      | Yes           | Yes                    |
| Ghostty           | No            | Yes                    |
| Kitty             | No            | Yes                    |
| iTerm2            | No            | No (uses own protocol) |
| WezTerm           | No            | Yes                    |

iTerm2 has its own image protocol (OSC 1337) that predates both Kitty graphics and the resurgence of sixel. It supports inline images, badges, and custom rendering, but it's iTerm2-specific.

**For application developers.** If you need inline images, you'll likely need to support multiple protocols. Detect the terminal (or better, probe for capability) and choose accordingly. For the broadest support, sixel gets you xterm and Terminal.app; Kitty graphics gets you Ghostty, Kitty, and WezTerm; OSC 1337 gets you iTerm2.

## Focus Reporting, Truecolor, Semantic Prompts

Three protocols that are now universally supported across all five major macOS terminals:

**Focus reporting** (DEC mode 1004) lets the application detect when the terminal window gains or loses focus. Useful for pausing animations or refreshing data when the user returns.

**Truecolor** (24-bit RGB via `\x1b[38;2;R;G;Bm`) gives applications full-spectrum color. The 256-color palette era is over for macOS.

**Semantic prompts** (OSC 133) mark boundaries between shell prompts, commands, and output. This enables Cmd+Up/Down navigation between commands, output folding, and success/failure markers. If your application has a prompt/command/output structure (a REPL, a test runner, an agent), emitting these markers gives users terminal-level navigation through your output.

## The Support Landscape

Here's a summary of protocol support across macOS terminals, based on [terminfo.dev](https://terminfo.dev) probe results:

| Protocol            | Ghostty | Kitty | iTerm2 | Warp | Terminal.app |
| ------------------- | ------- | ----- | ------ | ---- | ------------ |
| Kitty keyboard      | Yes     | Yes   | Yes    | Yes  | No           |
| Synchronized output | Yes     | Yes   | Yes    | Yes  | Yes          |
| OSC 52 write        | Yes     | Yes   | Yes    | Yes  | Yes          |
| OSC 52 read         | No      | No    | Yes    | No   | No           |
| OSC 8 hyperlinks    | Yes     | Yes   | Yes    | Yes  | Yes          |
| Kitty graphics      | Yes     | Yes   | No     | Yes  | Yes          |
| Sixel               | No      | No    | No     | No   | Yes          |
| Focus reporting     | Yes     | Yes   | Yes    | Yes  | Yes          |
| Truecolor           | Yes     | Yes   | Yes    | Yes  | Yes          |
| Semantic prompts    | Yes     | Yes   | Yes    | Yes  | Yes          |

The story of 2026 is convergence. Five years ago, protocol support was fragmented and unreliable. Today, the major protocols -- truecolor, synchronized output, hyperlinks, focus reporting, semantic prompts -- are supported everywhere. The remaining gaps are in input protocols (Terminal.app doesn't support Kitty keyboard) and graphics (no consensus protocol).

For the full per-feature, per-terminal breakdown with version-specific results, see [terminfo.dev](https://terminfo.dev). The data is generated from actual probe runs against real terminal builds, not documentation claims.
