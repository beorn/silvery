# Terminal Support Strategy

_The cross-terminal problem stops here. Everything above this layer sees one terminal._

## The Problem

Terminals disagree on character widths, escape sequence interpretation, style rendering, and dozens of other behaviors. Today, these disagreements leak upward: the output phase has CUP re-sync hacks, text sizing wraps wide chars in OSC 66, and flag emoji garble only manifests at 200+ columns on specific terminals. Each bug is fixed ad-hoc in whatever layer notices it first.

**Goal**: A layered architecture where cross-terminal issues are resolved at the lowest possible layer. Application code (components, state machines, even the rendering pipeline) never deals with terminal differences.

## Architecture

```
Layer 4: Application (km, silvery components, pipeline)
         ← never sees terminal differences
─────────────────────────────────────────────────────
Layer 3: STRICT Invariants (detect & crash)
         ← catches anything layers 1-2 missed
─────────────────────────────────────────────────────
Layer 2: Cross-Terminal Compat (@silvery/term)
         ← workarounds for known terminal bugs/quirks
─────────────────────────────────────────────────────
Layer 1: Upstream Fixes + Capability Database
         ← fix the root cause, build the evidence
─────────────────────────────────────────────────────
Layer 0: Terminal Emulators (Ghostty, Kitty, ...)
```

### Layer 0: Terminal Emulators

The terminals themselves. We don't control them, but we influence them via bug reports, patches, and standards advocacy.

### Layer 1: Upstream Fixes + Capability Database

**Fix bugs at the source.** When a terminal renders something wrong (e.g., flag emoji at width != 2), file upstream bugs with evidence from our matrix testing. This is the permanent fix.

**Build a capability database.** Termless backends give us empirical data on how each terminal interprets every escape sequence, renders every character category, and handles every edge case. This database:

- Powers our workaround decisions in Layer 2
- Provides evidence for upstream bug reports
- Enables a "caniuse for terminals" reference
- Is versioned per terminal + version (behaviors change across releases)

**What the database tracks** (per terminal + version):

| Category            | Examples                                                       |
| ------------------- | -------------------------------------------------------------- |
| Character widths    | Flag emoji, CJK, PUA, text-presentation emoji, fullwidth Latin |
| SGR interpretation  | Bold=bright, dim support, underline styles, blink, hidden      |
| Color handling      | Truecolor, 256-color palette, color downgrading                |
| Escape sequences    | OSC 66, OSC 8 hyperlinks, OSC 52 clipboard, DEC 2026 sync      |
| Cursor behavior     | CUP accuracy, cursor shape, save/restore                       |
| Wide char rendering | Continuation cell handling, reflow on resize                   |

**How we build it**: Run a matrix of test sequences through each termless backend and record the results. Each backend wraps a real terminal's parser/renderer (Ghostty WASM, Alacritty via napi-rs, xterm.js headless, etc.), so the results reflect actual terminal behavior.

```typescript
// Conceptual: test a character category across backends
for (const backend of [xtermjs, ghostty, alacritty, wezterm, vt100]) {
  const term = createTerminal({ backend, cols: 80, rows: 5 })
  term.feed(ansi) // render our test sequence
  results[backend.name] = {
    charWidth: term.getCell(0, 1)?.text === "" ? 2 : 1, // wide or not?
    cursorCol: term.getCursor().col, // where did cursor end up?
    // ... more properties
  }
}
```

### Layer 2: Cross-Terminal Compat (@silvery/term)

**Workarounds for known issues, driven by the Layer 1 database.**

This is where OSC 66 text sizing, CUP cursor re-sync, and future workarounds live. The key principle: **workarounds are data-driven, not ad-hoc.** We don't add a hack every time we find a bug. Instead:

1. The capability database tells us which terminals have which issues
2. Terminal detection tells us which terminal we're running on (when possible)
3. The compat layer applies the minimal workaround needed

**Current workarounds:**

| Issue                         | Workaround                            | Terminals affected        |
| ----------------------------- | ------------------------------------- | ------------------------- |
| Character width disagreement  | OSC 66 text sizing (declare width)    | All (preemptive)          |
| Cursor drift after wide chars | CUP re-sync after every wide char     | All (belt-and-suspenders) |
| PUA characters at wrong width | OSC 66 wrapping for `cell.wide` chars | All (preemptive)          |

