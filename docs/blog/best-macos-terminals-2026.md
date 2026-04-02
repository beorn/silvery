---
title: "The Best macOS Terminal Emulators in 2026"
description: "Data-driven comparison of Ghostty, Kitty, WezTerm, iTerm2, and Terminal.app — feature support, protocol coverage, and daily-driver impressions."
date: 2026-04-02
---

# The Best macOS Terminal Emulators in 2026

I maintain [terminfo.dev](https://terminfo.dev), a database that probes terminals for escape sequence support. Instead of relying on documentation claims, it runs actual tests against each terminal and records what passes. This article uses that data to compare the five macOS terminals I've used seriously: Ghostty, Kitty, iTerm2, WezTerm, and Terminal.app.

I'm not going to rank these as #1 through #5. They make different tradeoffs, and which one fits best depends on what you care about.

## Feature Support Scores

terminfo.dev runs 164 probes covering SGR text styling, cursor handling, editing operations, modes, extensions, input protocols, Unicode, and device status reporting. Here's how each terminal scores on macOS:

| Terminal     | Score           | Version Tested     |
| ------------ | --------------- | ------------------ |
| iTerm2       | 94.5% (155/164) | 3.6.9              |
| Ghostty      | 93.3% (153/164) | 1.3.1              |
| Kitty        | 93.3% (153/164) | 0.46.2             |
| Warp         | 89.6% (147/164) | 2026.03            |
| Terminal.app | 86.0% (141/164) | 2.15 (macOS Tahoe) |

A few things about these numbers. iTerm2 being at the top surprised me -- I expected Ghostty or Kitty to lead. iTerm2's strength is breadth: it supports almost everything, including some iTerm2-specific extensions that were designed for it. Ghostty and Kitty tie, and their failure lists are nearly identical: both miss sixel graphics, OSC 52 clipboard reading, and a few obscure device query features.

Terminal.app at 86% is more capable than many developers assume. Apple has been quietly adding modern terminal features -- it now supports truecolor, synchronized output, focus tracking, OSC 8 hyperlinks, semantic prompts, and sixel graphics. Its main gaps are the Kitty keyboard protocol and some of the Kitty-originated extensions.

## Protocol Coverage

The interesting comparison isn't the aggregate score -- it's which protocols each terminal supports. These are the features that actually affect whether your TUI application works correctly.

**Kitty keyboard protocol.** The biggest improvement to terminal input in decades. Traditional terminals can't distinguish Ctrl+I from Tab, or Ctrl+M from Enter. The Kitty protocol fixes this with unambiguous key reporting, modifier detection, and key release events.

Supported by: Ghostty, Kitty, iTerm2, Warp. Not supported by Terminal.app.

**Truecolor (24-bit RGB).** Full-spectrum color instead of the 256-color palette.

Supported by all five terminals.

**Synchronized output (DEC mode 2026).** The application tells the terminal "I'm about to send a batch of updates" and the terminal waits to display them all at once. This prevents partial-frame rendering that can look like flickering.

Supported by all five terminals.

**OSC 52 clipboard.** Lets applications read from and write to the system clipboard. Particularly useful over SSH, where the application runs on a remote machine but needs to access the local clipboard.

All five support clipboard writing. OSC 52 reading is more restricted -- only iTerm2 enables it by default, and for good reason: allowing any application to silently read your clipboard is a security concern.

**OSC 8 hyperlinks.** Clickable links in terminal output, just like HTML anchor tags.

Supported by all five terminals.

**Graphics protocols.** Inline image display in the terminal. There are three competing approaches:

- **Kitty graphics protocol**: Supported by Ghostty, Kitty, Warp, and Terminal.app. Not supported by iTerm2.
- **Sixel**: Supported by Terminal.app. Not supported by Ghostty, Kitty, or Warp.
- **iTerm2 image protocol (OSC 1337)**: Supported by iTerm2 and some other terminals that added compatibility.

Terminal.app is the only macOS terminal that supports sixel, which is a legacy protocol from the DEC VT340 era. Ghostty and Kitty both support the Kitty graphics protocol, which is more capable (animation, Unicode placeholders) but less widely adopted.

**Focus reporting.** The application can detect when the terminal window gains or loses focus.

Supported by all five terminals.

**Semantic prompts (OSC 133).** Marks the boundaries between shell prompts, commands, and output. Enables features like Cmd+Up/Down to jump between commands.

Supported by all five terminals.

## GPU Rendering

Ghostty, Kitty, WezTerm, and Warp all use GPU-accelerated rendering. Alacritty pioneered this approach in 2017, and it's become the standard for new terminals. The practical effect: smoother scrolling, lower latency, and better handling of high-DPI displays.

iTerm2 uses CPU rendering (Core Text on macOS). For most workflows this is fine -- the difference is mainly visible when scrolling through thousands of lines of output rapidly.

Terminal.app also uses CPU rendering, though Apple has optimized it well for macOS.

## Font Rendering

This is subjective, but it matters for something you stare at all day.

Ghostty has the best font rendering I've seen in a terminal. It uses platform-native text shaping (Core Text on macOS) and gets ligatures, emoji, and font fallback right consistently. Kitty also handles fonts well, with built-in support for font features and ligatures.

iTerm2's font rendering is good but occasionally shows small differences from native macOS apps in letter spacing. WezTerm's rendering is solid, though I've noticed occasional inconsistencies with certain font weights.

Terminal.app, being an Apple app, uses native Core Text rendering. It looks exactly like every other macOS text view.

## Configuration

**Ghostty** uses a TOML-like config file (`~/.config/ghostty/config`). Simple key-value pairs, well documented. No scripting. This is a deliberate choice -- configuration is static and predictable.

**Kitty** uses its own config format (`~/.config/kitty/kitty.conf`). Extensive, well-documented, with support for including other files and environment variable expansion. Kittens (Python plugins) add programmable extensions.

**WezTerm** uses Lua for configuration. This is its most distinctive feature -- your config is a full program. Dynamic keybindings, conditional themes based on hostname, complex layout rules. Powerful but also means your config can have bugs.

**iTerm2** is configured through its GUI preferences (though it can import/export JSON profiles). This is a love-it-or-hate-it choice. The GUI makes discovery easy but version control harder.

**Terminal.app** uses macOS Preferences/Profiles. The simplest approach, but the least configurable.

## Daily-Driver Impressions

I use Ghostty as my primary terminal. It starts faster than any other option (~50ms to first frame), handles large output without lag, and its standards compliance means TUI applications just work. The lack of built-in tabs bothered me initially, but I use a tiling window manager (AeroSpace) so I rarely need them.

Kitty would be my second choice. It's the terminal that pioneered most of the modern protocols -- the Kitty keyboard protocol, the Kitty graphics protocol, extended underline styles. Its kitten system (the diff viewer, the SSH integration) adds genuine utility. If I weren't already invested in Ghostty's workflow, I'd be using Kitty.

iTerm2 is still the most feature-complete terminal on macOS, full stop. Split panes, tmux integration, Instant Replay, triggers, password manager, shell integration -- it has features no other terminal has attempted. If you want everything in one application and don't care about GPU rendering, iTerm2 is hard to beat.

WezTerm occupies an interesting niche. The Lua configuration is genuinely powerful -- I've seen people build complex multi-session setups that would be impossible with static config files. The built-in multiplexer with SSH domain support means you can drop tmux entirely. The downside is that development has slowed; Wez Furlong has been less active, and some community members have noticed longer intervals between releases.

Terminal.app is fine. I mean that sincerely. If you're a developer who uses the terminal for git commands, running tests, and SSH, Terminal.app does all of that. It supports truecolor, mouse tracking, hyperlinks, and semantic prompts. It won't run the latest TUI application that requires the Kitty keyboard protocol, but for typical command-line work, it's adequate. The fact that it requires no installation and no configuration is a genuine advantage.

## What I'd Recommend

If you're building TUI applications and need reliable protocol support: **Ghostty or Kitty**. Both score above 93% on terminfo.dev and support the protocols that matter most for modern TUI development.

If you want the most features in a single application and don't mind a heavier app: **iTerm2**. Its 94.5% probe score and decades of macOS-specific features make it the Swiss Army knife.

If you want programmable configuration: **WezTerm**. Nothing else lets you express complex conditional behavior in your terminal config.

If you want something that works without thinking about it: **Terminal.app**. At 86%, it handles most of what you'll throw at it.

The full probe results for all terminals -- including per-feature breakdowns, version history, and support tables -- are available at [terminfo.dev](https://terminfo.dev).
