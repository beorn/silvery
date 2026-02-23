# Mouse Events Design — React DOM Parity

> **Status: Implemented** — Mouse events are available in production. This document describes the design rationale.

## Principle

Mirror React DOM's mouse event model exactly. Developers should be able to transfer their React web knowledge directly. No new concepts.

## Event Handler Props (same as React DOM)

```tsx
interface MouseEventProps {
  onClick?: (event: InkxMouseEvent) => void
  onDoubleClick?: (event: InkxMouseEvent) => void
  onMouseDown?: (event: InkxMouseEvent) => void
  onMouseUp?: (event: InkxMouseEvent) => void
  onMouseMove?: (event: InkxMouseEvent) => void
  onMouseEnter?: (event: InkxMouseEvent) => void // No bubble (same as DOM)
  onMouseLeave?: (event: InkxMouseEvent) => void // No bubble (same as DOM)
  onWheel?: (event: InkxWheelEvent) => void
}
```

These are added to `BoxProps` and `TextProps`, exactly like React DOM.

## Event Object (mirrors React.MouseEvent)

```tsx
interface InkxMouseEvent {
  // Position (terminal coordinates instead of pixels)
  clientX: number // Terminal column (0-indexed)
  clientY: number // Terminal row (0-indexed)

  // Button
  button: number // 0=left, 1=middle, 2=right (same as DOM)

  // Modifiers (same as DOM)
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean // Cmd on macOS
  shiftKey: boolean

  // Target (same semantics as DOM)
  target: InkxNode // Deepest node under cursor
  currentTarget: InkxNode // Node whose handler is firing (changes during bubble)

  // Propagation control (same as DOM)
  stopPropagation(): void
  preventDefault(): void

  // Event type
  type: "click" | "dblclick" | "mousedown" | "mouseup" | "mousemove" | "mouseenter" | "mouseleave" | "wheel"

  // Terminal-specific (not in DOM, but useful)
  /** The raw ParsedMouse from SGR protocol */
  nativeEvent: ParsedMouse
}

interface InkxWheelEvent extends InkxMouseEvent {
  deltaY: number // -1 (up) or +1 (down) — from SGR scroll
  deltaX: number // Always 0 for terminal (future: horizontal scroll)
}
```

## Bubbling (same as React DOM)

1. Parse SGR mouse sequence → get (x, y, button, action, modifiers)
2. **Hit test**: Walk the render tree to find the deepest node whose `screenRect` contains (x, y)
3. **Bubble phase**: Fire handlers from deepest → root (same as DOM)
   - Each node in the ancestor chain gets the event with `currentTarget` set to itself
   - `stopPropagation()` stops the bubble
4. `mouseenter`/`mouseleave` do NOT bubble (same as DOM spec)

### Hit Test Implementation

inkx already has `screenRect` on every node. The hit test walks the tree:

```typescript
function hitTest(root: InkxNode, x: number, y: number): InkxNode | null {
  // DFS: check children first (deepest match wins, like DOM)
  for (let i = root.children.length - 1; i >= 0; i--) {
    const hit = hitTest(root.children[i], x, y)
    if (hit) return hit
  }
  // Check self
  const rect = root.screenRect
  if (rect && x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height) {
    return root
  }
  return null
}
```

This replaces the manual `HitRegistry` with automatic tree-based hit testing (like DOM).

## Scroll Containers (like DOM overflow:scroll)

`VirtualList` and `Box overflow="scroll"` automatically handle `onWheel`:

```tsx
// This just works — like a <div style="overflow: scroll"> in the browser
<Box overflow="scroll" height={20}>
  <LongContent />
</Box>

// VirtualList scrolls natively too
<VirtualList items={items} height={20} renderItem={renderItem} />

// User can still add onWheel to intercept
<Box overflow="scroll" onWheel={(e) => {
  // Custom handling
  e.stopPropagation() // Prevent default scroll
}}>
```

Default behavior: `onWheel` on a scroll container adjusts its scroll offset. The event still bubbles up after default handling (unless `stopPropagation()` is called).

## Double-Click Detection

Same as browsers: two clicks within 300ms and 2-cell distance = double-click. The runtime tracks click timestamps and positions internally.

```tsx
<Box onClick={(e) => console.log("single click")}>
  <Box onDoubleClick={(e) => console.log("double click!")}>
    <Text>Click me</Text>
  </Box>
</Box>
```

## Integration Points

### Where mouse events enter

Currently: `run()` and `createApp()` parse SGR sequences and yield `{ type: "mouse", ... }` events.

New: After parsing, the runtime does hit testing + event dispatch through the render tree, THEN the raw event is also available via `useInput` as a fallback (same as today).

### Render tree access

The runtime already has access to the root `InkxNode`. After `screenRectPhase` runs, every node has its screen position. We walk this tree for hit testing.

### No HitRegistry needed

