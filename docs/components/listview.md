# ListView

Unified virtualized list with pluggable domain objects for caching, navigation, and search. Replaces `VirtualView`, `VirtualList`, and `ScrollbackList` with a single composable component.

## Import

```tsx
import { ListView, createListCache, createListNavigator, createListSearch, Pane } from "silvery"
```

## Quick Start

```tsx
// Bare list — no navigation, no caching
<ListView items={items} height={20} renderItem={(item) => <Text>{item}</Text>} />

// Navigable list with keyboard + search
<ListView items={items} height={20} navigator search
  renderItem={(item, i, meta) => (
    <Text inverse={meta.isCursor}>{item}</Text>
  )}
/>

// Full-featured: cache frozen prefix, custom search, activation handler
<ListView items={messages}
  height={30}
  getKey={(m) => m.id}
  cache={{ isCacheable: (m) => m.done, capacity: 10_000 }}
  navigator={{ onActivate: (key) => openMessage(key) }}
  search={{ getText: (m) => m.content }}
  followOutput
  renderItem={(msg, i, meta) => <MessageRow msg={msg} cursor={meta.isCursor} />}
/>
```

## Three-Tier Props

The `cache`, `navigator`, and `search` props each accept three forms:

| Form              | What you pass                    | When to use                                        |
| ----------------- | -------------------------------- | -------------------------------------------------- |
| **Boolean**       | `true`                           | Sensible defaults, no external control needed      |
| **Config**        | `{ isCacheable, capacity, ... }` | Customize behavior, ListView owns the instance     |
| **Domain object** | `createListCache(...)`           | Full imperative control from outside the component |

```tsx
// Tier 1: boolean — defaults
<ListView items={items} navigator />

// Tier 2: config — customized
<ListView items={items} navigator={{ onActivate: (key) => open(key) }} />

// Tier 3: domain object — imperative control
const nav = createListNavigator({ onActivate: (key) => open(key) })
nav.moveTo("item-42")
<ListView items={items} navigator={nav} />
```

## Props

### Core

| Prop             | Type                                | Default  | Description                                                     |
| ---------------- | ----------------------------------- | -------- | --------------------------------------------------------------- |
| `items`          | `T[]`                               | required | Array of items to render                                        |
| `height`         | `number`                            | required | Viewport height in rows                                         |
| `renderItem`     | `(item, index, meta) => ReactNode`  | required | Render function. `meta.isCursor` is true at the cursor position |
| `getKey`         | `(item, index) => string \| number` | index    | Key extractor. Required when using cache/navigator/search       |
| `estimateHeight` | `number \| (index) => number`       | `1`      | Estimated item height for virtualization                        |

### Scrolling

| Prop            | Type      | Default | Description                                                            |
| --------------- | --------- | ------- | ---------------------------------------------------------------------- |
| `scrollTo`      | `number`  | —       | Index to scroll to. Ignored when navigator or `followOutput` is active |
| `followOutput`  | `boolean` | `false` | Auto-scroll to end when items are added                                |
| `overscan`      | `number`  | `5`     | Extra items rendered beyond the viewport                               |
| `maxRendered`   | `number`  | `100`   | Maximum items rendered at once                                         |
| `scrollPadding` | `number`  | `2`     | Items from edge before scrolling starts                                |

### Layout

| Prop                | Type              | Default | Description                                                  |
| ------------------- | ----------------- | ------- | ------------------------------------------------------------ |
| `width`             | `number`          | parent  | Viewport width                                               |
| `gap`               | `number`          | `0`     | Gap between items in rows                                    |
| `renderSeparator`   | `() => ReactNode` | —       | Custom separator between items (alternative to `gap`)        |
| `overflowIndicator` | `boolean`         | `false` | Show overflow arrows                                         |
| `listFooter`        | `ReactNode`       | —       | Content rendered after all items inside the scroll container |

### Callbacks

| Prop                    | Type                   | Description                                            |
| ----------------------- | ---------------------- | ------------------------------------------------------ |
| `onWheel`               | `({ deltaY }) => void` | Mouse wheel handler (passive mode only)                |
| `onEndReached`          | `() => void`           | Called when scroll nears the end (infinite scroll)     |
| `onEndReachedThreshold` | `number`               | Items from end to trigger `onEndReached`. Default: `5` |

