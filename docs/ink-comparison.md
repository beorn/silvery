# inkx vs Ink: Comprehensive Comparison

A comprehensive comparison to help developers choose between inkx and Ink for terminal UI applications. Ink pioneered React-based terminal UIs and remains the most widely adopted framework in this space. inkx builds on that foundation, solving architectural limitations while introducing new capabilities for layout-aware, high-performance terminal applications.

_Last updated: February 2026 (based on analysis of Ink's last 100 PRs and issues)_

---

## Overview

**[Ink](https://github.com/vadimdemedes/ink)** (2017) brought React to the terminal, enabling developers to build rich CLI tools with a familiar component model. It has millions of weekly downloads, a large ecosystem of community components, and powers tools used across the JavaScript ecosystem.

**[inkx](https://github.com/niceBoys/inkx)** (2025) is a ground-up reimplementation that preserves Ink's React-based component model while introducing two-phase rendering — components know their dimensions during render, not after. This architectural change enables native scrolling, automatic text truncation, and dimension-aware hooks that are difficult to retrofit into Ink's existing design.

Both frameworks are valid choices. This document aims to help you understand the trade-offs.

---

## Ink's Strengths

Before diving into differences, it's worth acknowledging where Ink genuinely excels:

- **Ecosystem**: 50+ community components (ink-spinner, ink-select-input, ink-table, ink-text-input, etc.) ready to drop into any project. This is Ink's strongest advantage.
- **Battle-tested**: ~1.3M npm weekly downloads. Used in production by major CLI tools (Gatsby, Prisma, Terraform CDK, Shopify CLI, and many more).
- **Stability**: Mature API with low churn. Apps written years ago still work. Breaking changes are rare and well-communicated.
- **Community**: Large, active community. Questions get answered. Bugs get reported and triaged.
- **npm integration**: First-class integration with the npm ecosystem. Used by npm itself for interactive prompts.
- **Documentation**: Well-documented with clear examples and a straightforward getting-started experience.

For many projects — especially simple CLI tools, prompts, and scripts — Ink is the right choice. Its ecosystem alone can save days of development time.

---

## Where inkx Adds Value

### Layout Feedback (Ink's Architectural Limitation)

**Ink issue [#5](https://github.com/vadimdemedes/ink/issues/5)** (opened 2016, still open):

> "Is there a way to know the width/height of a Box?"

**Why Ink can't fix it**: Ink renders components _before_ Yoga calculates layout. By the time dimensions are known, React is done rendering.

**inkx solution**: Two-phase rendering. Layout calculates first, then components render with `useLayout()` providing actual dimensions.

```tsx
// Ink: 147 lines of width-threading code in real apps
function Card({ width }: { width: number }) {
  return <Text>{truncate(title, width)}</Text>
}

// inkx: Zero width props needed
function Card() {
  const { width } = useLayout()
  return <Text>{truncate(title, width)}</Text>
}
```

### Scrolling (Ink's #1 Feature Request)

**Ink issue [#765](https://github.com/vadimdemedes/ink/issues/765)** (reopened multiple times)
**Ink issue [#222](https://github.com/vadimdemedes/ink/issues/222)** (open since August 2019 - 5.5+ years!)

**Why Ink struggles**: Without layout feedback, scrolling requires manual height estimation and virtualization configuration.

**inkx solution**: `overflow="scroll"` with automatic measurement.

```tsx
// Ink: Complex virtualization setup
<ScrollableList
  items={items}
  height={availableHeight}
  estimateHeight={(item) => calculateHeight(item, width)}
  renderItem={(item) => <Card item={item} />}
/>

// inkx: Just render everything
<Box overflow="scroll" scrollTo={selectedIdx}>
  {items.map((item) => <Card key={item.id} item={item} />)}
</Box>
```

### Text Overflow

**Ink issues [#584](https://github.com/vadimdemedes/ink/issues/584), [#464](https://github.com/vadimdemedes/ink/issues/464)**

**Problem**: Text overflows containers, breaking layout.

**inkx solution**: Auto-truncates by default, preserving ANSI codes.

```tsx
// Ink: Text overflows, breaks layout
<Box width={10}>
  <Text>Very long text...</Text>
</Box>

// inkx: Auto-truncates to "Very lon…"
```

---

## Open Challenges (Both Frameworks)

### CJK/IME Input (CRITICAL)

**Ink issue [#759](https://github.com/vadimdemedes/ink/issues/759)** (8+ reactions - highest engagement)
**Active PRs**: #846, #851, #833

**Problem**: 200-500ms latency, character dropping, cursor misalignment when typing Chinese, Japanese, or Korean with IME.

**Root cause**: Terminal multiplexers (tmux, Zellij) misinterpret frame boundaries during IME composition.

**Solution being attempted**: Synchronized Update Mode (`CSI ? 2026h/l`) to frame updates atomically.

**inkx status**: Implemented. inkx wraps all TTY output with DEC 2026 sequences automatically. Disable with `INKX_SYNC_UPDATE=0`.

### Kitty Keyboard Protocol

**Ink issue [#824](https://github.com/vadimdemedes/ink/issues/824)**
**Ink PR [#852](https://github.com/vadimdemedes/ink/pull/852)** (actively reviewed)

**Problem**: Can't differentiate:

- `shift+enter` vs `enter`
- `ctrl+i` vs `tab`
- Other modifier combinations

**Solution**: Kitty keyboard protocol support with runtime detection and graceful fallback.

**inkx status**: Research planned.

### Cursor Support

**Ink issue [#251](https://github.com/vadimdemedes/ink/issues/251)** (open since December 2019 - 6+ years!)

**Problem**: No API for cursor management.

**Why Ink can't fix it**: Cursor positioning requires knowing component positions, which requires layout feedback.

**inkx opportunity**: `useLayout()` provides position information. A `useCursor()` hook is feasible.

### Multi-line Text Input

**Ink issue [#676](https://github.com/vadimdemedes/ink/issues/676)**

**Problem**: No multi-line input element for chat-like apps.

**Why it's hard in Ink**: Text wrapping and cursor positioning require layout awareness.

**inkx opportunity**: Layout-aware components could make a `<TextArea>` feasible.

---

## What Ink Gets Right

These recent Ink PRs highlight important capabilities that any terminal UI framework should support:

| PR   | Feature                            | Status    | inkx Status             |
| ---- | ---------------------------------- | --------- | ----------------------- |
| #823 | Screen reader accessibility        | Merged    | Basic                   |
| #829 | Home/End key support               | Merged    | Supported               |
| #836 | Incremental rendering optimization | Merged    | Per-node dirty tracking |
| #854 | Non-TTY environment fallback       | In review | renderStatic()          |

---

## Ink's Development Patterns

Analysis of Ink's PR merge patterns (useful context for contributors and evaluators):

### What Gets Merged Quickly

- Small, focused bug fixes
- Documentation improvements
- Community component additions to README

### What Takes Months

- Complex input handling (PR #782: 4+ months, 22 comments, still open)
- Architectural changes

### What Gets Rejected

- Experimental features without clear use case
- Broad architectural changes
- Features that only work in specific terminals

### Reviewer Expectations

- Proper Unicode handling (variation selectors, surrogate pairs)
- No CI pollution (no escape sequences in logs)
- Performance-conscious (batch writes)
- Single responsibility

---

## Compatibility Test Matrix

Based on Ink issues, inkx should test:

| Test Case                   | Ink Issue | Priority | inkx Status   |
| --------------------------- | --------- | -------- | ------------- |
| CJK character rendering     | #759      | P0       | ⚠️ Needs test |
| Double-width char alignment | #759      | P0       | ⚠️ Needs test |
| Emoji ZWJ sequences         | -         | P1       | ⚠️ Needs test |
| ANSI truncation             | #584      | P1       | ⚠️ Needs test |
| Rapid keystrokes            | PR #782   | P1       | ⚠️ Needs test |
| borderDimColor              | #840      | P2       | ⚠️ Needs test |
| Large component counts      | #694      | P2       | ⚠️ Needs test |
| Home/End keys               | PR #829   | P2       | ⚠️ Needs test |
| Process exit timing         | #796      | P1       | ⚠️ Needs test |
| tmux rendering              | PR #846   | P0       | ⚠️ Needs test |
| Zellij rendering            | PR #846   | P0       | ⚠️ Needs test |

---

## Strategic Recommendations

### Short Term (Testing Focus)

1. **CJK/IME testing** — This is Ink's #1 pain point. If inkx handles it well, that's a major differentiator.
2. **Terminal multiplexer testing** — tmux is ubiquitous. Zellij is growing.
3. **Emoji/Unicode edge cases** — Common source of rendering bugs.

### Medium Term (Feature Parity+)

4. **Kitty keyboard protocol** — Growing expectation in modern terminals.
5. **Document all limitations** — Users appreciate honesty about what doesn't work.

### Long Term (Differentiation)

6. **Cursor API** — Solve the 6-year-old issue Ink can't fix.
7. **TextArea component** — Enable chat-like applications.
8. **React 19 concurrent rendering** — Future-proof the reconciler.

---

## When to Use Ink vs inkx

### Decision Tree

```
Do you need scrolling or dimension queries?
├── YES → Use inkx
│         (Ink requires manual virtualization and width-threading)
│
└── NO → Is this a new project?
         ├── YES → Consider inkx
         │         (Better architecture, but newer and less battle-tested)
         │
         └── NO → Is your existing Ink app working well?
                  ├── YES → Stay with Ink
                  │         (Migration has cost, Ink is stable)
                  │
                  └── NO → What problems are you hitting?
                           ├── Text overflow → inkx (auto-truncation)
                           ├── Layout complexity → inkx (useLayout)
                           ├── CJK/IME input → Both improving
                           └── Other → Evaluate case-by-case
```

### Quick Reference

| If you need...                              | Use          |
| ------------------------------------------- | ------------ |
| Native scrolling (`overflow="scroll"`)      | inkx         |
| Component dimension queries (`useLayout()`) | inkx         |
| ANSI-aware text truncation                  | inkx         |
| Smaller bundle size                         | inkx + Flexx |
| Plugin composition (commands, keybindings)  | inkx         |
| Maximum ecosystem compatibility             | Ink          |
| Battle-tested stability                     | Ink          |
| Smallest risk for production                | Ink          |
| Large community and support                 | Ink          |

### Layout Engine Comparison

inkx supports two layout engines. Both use the same flexbox API:

| Engine              | Bundle (gzip) | Performance\* | Initialization |
| ------------------- | ------------- | ------------- | -------------- |
| **Yoga** (WASM)     | 38 KB         | 54 µs         | Async          |
| **Flexx** (pure JS) | 7 KB          | 57 µs         | Sync           |

\*Kanban 3×50 benchmark (~150 nodes), Apple M1 Max

**Flexx is 5x smaller with comparable performance.** Trade-off: no RTL or baseline alignment.

For terminal UIs, both are fast enough for 60fps. Choose based on bundle size and feature needs. See [Flexx vs Yoga comparison](../../beorn-flexx/docs/yoga-comparison.md) for details.

### Maturity Considerations

**Ink**: Production-ready, battle-tested, maintenance mode

- Millions of users via CLI tools across the JS ecosystem
- 100+ open issues (some architectural, unfixable)
- Stable API, low churn

**inkx**: Functionally complete, seeking real-world feedback

- Used in production by the authors
- Comprehensive test suite
- Not yet battle-tested across diverse environments
- API may evolve based on feedback

### Migration Path

If you're on Ink and considering inkx:

1. **Evaluate if you need inkx features** — If Ink works for you, stay
2. **Try inkx in a new feature** — Lower risk than full migration
3. **Report issues** — Help us find edge cases
4. **Consider @beorn/ink-measure** — Add dimension awareness to Ink incrementally

---

## Performance Benchmarks

Measured on Apple M1 Max, Bun 1.3.9. Run: `bun run bench:compare` from the km root.

inkx builds on [Ink](https://github.com/vadimdemedes/ink)'s pioneering work in React-based terminal UIs. These benchmarks help users understand performance differences between the two approaches.

### Full Pipeline: inkx vs Ink 6

Time to render Box+Text component trees through the full pipeline (reconciliation + layout + output).

| Components | inkx (Flexx) | Ink 6 (Yoga NAPI) | Ratio     |
| ---------- | ------------ | ----------------- | --------- |
| 1          | 165 µs       | 271 µs            | inkx 1.6x |
| 100        | 45.0 ms      | 49.4 ms           | inkx 1.1x |
| 1000       | 463 ms       | 541 ms            | inkx 1.2x |

inkx uses `createRenderer()` (headless, no stdout writing). Ink uses `render()` with mock stdout + unmount per iteration, which includes additional lifecycle overhead (signal handlers, stdin setup). Both include React reconciliation.

### Pipeline Render (Low-Level)

`executeRender` bypassing React reconciliation. Shows raw pipeline throughput.

| Nodes | First Render | Diff Render | Diff Speedup |
| ----- | ------------ | ----------- | ------------ |
| 1     | 311 µs       | 38 µs       | 8.2x         |
| 100   | 23 ms        | 46 µs       | 500x         |
| 1000  | 236 ms       | 169 µs      | 1396x        |

The diff path is dramatically faster because inkx tracks dirty nodes per-component and uses packed-integer buffer comparison. After the first render, updates are near-instant for typical UIs where <10% of cells change.

### Update Performance

| Scenario                     | Time    |
| ---------------------------- | ------- |
| Ink 6 rerender 100 Box+Text  | 2.3 ms  |
| Ink 6 rerender 1000 Box+Text | 20.7 ms |
| inkx diff render 100 nodes   | 46 µs   |
| inkx diff render 1000 nodes  | 169 µs  |

These measure fundamentally different operations. Ink's `rerender()` triggers full React reconciliation of the component tree. inkx's diff render is a low-level pipeline operation that bypasses React entirely, using per-node dirty tracking and packed-integer buffer comparison. The architectural difference is significant for interactive TUIs where most updates change only a few nodes.

### React Re-render (Apples-to-Apples)

The update comparison above is intentionally asymmetric — it highlights inkx's diff-only fast path. For a **fair apples-to-apples comparison**, both frameworks trigger full React reconciliation via `app.rerender()`:

| Scenario        | inkx (rerender) | Ink 6 (rerender) | Ratio     |
| --------------- | --------------- | ---------------- | --------- |
| 100 components  | 64.3 ms         | 2.3 ms           | Ink 28x   |
| 1000 components | 630 ms          | 20.7 ms          | Ink 30x   |

**Why Ink is faster here:** Both do identical React reconciliation, but inkx must additionally run its 5-phase rendering pipeline (measure → layout → content → output) after every reconciliation. This is the cost of layout feedback — `useContentRect()` and auto-truncation require a full layout pass. Ink writes directly to a string buffer without a separate layout-aware content phase.

**In practice**, interactive TUIs rarely trigger full-tree re-renders. inkx's typical update path uses the diff render (46-169 µs) which only processes dirty nodes. The `rerender()` path is primarily used for wholesale tree replacement, not typical interactions like cursor movement or scroll.

### Startup Time

The full pipeline benchmarks above already measure cold start: each iteration creates a fresh renderer and renders from scratch. For a 1-component app, inkx starts in ~165 µs vs Ink's ~271 µs (1.6x faster). inkx with Flexx avoids WASM initialization overhead, giving it a faster cold start than Yoga-based setups.

### Diff Performance (Buffer Comparison)

The output phase computes terminal escape sequences by diffing two buffers.

| Scenario         | Time   |
| ---------------- | ------ |
| 80x24 no changes | 28 µs  |
| 80x24 10% change | 34 µs  |
| 80x24 full paint | 59 µs  |
| 200x50 no change | 146 µs |

inkx uses cell-level comparison with a packed Uint32Array fast-path, giving consistent sub-millisecond diffs even for large terminals. Ink uses row-based string comparison.

### Resize Handling

Time to re-layout after terminal size change (80x24 -> 120x40).

| Nodes | Flexx  |
| ----- | ------ |
| 10    | 250 ns |
| 100   | 2 µs   |
| 1000  | 21 µs  |

Resize only involves the layout phase (no reconciliation or content rendering).

### Layout Engine Comparison

Pure layout computation, no React or rendering.

| Benchmark             | Flexx (JS) | Yoga WASM | Yoga NAPI (C++) |
| --------------------- | ---------- | --------- | --------------- |
| 100 nodes flat list   | 85 µs      | 88 µs     | 197 µs          |
| 50-node kanban (3col) | 57 µs      | 54 µs     | 136 µs          |

Flexx (pure JS, 7 KB) and Yoga WASM perform similarly. Both are ~2x faster than Yoga NAPI (native C++) due to NAPI bridge overhead. Ink 6 uses Yoga NAPI.

### Bundle Size

| Package      | Size (gzip) | Notes                 |
| ------------ | ----------- | --------------------- |
| inkx + Flexx | ~45 KB      | Pure JS layout engine |
| inkx + Yoga  | ~76 KB      | WASM layout engine    |
| ink          | ~52 KB      | Yoga NAPI only        |

### Feature Comparison Summary

#### Architecture & Rendering

| Feature                 | inkx                         | Ink                                                               |
| ----------------------- | ---------------------------- | ----------------------------------------------------------------- |
| React version           | 19                           | 18                                                                |
| Layout awareness        | useContentRect/useScreenRect | None (thread props manually)                                      |
| Scrollable containers   | overflow="scroll"            | Third-party or manual                                             |
| Text truncation         | Auto (ANSI-aware)            | Manual per-component                                              |
| Layout engines          | Flexx (7KB) or Yoga WASM     | Yoga NAPI only                                                    |
| Incremental rendering   | Dirty tracking per-node      | Full re-render                                                    |
| Multiple render targets | Terminal, Canvas, DOM        | Terminal only                                                     |
| Concurrent React        | Not yet                      | [PR #850](https://github.com/vadimdemedes/ink/pull/850) exploring |
| Static rendering        | renderStatic()               | Static component                                                  |
| Non-TTY fallback        | renderStatic()               | [PR #854](https://github.com/vadimdemedes/ink/pull/854)           |

#### Input & Interaction

| Feature              | inkx                          | Ink                                                                     |
| -------------------- | ----------------------------- | ----------------------------------------------------------------------- |
| Input handling       | InputLayerProvider + useInput | useInput only                                                           |
| Mouse support        | HitRegistry with z-index      | Basic useInput                                                          |
| Unicode/CJK handling | Built-in grapheme/width utils | Third-party string-width                                                |
| Console capture      | Built-in Console component    | patchConsole                                                            |
| Exit handling        | useExit + `using` cleanup     | process.exit handling                                                   |
| Accessibility        | Basic                         | [PR #823](https://github.com/vadimdemedes/ink/pull/823) (screen reader) |

#### Developer Experience

| Feature              | inkx                          | Ink                      |
| -------------------- | ----------------------------- | ------------------------ |
| TypeScript           | Native TS, strict mode        | TS support               |
| Plugin system        | withCommands/Keybindings/Diag | None                     |
| Testing API          | createRenderer + locators     | ink-testing-library      |
| Documentation        | Comprehensive docs            | Well-documented          |
| Community plugins    | Small / growing               | 50+ community components |
| npm weekly downloads | New                           | ~1.3M                    |
| Maintenance status   | Active development            | Maintenance mode         |

#### Performance (1000 components)

| Metric             | inkx                          | Ink                     |
| ------------------ | ----------------------------- | ----------------------- |
| Full render        | 463 ms                        | 541 ms                  |
| Re-render          | 630 ms                        | 20.7 ms                 |
| Diff render (inkx) | 169 µs (dirty tracking)       | N/A                     |

_Note: Re-render triggers full React reconciliation in both. inkx is slower due to its 5-phase pipeline (the cost of layout feedback). In practice, inkx uses the diff render path for typical interactions. See [React Re-render](#react-re-render-apples-to-apples) for details._

---

## Conclusion

Both Ink and inkx are legitimate choices for React-based terminal UIs. They share the same fundamental model — React components rendered to the terminal — but differ in architecture, maturity, and focus.

**Choose Ink when:**

- You need a large ecosystem of ready-made components
- You want battle-tested stability with minimal risk
- Your app is a simple CLI tool, prompt, or script
- You prefer a mature, well-understood framework with a large community

**Choose inkx when:**

- You need layout-aware components (dimension queries, native scrolling)
- You're building a complex interactive TUI (dashboard, editor, multi-pane app)
- Performance matters — frequent updates, large component trees
- You want a modern architecture with plugin composition and multiple render targets

Ink pioneered React for the terminal and remains the most widely adopted framework in this space. inkx builds on that foundation with architectural changes that enable capabilities (scrolling, layout feedback, auto-truncation) which are difficult to retrofit into Ink's existing design. Both projects contribute to making terminal UIs more accessible to React developers.

---

## References

### Ink Issues Analyzed

- [#5 - Box dimensions](https://github.com/vadimdemedes/ink/issues/5) (2016)
- [#222 - Scrolling](https://github.com/vadimdemedes/ink/issues/222) (2019)
- [#251 - Cursor support](https://github.com/vadimdemedes/ink/issues/251) (2019)
- [#584 - Text overflow](https://github.com/vadimdemedes/ink/issues/584)
- [#676 - Multi-line input](https://github.com/vadimdemedes/ink/issues/676)
- [#694 - Large component performance](https://github.com/vadimdemedes/ink/issues/694)
- [#701 - Memory leaks](https://github.com/vadimdemedes/ink/issues/701)
- [#759 - CJK IME](https://github.com/vadimdemedes/ink/issues/759)
- [#765 - Scrolling primitives](https://github.com/vadimdemedes/ink/issues/765)
- [#796 - Exit timing](https://github.com/vadimdemedes/ink/issues/796)
- [#808 - Fullscreen rendering](https://github.com/vadimdemedes/ink/issues/808)
- [#824 - Kitty protocol](https://github.com/vadimdemedes/ink/issues/824)
- [#840 - borderDimColor](https://github.com/vadimdemedes/ink/issues/840)

### Ink PRs Analyzed

- [#782 - Rapid input](https://github.com/vadimdemedes/ink/pull/782)
- [#823 - Screen reader](https://github.com/vadimdemedes/ink/pull/823)
- [#829 - Home/End keys](https://github.com/vadimdemedes/ink/pull/829)
- [#836 - Incremental rendering](https://github.com/vadimdemedes/ink/pull/836)
- [#846 - Synchronized Update Mode](https://github.com/vadimdemedes/ink/pull/846)
- [#850 - Concurrent rendering](https://github.com/vadimdemedes/ink/pull/850)
- [#852 - Kitty keyboard](https://github.com/vadimdemedes/ink/pull/852)
- [#854 - Non-TTY fallback](https://github.com/vadimdemedes/ink/pull/854)
