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
  text: string // plain text from buffer extraction
  range: SelectionRange // screen coordinates of selection
}
```

### ClipboardData

```typescript
interface ClipboardData {
  text: string // plain text (always required)
  markdown?: string // structured content
  html?: string // rich format
  internal?: unknown // app-specific structured data
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
    text: true // always supported
    html?: boolean
    markdown?: boolean
    internal?: boolean
  }
}
```

### OSC 52 (Default)

The default backend uses the OSC 52 escape sequence to write to the system clipboard. This works across SSH sessions and in most modern terminals.

```tsx
import { createOsc52Backend } from "silvery"

// Construct an OSC 52 backend and write text to the system clipboard
const backend = createOsc52Backend(stdout)
backend.write({ text: "Hello, clipboard!" })
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
  text: string // raw pasted text
  source: "bracketed" | "internal" // where it came from
  structured?: ClipboardData // rich data if internal paste
}
```

### Internal vs External Paste

- **External paste** (Cmd+V / Ctrl+Shift+V): Terminal wraps text in bracketed paste sequences. Silvery parses them and fires the paste event.
- **Internal paste**: If the last copy produced `ClipboardData` with `internal` or `markdown` fields, paste provides the structured data alongside the plain text.

## Advanced Clipboard (OSC 5522)

The advanced clipboard extends OSC 52 with MIME type support, large payload chunking, and paste events using the [kitty clipboard protocol](https://sw.kovidgoyal.net/kitty/clipboard/).

### When to Use

Use the advanced clipboard when you need:

- **Multiple MIME types** — copy text/plain alongside text/html, image/png, etc.
- **Large payloads** — automatic chunking for data > 4096 bytes
- **Paste events** — terminal notifies your app when the user pastes, including MIME types

When the terminal does not support OSC 5522, the advanced clipboard falls back to OSC 52 (plain text only).

### AdvancedClipboard Interface

```typescript
interface ClipboardEntry {
  mime: string // "text/plain", "text/html", "image/png", etc.
  data: string | Uint8Array // text or binary data
}

interface AdvancedClipboard {
  copy(entries: ClipboardEntry[]): void
  copyText(text: string): void
  copyRich(text: string, html: string): void
  onPaste(handler: (entries: ClipboardEntry[]) => void): () => void
  readonly supported: boolean
  dispose(): void
}
```

### Creating an Advanced Clipboard

```typescript
import { createAdvancedClipboard } from "@silvery/ag-term"

const clipboard = createAdvancedClipboard({
  write: (data) => process.stdout.write(data),
  onData: (handler) => {
    const listener = (buf: Buffer) => handler(buf.toString())
    process.stdin.on("data", listener)
    return () => process.stdin.removeListener("data", listener)
  },
  supported: true, // set based on terminal detection
})
```

### Copying with MIME Types

```typescript
// Plain text (convenience)
clipboard.copyText("Hello, World!")

// Text + HTML (convenience)
clipboard.copyRich("Hello", "<b>Hello</b>")

// Multiple MIME types (full control)
clipboard.copy([
  { mime: "text/plain", data: "Hello" },
  { mime: "text/html", data: "<b>Hello</b>" },
  { mime: "image/png", data: pngBytes }, // Uint8Array
])
```

### Paste Events

Enable paste events mode by writing the CSI sequence, then subscribe:

```typescript
import { ENABLE_PASTE_EVENTS, DISABLE_PASTE_EVENTS } from "@silvery/ag-term"

// Enable paste events
process.stdout.write(ENABLE_PASTE_EVENTS)

const unsub = clipboard.onPaste((entries) => {
  for (const entry of entries) {
    if (entry.mime === "text/plain") {
      insertText(entry.data as string)
    } else if (entry.mime === "image/png") {
      insertImage(entry.data as Uint8Array)
    }
  }
})

// Later: disable and unsubscribe
unsub()
process.stdout.write(DISABLE_PASTE_EVENTS)
```

### Relationship to OSC 52

| Feature                | OSC 52 | OSC 5522               |
| ---------------------- | ------ | ---------------------- |
| Plain text copy        | Yes    | Yes                    |
| Multiple MIME types    | No     | Yes                    |
| Binary data (images)   | No     | Yes                    |
| Large payload chunking | No     | Yes (4096 byte chunks) |
| Paste events           | No     | Yes                    |
| Terminal support       | Broad  | Kitty 0.28+            |

The `createAdvancedClipboard` factory handles fallback automatically: when `supported` is false, `copyText` and `copyRich` use OSC 52, and `copy` extracts the text/plain entry for OSC 52.

## See Also

- [Text Selection](/guide/text-selection) — userSelect prop, mouse selection, copy-mode
- [Find](/guide/find) — buffer search, match navigation, selection integration