### Domain Object Props

| Prop        | Type                                           | Description                                                                                            |
| ----------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `cache`     | `true \| ListCacheConfig \| ListCache`         | Frozen-prefix virtualization                                                                           |
| `navigator` | `true \| ListNavigatorConfig \| ListNavigator` | Keyboard cursor navigation                                                                             |
| `search`    | `true \| ListSearchConfig \| ListSearch`       | Ctrl+F incremental search                                                                              |
| `active`    | `boolean`                                      | Whether this ListView handles keyboard input. Default: `true`. Set `false` when another pane has focus |

### Legacy Props (deprecated)

| Prop                  | Replacement                       |
| --------------------- | --------------------------------- |
| `navigable`           | `navigator`                       |
| `cursorIndex`         | `navigator` with `onCursorChange` |
| `onCursorIndexChange` | `navigator` with `onCursorChange` |
| `onSelect`            | `navigator` with `onActivate`     |
| `virtualized`         | `cache` with `isCacheable`        |

---

## Domain Objects

### createListCache(config?)

Manages a contiguous frozen prefix — items at the start of the list that are done/immutable and can be virtualized away. ListView slices them out of the render tree entirely.

```tsx
const cache = createListCache({
  isCacheable: (msg) => msg.status === "delivered",
  capacity: 10_000,
  overscan: 5,
})
```

#### Config

| Option        | Type                       | Default      | Description                               |
| ------------- | -------------------------- | ------------ | ----------------------------------------- |
| `isCacheable` | `(item, index) => boolean` | `() => true` | Predicate for freezing eligibility        |
| `capacity`    | `number`                   | `10_000`     | Max entries before oldest are evicted     |
| `overscan`    | `number`                   | `5`          | Extra items kept beyond the frozen prefix |

#### Properties

| Property      | Type                        | Description                         |
| ------------- | --------------------------- | ----------------------------------- |
| `frozenCount` | `number`                    | Current length of the frozen prefix |
| `config`      | `Required<ListCacheConfig>` | Resolved configuration              |

#### Methods

| Method                  | Description                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `update(items, getKey)` | Recompute frozen prefix. Returns new `frozenCount`. Called automatically by ListView. |
| `getEntry(key)`         | Look up a cached entry by key. Returns `{ key, index }` or `undefined`.               |
| `freeze(key)`           | Imperatively mark an item as frozen (even if `isCacheable` returns false)             |
| `clear()`               | Remove all entries and reset frozen count                                             |
| `invalidateAll()`       | Reset frozen count; next `update()` recomputes from scratch                           |
| `on(event, handler)`    | Subscribe to `"freeze"` or `"evict"` events. Returns unsubscribe function.            |

```tsx
// Imperatively freeze an item
cache.freeze("msg-42")

// Listen for evictions
const unsub = cache.on("evict", (entry) => {
  console.log(`Evicted ${entry.key} at index ${entry.index}`)
})
```

---

### createListNavigator(config?)

Key-based cursor that tracks position by item key, surviving insertions, deletions, and reorders. When the item under the cursor disappears, the cursor moves to the nearest surviving item.

```tsx
const nav = createListNavigator({
  onActivate: (key, index) => openItem(key),
  onCursorChange: (key, index) => preview(key),
  initialIndex: 0,
})
```

#### Config

| Option           | Type                   | Default | Description              |
| ---------------- | ---------------------- | ------- | ------------------------ |
| `onActivate`     | `(key, index) => void` | —       | Called on Enter          |
| `onCursorChange` | `(key, index) => void` | —       | Called when cursor moves |
| `initialIndex`   | `number`               | `0`     | Starting cursor position |

#### Properties

| Property      | Type                            | Description                     |
| ------------- | ------------------------------- | ------------------------------- |
| `cursorIndex` | `number`                        | Current cursor position (index) |
| `cursorKey`   | `string \| number \| undefined` | Key of the item at the cursor   |
| `itemCount`   | `number`                        | Total synced item count         |

#### Methods

