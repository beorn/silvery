# Minimum Width

How narrow is a component allowed to get? Silvery answers that with CSS's automatic minimum size (§4.5): **a flex item does not shrink below its own content's intrinsic minimum**. In practice that means a paragraph shrinks until its longest unbreakable word, and then stops.

You usually get this for free. This page is for the cases where you need to know the rule — and for the one prop that opts out of it.

## The short version

- A `<Text wrap="wrap">` floors at its **longest unbreakable token**, not at its natural width.
- That floor **propagates up through wrapper Boxes** automatically. You do not thread anything through a wrap chain.
- A `<Text>` that cannot wrap (`truncate`, `clip`, `false`) floors at **1 cell** — it declares it can always collapse to an ellipsis. It needs no help to fit.
- `minWidth={0}` opts a subtree out of the floor entirely. Reach for it in exactly one situation, below.

## The floor, and where it comes from

Min-content is "the narrowest this content can be without overflowing". For text it is the longest run of characters with no break opportunity inside it:

```tsx
// The container is 12 cells. The word is 34 and cannot break.
<Box width={12} flexDirection="row">
  <Box>
    <Text wrap="wrap">supercalifragilisticexpialidocious</Text>
  </Box>
</Box>
```

The inner Box lays out **34 cells wide and overflows**, rather than squeezing to 12 and shredding the word. That is the auto-min floor doing its job: overflow is visible and fixable, a mangled word is neither.

Wrap mode decides the floor, and the rules live in one place — [`intrinsicWidths`](https://github.com/beorn/silvery/blob/main/packages/ag-term/src/unicode.ts) in `@silvery/ag-term/unicode`:

| Wrap mode                            | min-content                                             | max-content   |
| ------------------------------------ | ------------------------------------------------------- | ------------- |
| `"wrap"` (and other wrappable modes) | longest unbreakable segment between break opportunities | natural width |
| `"hard"`                             | 1 cell — any character may break                        | natural width |
| `"truncate"` / `"clip"` / `false`    | 1 cell — collapses to an ellipsis                       | natural width |

Break opportunities include whitespace and hyphens, and also the soft separators `/ \ . _ :` — so `.claude/skills/{claim,do}/SKILL.md` reports the longest path _segment_ as its floor, not the whole path.

## It propagates — don't thread props

The floor established at a `<Text>` is the same floor several wrappers up. Nesting depth does not change it:

```tsx
// All three of these produce the same floor.
<Text wrap="wrap">{token}</Text>
<Box><Text wrap="wrap">{token}</Text></Box>
<Box><Box><Box><Text wrap="wrap">{token}</Text></Box></Box></Box>
```

This is why the old `flexShrink={1} minWidth={0}` incantation threaded down every wrapper is no longer needed — see [Prose](/components/Prose) for that history. Containers walk their children (summing on the main axis, taking the max on the cross axis) and add their own padding, border and gap.

## `minWidth={0}` — the one escape hatch

Use it when **the container is legitimately narrower than the longest unbreakable token and you would rather clip than overflow**:

```tsx
// Without minWidth={0}: the cell is 34 wide and overflows its 12-cell parent.
// With it: the cell is 12 and the long word is clipped by overflow="hidden".
<Box width={12} flexDirection="row">
  <Box minWidth={0} overflow="hidden">
    <Text wrap="wrap">supercalifragilisticexpialidocious</Text>
  </Box>
</Box>
```

It works on the `<Text>` itself too, via `TextFlexItemProps`.

### When NOT to reach for it

**Non-wrappable Text does not need it.** A `<Text wrap="truncate">` already reports min-content 1, so a Box around it shrinks to its container unaided; adding `minWidth={0}` measurably changes nothing. Guidance that still prescribes the hatch for truncate/clip Text predates a fix merged 2026-05-11 — before it, non-wrappable Text reported min-content equal to max-content, the parent got pinned at natural width, and its `overflow="hidden"` hard-clipped mid-word with no ellipsis because flex never shrank the Text.

Both claims in this section are pinned by contract tests in `tests/features/min-width-protocol.test.tsx`, so this page cannot quietly drift off the code.

## Engine requirement

Recursive intrinsic min-content is a **flexily-only** capability. It rides on a measure mode (`MEASURE_MODE_MIN_CONTENT`) that Yoga does not define, so under `SILVERY_ENGINE=yoga` the adapter throws rather than silently substituting a different mode and producing a plausible wrong layout. The fix it names is `SILVERY_ENGINE=flexily`.

Container-side §4.5 (an `overflow: hidden/scroll` container gets `min-size: auto = 0`) and item-side auto-min are both implemented under the CSS preset; the Yoga preset keeps Yoga's looser `min: undefined → 0`.

## Where the rest of this is written down

This page covers the silvery-visible surface. The engine mechanics — how the automatic minimum size is derived, how `contentMinSize` relates to `baseSize`, the specified-size suggestion cap, and the per-node caching — are documented once, in flexily's [Yoga divergences guide](https://github.com/beorn/flexily/blob/main/docs/guide/yoga-divergences.md) under "Divergence 4: flex-item automatic minimum size". That is the canonical home for the algorithm; this page deliberately does not restate it.

## See also

- [Layouts](/guide/layouts) — flexbox basics in silvery
- [Responsive Layout](/guide/responsive-layout) — `containerType`, `fitWidth`, `cqi` units
- [Prose](/components/Prose) — typography primitive, and the history of the wrap-chain incantation