The current `HitRegistry` (manual registration) becomes unnecessary. The render tree IS the hit test structure, just like the DOM. Components don't need to register — their `screenRect` is automatically computed by the layout pipeline.

The existing `HitRegistry` can remain for backwards compatibility but becomes deprecated.

## Example Usage

```tsx
function Card({ nodeId, title }: CardProps) {
  return (
    <Box onClick={() => selectCard(nodeId)} onDoubleClick={() => editCard(nodeId)} borderStyle="round">
      <Text>{title}</Text>
    </Box>
  )
}

function Column({ cards }: ColumnProps) {
  return (
    <Box onClick={() => selectColumn()} flexDirection="column">
      <Text bold>Column Header</Text>
      <VirtualList
        items={cards}
        renderItem={(card) => <Card {...card} />}
        height={20}
        // VirtualList handles scroll wheel natively
      />
    </Box>
  )
}

function DetailPane({ content }: DetailPaneProps) {
  return (
    // overflow="scroll" + wheel = automatic scrolling, like a browser div
    <Box overflow="scroll" height={30} flexDirection="column">
      {content}
    </Box>
  )
}
```

## Migration from km-tui

| Current (km-tui manual)                | New (inkx DOM events)                   |
| -------------------------------------- | --------------------------------------- |
| `resolveMouseToNode(ctx, x, y)`        | `<Box onClick={(e) => ...}>`            |
| `resolveMouseToColumn(ctx, x)`         | `<Box onClick={(e) => ...}>` on column  |
| `columnScrollAnchor` in UIState        | VirtualList handles internally          |
| `detailScrollOffset` manual updates    | `Box overflow="scroll"` handles wheel   |
| Global `handleMouse()` in board-app.ts | Component-level event handlers          |
| `HitRegistry` + `useHitRegion`         | Automatic (render tree = hit structure) |

## Implementation Order

1. **Add mouse event props to BoxProps/TextProps** in types.ts
2. **Tree-based hit testing** — walk render tree using screenRect
3. **Event dispatch** — synthetic event creation, bubble from target to root
4. **Double-click detection** — track clicks in runtime, fire onDoubleClick
5. **Scroll container default behavior** — VirtualList and overflow:scroll handle onWheel
6. **mouseenter/mouseleave** — track hover state, fire on transitions (no bubble)
7. **Testing** — `app.click(x, y)`, `app.wheel(x, y, delta)` in testing API

## Keyboard Events — Unified Model

### Current state

- `useInput(handler)` — global hook, all registrants get all keystrokes
- `useInputLayer(id, handler)` — LIFO stack with consumption (return true = handled)
- Mouse events are separate `{ type: "mouse" }` in the event stream

### Proposed: onKeyDown/onKeyUp on components (React DOM parity)

```tsx
interface KeyboardEventProps {
  onKeyDown?: (event: InkxKeyboardEvent) => void
  onKeyUp?: (event: InkxKeyboardEvent) => void
}

interface InkxKeyboardEvent {
  key: string // 'j', 'Enter', 'ArrowDown', etc.
  code: string // Physical key (for Kitty protocol)
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean // Cmd (super) via Kitty
  shiftKey: boolean
  repeat: boolean // eventType === 2 (Kitty)
  stopPropagation(): void
  preventDefault(): void
  nativeEvent: { input: string; key: Key }
}
```

### Focus model

Terminal has no native focus. We need a focus concept for key events to know where to start bubbling.

**Approach**: The tree-based `FocusManager` tracks which node has focus. The "focused" element receives key events first, and they bubble up through the render tree.

```tsx
<Box
  onKeyDown={(e) => {
    /* board-level keys */
  }}
>
  <Column>
    <Box
      testID="card"
      focusable
      onKeyDown={(e) => {
        if (e.key === "Enter") startEdit()
        e.stopPropagation() // Don't let Enter bubble
      }}
    />
  </Column>
</Box>
```

### Backwards compatibility

`useInput` and `useInputLayer` continue to work exactly as today. They receive ALL events (not scoped to focus). The new `onKeyDown`/`onKeyUp` props are an additional, DOM-like option.

Priority order:

1. `useInputLayer` handlers (highest priority, LIFO stack)
2. `onKeyDown` on focused element → bubble to root
3. `useInput` handlers (lowest priority, catch-all)

This lets apps incrementally adopt the DOM-like model without rewriting existing code.

### Phase 2 (defer)

Focus-based key routing is now implemented via the tree-based `FocusManager`. Key events are dispatched to the focused node and bubble up through the render tree. The `onKeyDown`/`onKeyUp` props on `Box` work alongside the existing `useInput`/`useInputLayer` system.

## Links — Clickable References (like HTML `<a>`)

### Principle

Links are first-class elements, like HTML `<a href="...">`. The mouse event system handles clicking on them automatically. Apps register URL scheme handlers for navigation — no manual coordinate resolution needed.

### The `<Link>` Component