| Method                | Description                                                                            |
| --------------------- | -------------------------------------------------------------------------------------- |
| `moveTo(key)`         | Move cursor to the item with the given key                                             |
| `moveToIndex(index)`  | Move cursor to a specific index                                                        |
| `moveBy(delta)`       | Move cursor by delta (`+1` down, `-1` up)                                              |
| `moveToFirst()`       | Jump to first item                                                                     |
| `moveToLast()`        | Jump to last item                                                                      |
| `pageDown(pageSize)`  | Move down by page size                                                                 |
| `pageUp(pageSize)`    | Move up by page size                                                                   |
| `activate()`          | Trigger activation on the current cursor item                                          |
| `sync(items, getKey)` | Update key/index mapping. Handles cursor-disappears. Called automatically by ListView. |
| `on(event, handler)`  | Subscribe to `"cursor"` or `"activate"` events. Returns unsubscribe function.          |

#### Keyboard Bindings (built into ListView)

| Key               | Action        |
| ----------------- | ------------- |
| `j` / `Down`      | Move down     |
| `k` / `Up`        | Move up       |
| `G` / `End`       | Jump to last  |
| `Home`            | Jump to first |
| `PgDn` / `Ctrl+D` | Page down     |
| `PgUp` / `Ctrl+U` | Page up       |
| `Enter`           | Activate      |
| Mouse wheel       | Scroll by 3   |

```tsx
// Move cursor programmatically
nav.moveTo("task-7")

// React to cursor changes from outside
nav.on("cursor", (key, index) => {
  statusBar.setText(`Item ${index + 1} of ${nav.itemCount}`)
})
```

---

### createListSearch(config?)

Incremental search over live (non-cached) items. Opens with Ctrl+F, navigates matches with Enter/Shift+Enter, closes with Escape. Renders a search bar at the bottom of the ListView.

```tsx
const search = createListSearch({
  getText: (msg) => `${msg.sender}: ${msg.body}`,
})
```

#### Config

| Option    | Type               | Default        | Description                          |
| --------- | ------------------ | -------------- | ------------------------------------ |
| `getText` | `(item) => string` | `String(item)` | Extract searchable text from an item |

#### Properties

| Property            | Type                           | Description                                   |
| ------------------- | ------------------------------ | --------------------------------------------- |
| `isActive`          | `boolean`                      | Whether the search overlay is open            |
| `query`             | `string`                       | Current search query                          |
| `matches`           | `ListSearchMatch[]`            | All matching items (`{ itemIndex, itemKey }`) |
| `currentMatchIndex` | `number`                       | Index into `matches` (`-1` when none)         |
| `currentMatch`      | `ListSearchMatch \| undefined` | The current match (convenience)               |

#### Methods

| Method                | Description                                                                       |
| --------------------- | --------------------------------------------------------------------------------- |
| `open()`              | Open the search overlay                                                           |
| `close()`             | Close search and clear results                                                    |
| `search(query)`       | Set query and run search                                                          |
| `next()`              | Jump to next match                                                                |
| `prev()`              | Jump to previous match                                                            |
| `input(char)`         | Append character to query (incremental)                                           |
| `backspace()`         | Delete last character from query                                                  |
| `sync(items, getKey)` | Update the item list. Re-runs search if active. Called automatically by ListView. |
| `subscribe(listener)` | Subscribe to state changes. Returns unsubscribe function.                         |

#### Keyboard Bindings (built into ListView)

| Key           | Action                |
| ------------- | --------------------- |
| `Ctrl+F`      | Open search           |
| `Escape`      | Close search          |
| `Enter`       | Next match            |
| `Shift+Enter` | Previous match        |
| Any character | Appended to query     |
| `Backspace`   | Delete last character |

```tsx
// Programmatic search
search.open()
search.search("error")
if (search.currentMatch) {
  nav.moveToIndex(search.currentMatch.itemIndex)
}
```

---

## Pane

Focusable wrapper with a border that highlights when focus is within its subtree. Designed for multi-pane layouts.

```tsx
<Box flexDirection="row">
  <Pane title="Messages">
    <ListView items={messages} height={20} navigator active={leftFocused} ... />
  </Pane>
  <Pane title="Preview">
    <Text>{selectedMessage.body}</Text>
  </Pane>
</Box>
```

### Props