**Architecture within @silvery/term:**

```
detectTerminalCaps()     → what can this terminal do?
capabilityDatabase       → what bugs does this terminal have?  (NEW)
createOutputPhase(caps)  → apply workarounds during ANSI generation
createMeasurer(caps)     → adjust width calculations
```

The compat layer is **transparent to the pipeline.** The content phase writes to a `TerminalBuffer` using `graphemeWidth()`. The output phase generates ANSI with workarounds applied. The pipeline never knows that terminals disagree.

**When can we remove a workaround?** When:

1. The upstream fix is released
2. The minimum supported version of that terminal includes the fix
3. Our matrix tests confirm the fix across backends

### Layer 3: STRICT Invariants

**Detect anything layers 1-2 missed. Crash loudly.**

STRICT mode is the safety net. If our workarounds are incomplete, or if a new terminal version introduces a regression, STRICT catches it before users see garbled output.

#### Existing STRICT levels

| Flag                    | What it checks                                     | Cost                  |
| ----------------------- | -------------------------------------------------- | --------------------- |
| `SILVERY_STRICT`        | Incremental buffer == fresh buffer (content phase) | ~2x render time       |
| `SILVERY_STRICT_OUTPUT` | Incremental ANSI == fresh ANSI (output phase)      | ~2x + xterm.js replay |

#### Proposed: `SILVERY_STRICT_TERMINAL`

**Full buffer-vs-backend comparison.** Feed our ANSI output through each termless backend and compare the resulting terminal state against our `TerminalBuffer`, cell by cell.

What it catches that STRICT/STRICT_OUTPUT can't:

| Issue                                | STRICT | STRICT_OUTPUT | STRICT_TERMINAL |
| ------------------------------------ | ------ | ------------- | --------------- |
| Incremental != fresh (content)       | Yes    | -             | -               |
| Incremental != fresh (output)        | -      | Yes           | -               |
| Width disagreement (flag emoji, PUA) | -      | -             | **Yes**         |
| SGR interpretation bugs              | -      | -             | **Yes**         |
| Style reset scope issues             | -      | -             | **Yes**         |
| Background bleed                     | -      | -             | **Yes**         |
| Hyperlink parsing differences        | -      | -             | **Yes**         |

**Cell comparison covers:**

- `text` (character content)
- `wide` (width-2 flag)
- `fg`, `bg` (foreground/background colors)
- `bold`, `italic`, `underline`, `strikethrough`, `dim`, `inverse` (style attributes)

**Implementation sketch:**

```typescript
function strictTerminalCheck(ansi: string, buffer: TerminalBuffer) {
  for (const backend of enabledBackends) {
    const term = createTerminal({ backend, cols: buffer.width, rows: buffer.height })
    term.feed(ansi)

    for (let y = 0; y < buffer.height; y++) {
      for (let x = 0; x < buffer.width; x++) {
        const ours = buffer.getCell(x, y)
        const theirs = term.getCell(y, x)
        if (!cellsMatch(ours, theirs)) {
          throw new TerminalDivergenceError({
            backend: backend.name,
            position: { x, y },
            expected: ours,
            actual: theirs,
            ansiContext: extractSurroundingAnsi(ansi, y),
          })
        }
      }
    }
    term.close()
  }
}
```

**Cost considerations:**

- xterm.js backend: ~1ms per frame (cheap enough for always-on in tests)
- Ghostty WASM: ~5ms (enable in CI, not dev)
- Native backends (Alacritty, WezTerm): ~10ms (CI-only)
- **Recommendation**: xterm.js always-on in tests, all backends in CI matrix

**Key insight**: STRICT*TERMINAL doesn't need to agree with our buffer on which answer is "right" -- it needs to detect \_disagreement*. When backends disagree with each other or with our buffer, that's a signal that our workarounds are incomplete. The error message says "Ghostty renders this cell differently" -- we investigate and either fix our output or file an upstream bug.

### Layer 4: Application

**Never sees terminal differences.** Components use `graphemeWidth()` for measurement, `TerminalBuffer` for rendering, and semantic styles for colors. The pipeline renders to a buffer. The output phase handles the rest.

