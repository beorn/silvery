# Clipboard

Silvery's clipboard system has two layers: framework-level visual copy (always works) and optional semantic providers (app-enriched content).

## Layer 1: Visual Copy

When text is selected and copied, Silvery extracts plain text from the terminal buffer and sends it to the system clipboard. This works out of the box — no application code needed.

```
select text → extract from buffer → clipboard backend → system clipboard
```

### Text Extraction

Silvery extracts text correctly from the terminal buffer:

- **Soft-wrapped lines** are joined (no spurious newlines)
- **Blank lines** within the selection are preserved
- **Trailing whitespace** is trimmed per-line
- **Wide characters** (CJK, emoji) are handled atomically
- **Non-selectable cells** (where `SELECTABLE_FLAG` is not set) are skipped

## Layer 2: Semantic Copy Providers

Applications can enrich copied content with structured data — markdown, HTML, or internal formats. This is opt-in and never blocks the plain text copy.

```tsx
import { CopyProvider } from "silvery"

function DetailPane({ node }) {
  return (
    <CopyProvider
      value={{
        enrichCopy(event) {
          // event.text = plain text from buffer
          // Return enriched clipboard data
          return {
            text: event.text,
            markdown: node.toMarkdown(),
            internal: { nodeId: node.id, tree: node.serialize() },
          }
        },
      }}
    >
      <Box userSelect="contain">
        <Text>{node.content}</Text>
      </Box>
    </CopyProvider>
  )
}
```

### CopyEvent

```typescript
interface CopyEvent {
  text: string           // plain text from buffer extraction
  range: SelectionRange  // screen coordinates of selection
}
```

### ClipboardData

```typescript
interface ClipboardData {
  text: string         // plain text (always required)
  markdown?: string    // structured content
  html?: string        // rich format
  internal?: unknown   // app-specific structured data
}
```

### Provider Scoping

Providers are registered on components via `<CopyProvider>`. The nearest ancestor provider handles copy events. This means different parts of your app can provide different enrichment:

```tsx
<CopyProvider value={boardProvider}>
  {/* Board copies include node tree structure */}
  <BoardView />
</CopyProvider>

<CopyProvider value={detailProvider}>
  {/* Detail pane copies include markdown */}
  <DetailPane />
</CopyProvider>
```

### Async Enrichment

Providers can return promises. Plain text copies immediately; rich data arrives asynchronously:

```tsx
enrichCopy(event) {
  // Plain text is on the clipboard already
  // This async work enriches the internal clipboard
  return fetchMarkdownForSelection(event.range)
}
```

## Clipboard Backends

The clipboard backend controls how text reaches the system clipboard.

### ClipboardBackend Interface

```typescript
interface ClipboardBackend {
  write(data: ClipboardData): Promise<void>
  read?(): Promise<string>
  capabilities: {
    text: true        // always supported
    html?: boolean
    markdown?: boolean
    internal?: boolean
  }
}
```

### OSC 52 (Default)

The default backend uses the OSC 52 escape sequence to write to the system clipboard. This works across SSH sessions and in most modern terminals.

```tsx
import { copyToClipboard } from "silvery"

// Write text to clipboard via OSC 52
copyToClipboard(stdout, "Hello, clipboard!")
```

**Terminal support**: iTerm2, kitty, Alacritty, WezTerm, Windows Terminal, Ghostty, and most modern terminals support OSC 52. Some have payload size limits. tmux requires `set -g set-clipboard on`.

### Internal Clipboard

For rich formats that can't go through OSC 52 (which is text-only), Silvery maintains an internal clipboard store. When paste occurs, the app can access the last copied `ClipboardData`:

```tsx
import { getInternalClipboard } from "silvery"

function handlePaste(text: string) {
  const lastCopy = getInternalClipboard()
  if (lastCopy?.internal) {
    // Paste with structure — reconstruct nodes, preserve hierarchy
    pasteNodes(lastCopy.internal)
  } else {
    // Plain text paste
    insertText(text)
  }
}
```

## Paste Handling

### Bracketed Paste

Silvery enables bracketed paste mode (DECSET 2004) automatically. Pasted text arrives as a single event, not individual keystrokes:

```tsx
import { PasteProvider } from "silvery"

function Editor() {
  return (
    <PasteProvider
      onPaste={(event) => {
        // event.text — raw pasted text
        // event.source — "bracketed" or "internal"
        // event.structured — ClipboardData if internal paste
        insertAtCursor(event.text)
      }}
    >
      <TextArea />
    </PasteProvider>
  )
}
```

### PasteEvent

```typescript
interface PasteEvent {
  text: string                      // raw pasted text
  source: "bracketed" | "internal"  // where it came from
  structured?: ClipboardData        // rich data if internal paste
}
```

### Internal vs External Paste

- **External paste** (Cmd+V / Ctrl+Shift+V): Terminal wraps text in bracketed paste sequences. Silvery parses them and fires the paste event.
- **Internal paste**: If the last copy produced `ClipboardData` with `internal` or `markdown` fields, paste provides the structured data alongside the plain text.

## See Also

- [Text Selection](/guide/text-selection) — userSelect prop, mouse selection, copy-mode
- [Find](/guide/find) — buffer search, match navigation, selection integration
