# Content-width flex items with maxWidth cap (chat bubbles)

**Problem.** You have a row of chat bubbles. Each bubble should size to its content, capped at a `maxWidth`. User bubbles should be right-aligned, assistant bubbles left-aligned.

This looks like a `flexShrink` problem — it isn't. It's an `alignItems` problem.

## The wrong way

The first instinct is to put every bubble in a full-width row, give the bubble `maxWidth`, and hope `flexShrink: 1` collapses it to its content:

```tsx
// ❌ Does NOT shrink to content. Bubble stays at `maxWidth`.
<Box flexDirection="row" justifyContent={isUser ? "flex-end" : "flex-start"}>
  <Box flexShrink={1} maxWidth={60} borderStyle="round" padding={1}>
    <Text>{message}</Text>
  </Box>
</Box>
```

**Why it fails.** `flexShrink` only activates when the flex line _overflows_ its container. A single bubble in a row with free space does not overflow, so flexbox gives the child its `max-content` size, which for `<Text>` children is "the longest unbroken run" — typically the full `maxWidth` once wrapping kicks in. The bubble fills the cap instead of shrinking to its text.

Tweaking `flexBasis`, `flexGrow: 0`, `width: "auto"`, or wrapping in another `flexShrink: 1` box does not change this. The row-with-justify-end model is the wrong mental model.

## The right way

Make the bubble a **column** (not a row child) with `alignItems` controlling the horizontal anchor. `alignItems` on a column aligns children on the cross axis, and a column-scoped `maxWidth` caps the width while letting the content shrink below it:

```tsx
// ✅ Bubble hugs its content; the column anchors it to the correct side.
<Box flexDirection="column" alignItems={isUser ? "flex-end" : "flex-start"} maxWidth={60}>
  <Box borderStyle="round" padding={1} backgroundColor={isUser ? "$primaryBg" : "$surfaceBg"}>
    <Text wrap="wrap">{message}</Text>
  </Box>
</Box>
```

**Why it works.** The outer column is a normal block-flow element — it takes its parent's full width but does _not_ stretch its children. `alignItems="flex-end"` anchors the inner bubble to the right edge of the column; `alignItems="flex-start"` anchors it to the left. The inner bubble sizes to its content via flexbox's default "shrink to fit" behavior for non-stretched cross-axis children. `maxWidth` on the column caps the hard ceiling for long messages; `<Text wrap="wrap">` wraps at that ceiling.

No `flexShrink`, no `justifyContent`, no manual width math.

## Minimal runnable example

```tsx
import React from "react"
import { Box, Text } from "silvery"
import { run } from "silvery/runtime"

type Message = { role: "user" | "assistant"; text: string }

const MESSAGES: Message[] = [
  { role: "user", text: "Can you refactor this function to use a generator?" },
  { role: "assistant", text: "Sure — switching to `function*` lets callers pause between yields." },
  { role: "user", text: "ok" },
]

function Bubble({ role, text }: Message) {
  const isUser = role === "user"
  return (
    <Box
      flexDirection="column"
      alignItems={isUser ? "flex-end" : "flex-start"}
      maxWidth={60}
      marginBottom={1}
    >
      <Box borderStyle="round" padding={1}>
        <Text wrap="wrap">{text}</Text>
      </Box>
    </Box>
  )
}

function App() {
  return (
    <Box flexDirection="column" padding={1}>
      {MESSAGES.map((m, i) => (
        <Bubble key={i} {...m} />
      ))}
    </Box>
  )
}

const handle = await run(<App />)
await handle.waitUntilExit()
```

Run this and short messages render as tight bubbles; long messages wrap at 60 columns; user bubbles sit on the right, assistant bubbles on the left.

## When to reach for this pattern

Any UI where children should **hug content** with a **ceiling**, anchored to a specific side:

- Chat / conversation bubbles
- Toast notifications stacked to one corner
- Inline quote callouts in long text
- Pill-shaped status tags in a column

For rows of bubbles where you want _both_ left and right bubbles in the same row (e.g., timestamps on one side, labels on the other), nest two of these columns inside a `justifyContent: "space-between"` row.

## See also

- [Layouts](../layouts) — fixed/flexible bars, columns, scrollable content.
- [Styling](../styling) — pairing background + text tokens for bubbles.
- [CSS Alignment](../css-alignment) — how silvery maps the W3C flexbox alignment spec.