If application code ever needs a terminal-specific branch, that's a design failure -- the fix belongs in Layer 2.

## Character Width: The Primary Use Case

Character width is the poster child for this architecture. Here's how each layer handles it:

**Layer 0 (terminals):** Each terminal has its own wcwidth/grapheme-width implementation. They disagree on flag emoji, some PUA characters, text-presentation emoji, and occasionally even CJK.

**Layer 1 (database):** Our termless matrix test measures the actual width of every character category across every backend. The database records: "Ghostty renders 🇨🇦 as width 2, xterm.js renders 🇨🇦 as width 2, Alacritty renders 🇨🇦 as width 2" -- or flags disagreements.

**Layer 2 (compat):**

- `graphemeWidth()` returns our canonical width (2 for all wide chars)
- The output phase wraps wide chars in OSC 66 (`ESC]66;w=2;🇨🇦\x07`) to tell terminals the correct width
- CUP re-sync after every wide char repositions the cursor in case a terminal ignores OSC 66
- Both measures are unconditional -- no per-category detection, no whack-a-mole

**Layer 3 (STRICT):** `SILVERY_STRICT_TERMINAL` feeds our ANSI through Ghostty WASM and checks that the flag emoji occupies exactly 2 cells. If Ghostty renders it at width 1 or 3, the test crashes with a clear error.

**Layer 4 (app):** A component renders `🇨🇦` in a card title. It calls `graphemeWidth("🇨🇦")` which returns 2. It allocates 2 cells in the buffer. Done. It never knows that Ghostty and xterm.js might disagree.

## What Isn't a Bug: Design Decisions

Some cross-terminal differences aren't bugs -- they're design decisions that need thoughtful architectural responses, not workarounds:

| Issue                                   | Why it's not a bug                                               | Architectural response                              |
| --------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| Character width ambiguity (Unicode EAW) | Unicode spec allows implementation freedom for "Ambiguous" width | Canonical width database + OSC 66 declaration       |
| Color palette differences               | Terminals define their own 256-color palettes                    | Use truecolor when available, semantic theme tokens |
| Font rendering differences              | Different fonts, different glyph coverage                        | Don't rely on sub-character positioning             |
| Line drawing char coverage              | Some fonts lack box-drawing chars                                | Graceful degradation in border rendering            |

For these, the fix isn't "file a bug" -- it's "design a system that works regardless."

## Implementation Roadmap

### Phase 1: Character Width Matrix (immediate)

- [x] OSC 66 wrapping for all wide chars (unconditional)
- [x] CUP cursor re-sync after wide chars
- [x] Matrix test: 8 wide char categories x 4 test dimensions (43 tests)
- [ ] Extend matrix to cover all termless backends (not just xterm.js)
- [ ] Record empirical widths per backend into a database fixture

### Phase 2: STRICT_TERMINAL (next)

- [ ] Implement `SILVERY_STRICT_TERMINAL` with xterm.js backend
- [ ] Cell-by-cell comparison: text, wide, fg, bg, bold, italic, underline, strikethrough
- [ ] Enable in vitest/setup.ts (always-on for tests)
- [ ] Clear error messages with backend name, position, expected vs actual

### Phase 3: Multi-Backend Matrix (CI)

- [ ] Run STRICT_TERMINAL against all available termless backends in CI
- [ ] Build capability database from empirical results
- [ ] Auto-generate compatibility report (caniuse-style)
- [ ] Identify upstream bugs with evidence

### Phase 4: Upstream Engagement

- [ ] File bugs with terminal projects (Ghostty, Kitty, WezTerm, etc.)
- [ ] Include our matrix test evidence
- [ ] Track fix status per terminal + version
- [ ] Remove workarounds as fixes land

## References

- [Text Sizing Protocol (OSC 66)](../reference/text-sizing.md) -- current implementation
- [Terminal Compatibility Matrix](../reference/terminal-matrix.md) -- capability detection
- [Terminal Capabilities Reference](../reference/terminal-capabilities.md) -- per-terminal details
- [Pipeline Internals](../../packages/term/src/pipeline/CLAUDE.md) -- STRICT mode, flag emoji lesson
- [output-phase-wide-char-matrix.test.ts](../../tests/output-phase-wide-char-matrix.test.ts) -- matrix test
