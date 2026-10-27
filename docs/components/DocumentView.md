# DocumentView

`DocumentView` renders an already-projected semantic document. It does not
parse Markdown or depend on an application store.

```tsx
import { DocumentView, type DocumentBlock } from "silvery"

const blocks: DocumentBlock[] = [
  { id: "title", kind: "heading", level: 1, content: "Release" },
  {
    id: "first",
    kind: "list-item",
    list: { groupId: "steps", depth: 0, ordered: true },
    content: "Run verification",
  },
  {
    id: "second",
    kind: "list-item",
    list: { groupId: "steps", depth: 0, ordered: true },
    content: "Publish",
  },
]

;<DocumentView blocks={blocks} />
```

The presenter owns:

- heading and paragraph rhythm
- prose, wide, and full Content lanes
- ordered counters
- fixed marker columns and the real marker/body gap
- hanging indents and nested-list indentation
- quote, code, table, rule, and extension-block geometry
- selected-row background and foreground

Supported block kinds are `heading`, `paragraph`, `list-item`, `quote`,
`code`, `table`, `rule`, and `extension`.

A code block's optional `notice` displays one truncated error-colour line
above its source, and stays visible when collapsed. The code block retains
its lane, gutter and activation; search indexes its source.

## List identity

Every list item supplies a stable `groupId`. Items in one ordered group advance
from `start` (default `1`) even when a parser normalizes source markers. The
widest marker in the group determines the marker column, so `9.`, `10.`, and
`11.` share one body column. `depth` is zero-based.

Applications may supply a leaf `marker` (for example, a checkbox) and its
`markerWidth`. DocumentView still owns the marker cell, gap, body column, and
wrapping.

## Measured reveal

Hosts can reveal a semantic block without estimating its rendered row. Pass
the controller from the enclosing `ScrollArea`, the target block identity, and
a stable operation identity:

```tsx
<ScrollArea controller={controller}>
  <DocumentView
    blocks={blocks}
    reveal={{ operationId: navigationEntry.id, blockId: "target", scrollController: controller }}
  />
</ScrollArea>
```

DocumentView waits for layout and scrolls from the same measured block geometry
used by document search. Change `operationId` to issue a new reveal operation,
including when revealing the same `blockId` again.

## Extension boundary

`content`, `marker`, and `accessory` accept React nodes as leaf or inline
content. They are not block-layout escape hatches. Adapters must not use them
to recreate lanes, list rows, rhythm, or wrapping.

If no surrounding [`Content.Layout`](./Content.md) exists, DocumentView
provides one automatically. A host may provide Content explicitly to customize
lane widths without changing document geometry.
