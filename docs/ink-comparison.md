# Inkx vs Ink: Detailed Comparison

This document analyzes Ink's real-world issues and PRs to understand where Inkx can provide value.

*Last updated: January 2026 (based on analysis of ink's last 100 PRs and issues)*

---

## Executive Summary

Ink is in maintenance mode with a stable but limited architecture. Many long-standing issues (some 5-6 years old) remain open because they require architectural changes Ink won't make. Inkx solves several of these by design.

---

## Problems Inkx Already Solves

### 1. Layout Feedback (Ink's Architectural Limitation)

**Ink issue [#5](https://github.com/vadimdemedes/ink/issues/5)** (opened 2016, still open):
> "Is there a way to know the width/height of a Box?"

**Why Ink can't fix it**: Ink renders components *before* Yoga calculates layout. By the time dimensions are known, React is done rendering.

**Inkx solution**: Two-phase rendering. Layout calculates first, then components render with `useLayout()` providing actual dimensions.

```tsx
// Ink: 147 lines of width-threading code in real apps
function Card({ width }: { width: number }) {
  return <Text>{truncate(title, width)}</Text>;
}

// Inkx: Zero width props needed
function Card() {
  const { width } = useLayout();
  return <Text>{truncate(title, width)}</Text>;
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

| PR | Feature | Status |
|----|---------|--------|
| #823 | Screen reader accessibility | ✅ Merged |
| #829 | Home/End key support | ✅ Merged |
| #836 | Incremental rendering optimization | ✅ Merged |
| #854 | Non-TTY environment fallback | In review |

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

| Test Case | Ink Issue | Priority | Inkx Status |
|-----------|-----------|----------|-------------|
| CJK character rendering | #759 | P0 | ⚠️ Needs test |
| Double-width char alignment | #759 | P0 | ⚠️ Needs test |
| Emoji ZWJ sequences | - | P1 | ⚠️ Needs test |
| ANSI truncation | #584 | P1 | ⚠️ Needs test |
| Rapid keystrokes | PR #782 | P1 | ⚠️ Needs test |
| borderDimColor | #840 | P2 | ⚠️ Needs test |
| Large component counts | #694 | P2 | ⚠️ Needs test |
| Home/End keys | PR #829 | P2 | ⚠️ Needs test |
| Process exit timing | #796 | P1 | ⚠️ Needs test |
| tmux rendering | PR #846 | P0 | ⚠️ Needs test |
| Zellij rendering | PR #846 | P0 | ⚠️ Needs test |

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

## Conclusion

Inkx is well-positioned to capture users frustrated with Ink's limitations:

| User Pain | Ink's Answer | Inkx's Answer |
|-----------|--------------|---------------|
| "I need scrolling" | "Use a third-party library" | `overflow="scroll"` |
| "How do I get component dimensions?" | "Thread width props manually" | `useLayout()` |
| "Text breaks my layout" | "Calculate and truncate yourself" | Auto-truncation |
| "I need a cursor" | "Open issue since 2019" | `useCursor()` (planned) |
| "CJK input is broken" | "We're working on it" | ⚠️ TBD |

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
