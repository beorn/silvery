# Inkx vs Ink: Detailed Comparison

This document analyzes Ink's real-world issues and PRs to understand where Inkx can provide value.

_Last updated: January 2026 (based on analysis of ink's last 100 PRs and issues)_

---

## Executive Summary

Ink is in maintenance mode with a stable but limited architecture. Many long-standing issues (some 5-6 years old) remain open because they require architectural changes Ink won't make. Inkx solves several of these by design.

---

## Problems Inkx Already Solves

### 1. Layout Feedback (Ink's Architectural Limitation)

**Ink issue [#5](https://github.com/vadimdemedes/ink/issues/5)** (opened 2016, still open):

> "Is there a way to know the width/height of a Box?"

**Why Ink can't fix it**: Ink renders components _before_ Yoga calculates layout. By the time dimensions are known, React is done rendering.

**Inkx solution**: Two-phase rendering. Layout calculates first, then components render with `useLayout()` providing actual dimensions.

```tsx
// Ink: 147 lines of width-threading code in real apps
function Card({ width }: { width: number }) {
  return <Text>{truncate(title, width)}</Text>
}

// Inkx: Zero width props needed
function Card() {
  const { width } = useLayout()
  return <Text>{truncate(title, width)}</Text>
}
```

### 2. Scrolling (Ink's #1 Feature Request)

**Ink issue [#765](https://github.com/vadimdemedes/ink/issues/765)** (reopened multiple times)
**Ink issue [#222](https://github.com/vadimdemedes/ink/issues/222)** (open since August 2019 - 5.5+ years!)

**Why Ink struggles**: Without layout feedback, scrolling requires manual height estimation and virtualization configuration.

**Inkx solution**: `overflow="scroll"` with automatic measurement.

```tsx
// Ink: Complex virtualization setup
<ScrollableList
  items={items}
  height={availableHeight}
  estimateHeight={(item) => calculateHeight(item, width)}
  renderItem={(item) => <Card item={item} />}
/>

// Inkx: Just render everything
<Box overflow="scroll" scrollTo={selectedIdx}>
  {items.map((item) => <Card key={item.id} item={item} />)}
</Box>
```

### 3. Text Overflow

**Ink issues [#584](https://github.com/vadimdemedes/ink/issues/584), [#464](https://github.com/vadimdemedes/ink/issues/464)**

**Problem**: Text overflows containers, breaking layout.

**Inkx solution**: Auto-truncates by default, preserving ANSI codes.

```tsx
// Ink: Text overflows, breaks layout
<Box width={10}>
  <Text>Very long text...</Text>
</Box>

// Inkx: Auto-truncates to "Very lon…"
```

---

## Ink's Current Pain Points (Opportunity Areas)

### CJK/IME Input (CRITICAL)

**Ink issue [#759](https://github.com/vadimdemedes/ink/issues/759)** (8+ reactions - highest engagement)
**Active PRs**: #846, #851, #833

**Problem**: 200-500ms latency, character dropping, cursor misalignment when typing Chinese, Japanese, or Korean with IME.

**Root cause**: Terminal multiplexers (tmux, Zellij) misinterpret frame boundaries during IME composition.

**Solution being attempted**: Synchronized Update Mode (`CSI ? 2026h/l`) to frame updates atomically.

**Inkx status**: ⚠️ Needs investigation and testing.

### Kitty Keyboard Protocol

**Ink issue [#824](https://github.com/vadimdemedes/ink/issues/824)**
**Ink PR [#852](https://github.com/vadimdemedes/ink/pull/852)** (actively reviewed)

**Problem**: Can't differentiate:

- `shift+enter` vs `enter`
- `ctrl+i` vs `tab`
- Other modifier combinations

**Solution**: Kitty keyboard protocol support with runtime detection and graceful fallback.

**Inkx status**: 🔜 Research planned.

### Cursor Support

**Ink issue [#251](https://github.com/vadimdemedes/ink/issues/251)** (open since December 2019 - 6+ years!)

**Problem**: No API for cursor management.

**Why Ink can't fix it**: Cursor positioning requires knowing component positions, which requires layout feedback.

**Inkx opportunity**: `useLayout()` provides position information. A `useCursor()` hook is feasible.

### Multi-line Text Input

**Ink issue [#676](https://github.com/vadimdemedes/ink/issues/676)**

**Problem**: No multi-line input element for chat-like apps.

**Why it's hard in Ink**: Text wrapping and cursor positioning require layout awareness.

**Inkx opportunity**: Layout-aware components could make a `<TextArea>` feasible.

---

## What Ink Gets Right (Don't Regress)

These PRs show what matters to users:

| PR   | Feature                            | Status    |
| ---- | ---------------------------------- | --------- |
| #823 | Screen reader accessibility        | ✅ Merged |
| #829 | Home/End key support               | ✅ Merged |
| #836 | Incremental rendering optimization | ✅ Merged |
| #854 | Non-TTY environment fallback       | In review |

**Inkx must verify**:

- Screen reader output works
- Home/End keys are handled
- Incremental rendering is efficient
- Graceful degradation in CI/piped environments

---

## Ink's Maintenance Patterns

Analysis of PR merge patterns reveals:

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

Based on Ink issues, Inkx should test:

| Test Case                   | Ink Issue | Priority | Inkx Status   |
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

1. **CJK/IME testing** — This is Ink's #1 pain point. If Inkx handles it well, that's a major differentiator.
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

## When to Use Ink vs Inkx

### Decision Tree

```
Do you need scrolling or dimension queries?
├── YES → Use Inkx
│         (Ink requires manual virtualization and width-threading)
│
└── NO → Is this a new project?
         ├── YES → Consider Inkx
         │         (Better architecture, but newer and less battle-tested)
         │
         └── NO → Is your existing Ink app working well?
                  ├── YES → Stay with Ink
                  │         (Migration has cost, Ink is stable)
                  │
                  └── NO → What problems are you hitting?
                           ├── Text overflow → Inkx (auto-truncation)
                           ├── Layout complexity → Inkx (useLayout)
                           ├── CJK/IME input → TBD (both have issues)
                           └── Other → Evaluate case-by-case
```

### Quick Reference

| If you need...                              | Use          |
| ------------------------------------------- | ------------ |
| Native scrolling (`overflow="scroll"`)      | Inkx         |
| Component dimension queries (`useLayout()`) | Inkx         |
| ANSI-aware text truncation                  | Inkx         |
| Smaller bundle size                         | Inkx + Flexx |
| Maximum ecosystem compatibility             | Ink          |
| Battle-tested stability                     | Ink          |
| Smallest risk for production                | Ink          |

### Layout Engine Comparison

Inkx supports two layout engines. Both use the same flexbox API:

| Engine              | Bundle (gzip) | Performance\* | Initialization |
| ------------------- | ------------- | ------------- | -------------- |
| **Yoga** (WASM)     | 38 KB         | 316 µs        | Async          |
| **Flexx** (pure JS) | 7 KB          | 125 µs        | Sync           |

\*Kanban 3×50 benchmark (~150 nodes), Apple M1 Max

**Flexx is 2.5x faster and 5x smaller.** Trade-off: no RTL or baseline alignment.

For terminal UIs, both are fast enough for 60fps. Choose based on bundle size and feature needs. See [Flexx vs Yoga comparison](../../beorn-flexx/docs/yoga-comparison.md) for details.

### Maturity Considerations

**Ink**: Production-ready, battle-tested, maintenance mode

- Millions of users via React Native, CLI tools
- 100+ open issues (some architectural, unfixable)
- Stable API, low churn

**Inkx**: Functionally complete, seeking real-world feedback

- Used in production by the authors
- Comprehensive test suite
- Not yet battle-tested across diverse environments
- API may evolve based on feedback

### Migration Path

If you're on Ink and considering Inkx:

1. **Evaluate if you need Inkx features** — If Ink works for you, stay
2. **Try Inkx in a new feature** — Lower risk than full migration
3. **Report issues** — Help us find edge cases
4. **Consider @beorn/ink-measure** — Add dimension awareness to Ink incrementally

---

## Performance Benchmarks

Measured on Apple M1 Max, Bun 1.3.8. Run: `bun run bench:comparison`

### React Component Rendering

Time to render Box+Text component trees through the full pipeline (reconciliation + layout + content + output).

| Components | inkx (Flexx) | Notes                                   |
| ---------- | ------------ | --------------------------------------- |
| 1          | 178 us       | Single component baseline               |
| 100        | 47 ms        | Typical TUI complexity                  |
| 1000       | 470 ms       | Stress test (far beyond normal TUI use) |

Ink does not publish render benchmarks. Ink issue [#694](https://github.com/vadimdemedes/ink/issues/694) reports degradation at 500+ components; inkx handles 1000 without crashes, though at reduced throughput.

### Pipeline Render (Low-Level)

`executeRender` bypassing React reconciliation. Shows raw pipeline throughput.

| Nodes | First Render | Diff Render | Diff Speedup |
| ----- | ------------ | ----------- | ------------ |
| 1     | 310 us       | 40 us       | 7.8x         |
| 100   | 24 ms        | 45 us       | 520x         |
| 1000  | 242 ms       | 164 us      | 1475x        |

The diff path is dramatically faster because inkx tracks dirty nodes per-component and uses packed-integer buffer comparison. This is the key advantage of inkx's architecture: after the first render, updates are near-instant for typical UIs where <10% of cells change.

### Diff Performance (Buffer Comparison)

The output phase computes terminal escape sequences by diffing two buffers.

| Scenario         | Time   |
| ---------------- | ------ |
| 80x24 no changes | 28 us  |
| 80x24 10% change | 35 us  |
| 80x24 full paint | 61 us  |
| 200x50 no change | 148 us |

Ink uses row-based string comparison (PR [#836](https://github.com/vadimdemedes/ink/pull/836) adds incremental optimization). inkx uses cell-level comparison with a packed Uint32Array fast-path, giving consistent sub-millisecond diffs even for large terminals.

### Resize Handling

Time to re-layout after terminal size change (80x24 -> 120x40).

| Nodes | Flexx  |
| ----- | ------ |
| 10    | 257 ns |
| 100   | 1.8 us |
| 1000  | 21 us  |

Resize is extremely fast because it only involves the layout phase (no reconciliation or content rendering). Both inkx and Ink use flexbox layout engines, so this performance is comparable when inkx uses Yoga.

### Layout Engine: Flexx vs Yoga

Direct comparison on identical trees.

| Benchmark             | Flexx | Yoga  | Winner |
| --------------------- | ----- | ----- | ------ |
| 100 nodes flat list   | 86 us | 80 us | ~same  |
| 50-node kanban (3col) | 63 us | 52 us | ~same  |

Both engines are fast for terminal UIs. The difference is negligible at these scales. Flexx's advantage is its 5x smaller bundle size (7 KB vs 38 KB gzipped) and synchronous initialization.

### Bundle Size

| Package      | Size (gzip) | Notes                   |
| ------------ | ----------- | ----------------------- |
| inkx + Flexx | ~45 KB      | Pure JS layout engine   |
| inkx + Yoga  | ~76 KB      | WASM layout engine      |
| ink          | ~52 KB      | Yoga-only, no Flexx opt |

### Feature Comparison Summary

| Feature                 | inkx                          | Ink                           |
| ----------------------- | ----------------------------- | ----------------------------- |
| Layout awareness        | useContentRect/useScreenRect  | None (thread props manually)  |
| Scrollable containers   | overflow="scroll"             | Third-party or manual         |
| Text truncation         | Auto (ANSI-aware)             | Manual per-component          |
| Unicode/CJK handling    | Built-in grapheme/width utils | Basic (known issues)          |
| Mouse support           | HitRegistry with z-index      | Basic useInput                |
| Input handling          | InputLayerProvider + useInput | useInput only                 |
| Static rendering        | renderStatic()                | Static component              |
| Plugin system           | withCommands/Keybindings/Diag | None                          |
| Testing API             | createRenderer + locators     | ink-testing-library           |
| Multiple render targets | Terminal, Canvas, DOM         | Terminal only                 |
| Layout engines          | Flexx (7KB) or Yoga (38KB)    | Yoga only                     |
| Incremental rendering   | Dirty tracking per-node       | Full re-render (PR #836 adds) |
| Diff render (100 nodes) | 45 us                         | N/A (no published benchmarks) |
| Resize (1000 nodes)     | 21 us                         | Comparable (same Yoga engine) |

---

## Conclusion

Inkx is well-positioned to capture users frustrated with Ink's limitations:

| User Pain                            | Ink's Answer                      | Inkx's Answer           |
| ------------------------------------ | --------------------------------- | ----------------------- |
| "I need scrolling"                   | "Use a third-party library"       | `overflow="scroll"`     |
| "How do I get component dimensions?" | "Thread width props manually"     | `useLayout()`           |
| "Text breaks my layout"              | "Calculate and truncate yourself" | Auto-truncation         |
| "I need a cursor"                    | "Open issue since 2019"           | `useCursor()` (planned) |
| "CJK input is broken"                | "We're working on it"             | ⚠️ TBD                  |

The key is to **nail the fundamentals** (scrolling, layout feedback) while **testing the edge cases** (CJK, multiplexers) that trip up real users.

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