| Prop       | Type               | Default            | Description               |
| ---------- | ------------------ | ------------------ | ------------------------- |
| `title`    | `string`           | —                  | Label shown in the border |
| `children` | `ReactNode`        | required           | Pane content              |
| `testID`   | `string`           | derived from title | ID for focus management   |
| `width`    | `number \| string` | —                  | Pane width                |
| `height`   | `number \| string` | —                  | Pane height               |
| `flexGrow` | `number`           | `1`                | Flex grow factor          |

Uses `useFocusWithin()` internally — the border color switches from `$border` to `$primary` when any descendant has focus.

---

## Migration from Old Components

| Old component                                      | v5 equivalent                                                   |
| -------------------------------------------------- | --------------------------------------------------------------- |
| `<VirtualView items={items} renderItem={fn} />`    | `<ListView items={items} renderItem={fn} />`                    |
| `<VirtualList items={items} renderItem={fn} />`    | `<ListView items={items} navigator renderItem={fn} />`          |
| `<ScrollbackList items={items} renderItem={fn} />` | `<ListView items={items} cache followOutput renderItem={fn} />` |
| Custom `virtualized` predicate                     | `cache={{ isCacheable: predicate }}`                            |
| `navigable` + `onSelect`                           | `navigator={{ onActivate: handler }}`                           |
| `cursorIndex` + `onCursorIndexChange`              | `navigator={{ onCursorChange: handler, initialIndex }}`         |

---

## Examples

### Navigable List with Activation

```tsx
function FileList({ files, onOpen }: { files: File[]; onOpen: (id: string) => void }) {
  return (
    <ListView
      items={files}
      height={20}
      getKey={(f) => f.id}
      navigator={{ onActivate: (key) => onOpen(String(key)) }}
      renderItem={(file, _i, meta) => (
        <Text inverse={meta.isCursor}>
          {meta.isCursor ? "> " : "  "}
          {file.name}
        </Text>
      )}
    />
  )
}
```

### Chat Log with Frozen History

```tsx
function ChatLog({ messages }: { messages: Message[] }) {
  return (
    <ListView
      items={messages}
      height={30}
      getKey={(m) => m.id}
      cache={{ isCacheable: (m) => m.status === "delivered" }}
      search={{ getText: (m) => m.text }}
      followOutput
      renderItem={(msg) => (
        <Text>
          <Text bold>{msg.sender}</Text>: {msg.text}
        </Text>
      )}
    />
  )
}
```

### Multi-Pane Layout

```tsx
function MailClient() {
  const nav = createListNavigator({
    onActivate: (key) => setSelected(String(key)),
  })
  const [selected, setSelected] = useState<string | null>(null)
  const selectedMsg = messages.find((m) => m.id === selected)

  return (
    <Box flexDirection="row" height="100%">
      <Pane title="Inbox">
        <ListView
          items={messages}
          height={20}
          getKey={(m) => m.id}
          navigator={nav}
          search={{ getText: (m) => m.subject }}
          renderItem={(msg, _i, meta) => <Text inverse={meta.isCursor}>{msg.subject}</Text>}
        />
      </Pane>
      <Pane title="Message">
        {selectedMsg ? <Text>{selectedMsg.body}</Text> : <Text color="$muted">Select a message</Text>}
      </Pane>
    </Box>
  )
}
```

### External Domain Object Control

```tsx
function TaskBoard() {
  const cache = createListCache<Task>({
    isCacheable: (t) => t.status === "done",
  })
  const nav = createListNavigator()
  const search = createListSearch<Task>({ getText: (t) => t.title })

  // Imperative control from outside
  function archiveCompleted() {
    cache.clear()
  }

  function jumpToTask(id: string) {
    nav.moveTo(id)
  }

  return (
    <ListView
      items={tasks}
      height={25}
      getKey={(t) => t.id}
      cache={cache}
      navigator={nav}
      search={search}
      renderItem={(task, _i, meta) => (
        <Text inverse={meta.isCursor}>
          [{task.status}] {task.title}
        </Text>
      )}
    />
  )
}
```

## Ref API

`ListView` accepts a ref with imperative methods:

```tsx
const listRef = useRef<ListViewHandle>(null)

// Scroll to a specific item
listRef.current?.scrollToItem(42)

<ListView ref={listRef} items={items} height={20} renderItem={fn} />
```

| Method                | Description                                            |
| --------------------- | ------------------------------------------------------ |
| `scrollToItem(index)` | Imperatively scroll to bring item at `index` into view |