```tsx
// In inkx — mirrors HTML's <a> tag
<Link href="https://example.com">click here</Link>
<Link href="file:///path/to/doc.pdf">open doc</Link>
<Link href="km://node/abc123">Project Alpha</Link>
<Link href="km://tag/urgent">#urgent</Link>
<Link href="km://user/john">@john</Link>

// With custom click handler (like onClick on <a>)
<Link href="km://node/abc" onClick={(e) => {
  e.preventDefault()    // Skip default handler
  showPreview(e.href)   // Custom behavior
}}>
  Preview
</Link>
```

**Rendering:**

- Default style: underline + link color (configurable via theme)
- OSC 8 hyperlink attribute on cells (terminal-native hover in supporting terminals)
- Mouse cursor change to pointer when hovering (if terminal supports it)

**Click behavior (mirrors browser `<a>`):**

1. `onClick` fires on the Link element
2. If not `preventDefault()`'d, the registered scheme handler fires
3. Event still bubbles to parent (parent can also react to the click)

### URL Scheme Handlers

Like Electron's `protocol.registerScheme` or browser protocol handlers:

```tsx
// Register at app root — defines what happens when a URL is "navigated to"
;<LinkHandlerProvider
  handlers={{
    https: (url) => openExternal(url), // shell open in browser
    http: (url) => openExternal(url),
    file: (url) => openExternal(url), // open in Finder/default app
    km: (url) => navigateInternal(url), // app handles internally
  }}
>
  <App />
</LinkHandlerProvider>

// Or via hook
const registerHandler = useLinkHandlers()
registerHandler("km", (url) => {
  const parsed = new URL(url)
  switch (parsed.hostname) {
    case "node":
      zoomToNode(parsed.pathname.slice(1))
      break
    case "tag":
      filterByTag(parsed.pathname.slice(1))
      break
    case "user":
      showUserItems(parsed.pathname.slice(1))
      break
  }
})
```

### km-tui Usage

**Semantic entity components** — reusable, consistently styled, automatically linked:

```tsx
// Reusable entity components (km-tui level, built on <Link>)
<Tag name="urgent" />        // renders: #urgent  (tag color, links to km://tag/urgent)
<User name="john" />         // renders: @john    (user color, links to km://user/john)
<Project id="abc" name="Alpha" />  // renders: +Alpha  (project icon, links to km://node/abc)
<NodeRef id="xyz" title="Design doc" />  // renders: Design doc  (link style, links to km://node/xyz)
<ExternalLink href="https://docs.example.com">docs</ExternalLink>  // renders: docs  (url style)

// Under the hood, they're all just <Link> with consistent styling:
function Tag({ name }: { name: string }) {
  return (
    <Link href={`km://tag/${name}`}>
      <Text color="cyan">#{name}</Text>
    </Link>
  )
}

function User({ name }: { name: string }) {
  return (
    <Link href={`km://user/${name}`}>
      <Text color="magenta">@{name}</Text>
    </Link>
  )
}
```

**In card/content rendering**, markdown content automatically maps to these components:

```tsx
// Markdown: "Task for @john — see #project and [docs](https://...)"
// Renders as:
<Text>Task for </Text>
<User name="john" />
<Text> — see </Text>
<Tag name="project" />
<Text> and </Text>
<ExternalLink href="https://docs.example.com">docs</ExternalLink>
```

The km-tui app registers a `km://` handler at startup. All internal navigation goes through this — node zoom, tag filter, user view, etc. External URLs and files open in the OS default handler.

### Integration with Mouse Events

Links are regular inkx elements with:

- `screenRect` from the layout pipeline (automatic hit testing)
- Default `onClick` that dispatches to scheme handlers
- OSC 8 attribute on buffer cells (terminal-level clickability)
- Standard event bubbling (parent can intercept via stopPropagation)

No special hit registry or manual coordinate resolution. The render tree IS the hit structure.

### Implementation with Existing Infrastructure

inkx already has:

- OSC 8 hyperlink support in buffer cells (parseAnsiText, render-text, output-phase)
- `hyperlink` field on Cell and FullCell types
- OSC 8 open/close sequence emission in bufferToStyledText and diffBuffers

New additions:

1. `<Link>` component (wraps `<Text>` + sets hyperlink + registers onClick)
2. `LinkHandlerProvider` context (scheme → handler map)
3. Default onClick on `<Link>` that resolves href → handler

## What NOT to include (keep it simple, avoid NIH)

- No drag-and-drop (onDragStart etc.) — terminal drag is just mouse-move-with-button-held
- No onContextMenu — right-click is just button=2
- No capture phase (onClickCapture) — rarely used, can add later
- No pointer events (onPointerDown) — pointer is a superset for touch, irrelevant for terminal
- No synthetic focus events from click — click-to-focus is handled by the FocusManager automatically
- No onChange, onSubmit — these are form-level concepts, handled by TextInput/ReadlineInput
