# Components

## Box

Flexbox container with borders, padding, and overflow control.

```tsx
<Box flexDirection="column" padding={1} borderStyle="single">
  <Text>Content</Text>
</Box>
```

Box supports all standard flexbox props: `flexDirection`, `flexGrow`, `flexShrink`, `flexBasis`, `alignItems`, `alignSelf`, `justifyContent`, `flexWrap`, `width`, `height`, `minWidth`, `minHeight`, `maxWidth`, `maxHeight`, `padding`, `paddingX`, `paddingY`, `margin`, `gap`, `borderStyle`, `borderColor`, `overflow`.

### Outline Props

Box supports outline props — the CSS outline equivalent. Unlike `borderStyle`, which adds border dimensions to the layout (making the content area smaller), outline renders border characters that overlap the content area. The layout engine sees no border at all — outline is purely visual.

```tsx
<Box outlineStyle="single" outlineColor="cyan">
  <Text>Framed without layout impact</Text>
</Box>
```

| Prop              | Type          | Description                                              |
| ----------------- | ------------- | -------------------------------------------------------- |
| `outlineStyle`    | `BorderStyle` | Outline border style (single, double, round, bold, etc.) |
| `outlineColor`    | `string`      | Foreground color for the outline                         |
| `outlineDimColor` | `boolean`     | Apply dim styling to the outline                         |

Use outline when you need to visually frame a box without shifting its content or affecting the layout of sibling elements.

### Focus Props

Box supports tree-based focus management via the following props:

| Prop             | Type      | Description                                            |
| ---------------- | --------- | ------------------------------------------------------ |
| `focusable`      | `boolean` | Node can receive focus (required for `useFocusable()`) |
| `autoFocus`      | `boolean` | Focus this node on mount                               |
| `focusScope`     | `boolean` | Creates a focus scope (Tab cycles within this subtree) |
| `nextFocusUp`    | `string`  | testID to focus when pressing Up from this node        |
| `nextFocusDown`  | `string`  | testID to focus when pressing Down from this node      |
| `nextFocusLeft`  | `string`  | testID to focus when pressing Left from this node      |
| `nextFocusRight` | `string`  | testID to focus when pressing Right from this node     |

```tsx
<Box testID="panel" focusable autoFocus borderStyle="single">
  <Text>This panel receives focus on mount</Text>
</Box>

<Box testID="scope" focusScope>
  <Box testID="a" focusable><Text>A</Text></Box>
  <Box testID="b" focusable><Text>B</Text></Box>
  {/* Tab cycles between A and B within this scope */}
</Box>
```

### Mouse Event Props

Box and Text support DOM-compatible mouse events:

| Prop            | Event Type       | Bubbles |
| --------------- | ---------------- | ------- |
| `onClick`       | `InkxMouseEvent` | Yes     |
| `onDoubleClick` | `InkxMouseEvent` | Yes     |
| `onMouseDown`   | `InkxMouseEvent` | Yes     |
| `onMouseUp`     | `InkxMouseEvent` | Yes     |
| `onMouseMove`   | `InkxMouseEvent` | Yes     |
| `onMouseEnter`  | `InkxMouseEvent` | No      |
| `onMouseLeave`  | `InkxMouseEvent` | No      |
| `onWheel`       | `InkxWheelEvent` | Yes     |

### Focus Event Props

| Prop               | Event Type       | Description                        |
| ------------------ | ---------------- | ---------------------------------- |
| `onFocus`          | `InkxFocusEvent` | Called when this node gains focus  |
| `onBlur`           | `InkxFocusEvent` | Called when this node loses focus  |
| `onKeyDown`        | `InkxKeyEvent`   | Called on key down (bubble phase)  |
| `onKeyUp`          | `InkxKeyEvent`   | Called on key up (bubble phase)    |
| `onKeyDownCapture` | `InkxKeyEvent`   | Called on key down (capture phase) |

### Scrollable Containers

```tsx
<Box overflow="scroll" height={10} scrollTo={selectedIndex}>
  {items.map((item, i) => (
    <Text key={i}>{item.name}</Text>
  ))}
</Box>
```

## Text

Styled text with auto-truncation.

```tsx
<Text color="green" bold>Success</Text>
<Text underlineStyle="curly" underlineColor="red">Error</Text>
```

### Text Style Props

| Prop              | Type           | Description                                                       |
| ----------------- | -------------- | ----------------------------------------------------------------- |
| `color`           | string         | Foreground color (named, hex, or rgb())                           |
| `backgroundColor` | string         | Background color                                                  |
| `bold`            | boolean        | Bold text                                                         |
| `dim`             | boolean        | Dimmed text                                                       |
| `italic`          | boolean        | Italic text                                                       |
| `underline`       | boolean        | Simple underline                                                  |
| `underlineStyle`  | UnderlineStyle | `'single'` \| `'double'` \| `'curly'` \| `'dotted'` \| `'dashed'` |
| `underlineColor`  | string         | Underline color (independent of text color)                       |
| `strikethrough`   | boolean        | Strikethrough text                                                |
| `inverse`         | boolean        | Swap foreground/background                                        |

Text auto-truncates by default. Use `wrap="wrap"` to wrap instead, or `wrap="overflow"` to allow overflow.

## VirtualList

Efficient rendering for large lists (100+ items). Only renders visible items.

```tsx
<VirtualList
  items={cards}
  height={20}
  itemHeight={1}
  scrollTo={selectedIndex}
  renderItem={(card, index) => <Text key={card.id}>{card.name}</Text>}
/>
```

### Frozen Items (Scrollback)

VirtualList supports a `frozen` prop that excludes a contiguous prefix of items from rendering. Pair with `useScrollback` to push frozen items to terminal scrollback:

```tsx
const frozenCount = useScrollback(items, {
  frozen: (item) => item.complete,
  render: (item) => `  ✓ ${item.title}`,
})

<VirtualList
  items={items}
  frozen={(item) => item.complete}
  renderItem={(item) => <Text>{item.title}</Text>}
/>
```

## Static

Renders content once above the dynamic output. Useful for completed items in a stream.

```tsx
<Static items={completedTasks}>{(task) => <Text key={task.id}>✓ {task.name}</Text>}</Static>
```

## Viewport Architecture

Four composable primitives for different rendering modes. See [docs/design/viewport-architecture.md](../design/viewport-architecture.md) for the full design.

### Screen

Fullscreen root component. Claims the full terminal dimensions for flexbox layout.

```tsx
<Screen>
  <Sidebar />
  <MainContent />
  <StatusBar />
</Screen>
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `flexDirection` | `string` | `"column"` | Flex direction for layout |

### ScrollView

Native scrollback root component. Items flow vertically and transition through Live → Virtualized → Static as they scroll off-screen. Uses `useScrollbackItem()` for per-item lifecycle control.

```tsx
<ScrollView
  items={tasks}
  keyExtractor={(t) => t.id}
  isFrozen={(t) => t.done}
  footer={<Text>Status bar</Text>}
>
  {(task) => <TaskItem task={task} />}
</ScrollView>
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `items` | `T[]` | required | Items to render |
| `children` | `(item, index) => ReactNode` | required | Render function |
| `keyExtractor` | `(item, index) => string \| number` | required | Unique key per item |
| `isFrozen` | `(item, index) => boolean` | — | Data-driven freeze predicate |
| `footer` | `ReactNode` | — | Pinned footer |
| `footerHeight` | `number` | `1` | Footer height in rows |
| `maxHistory` | `number` | `10000` | Max lines in dynamic scrollback |
| `markers` | `boolean \| object` | — | OSC 133 semantic markers |

### VirtualScrollView

App-managed scrolling within a Screen rectangle. Items mount/unmount based on scroll position.

```tsx
<Screen>
  <Header />
  <VirtualScrollView
    items={logs}
    height={20}
    estimateHeight={3}
    scrollTo={selectedIndex}
    renderItem={(item) => <LogEntry data={item} />}
  />
  <StatusBar />
</Screen>
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `items` | `T[]` | required | Items to render |
| `height` | `number` | required | Viewport height in rows |
| `renderItem` | `(item, index) => ReactNode` | required | Render function |
| `estimateHeight` | `number \| (index) => number` | `1` | Item height estimate |
| `scrollTo` | `number` | — | Index to scroll to |
| `overscan` | `number` | `5` | Extra items beyond viewport |
| `maxRendered` | `number` | `100` | Max items to render |
| `scrollPadding` | `number` | `2` | Edge padding before scrolling |
| `overflowIndicator` | `boolean` | `false` | Show ▲N/▼N indicators |
| `keyExtractor` | `(item, index) => string \| number` | — | Key extractor |

### useVirtualizer

Headless virtualization engine shared by ScrollView and VirtualScrollView. Count-based API inspired by TanStack Virtual.

```tsx
const { range, scrollToItem, getKey } = useVirtualizer({
  count: items.length,
  estimateHeight: 3,
  viewportHeight: 20,
  scrollTo: selectedIndex,
  overscan: 5,
})
```

## Console

Captures `console.log` / `console.error` output and renders it as a component.

```tsx
import { render, Console, patchConsole } from "inkx"

function App({ console: patched }) {
  return (
    <Box flexDirection="column">
      <Console console={patched} />
      <Text>Status: running</Text>
    </Box>
  )
}

using patched = patchConsole(console)
await render(<App console={patched} />, term)
```

## TextInput

Basic text input with onChange/onSubmit:

```tsx
import { TextInput } from "inkx"
;<TextInput
  value={query}
  onChange={setQuery}
  onSubmit={(value) => console.log("Submitted:", value)}
  placeholder="type here..."
/>
```

## ReadlineInput

Text input with full readline shortcuts (Ctrl+A/E start/end, Ctrl+W delete word, Ctrl+K kill to end, Ctrl+Y yank):

```tsx
import { ReadlineInput } from "inkx"
;<ReadlineInput value={command} onChange={setCommand} onSubmit={executeCommand} prompt="$ " />
```

## TextArea

Multi-line text input with word wrapping, scrolling, and cursor movement.

```tsx
import { TextArea } from "inkx"

const [value, setValue] = useState("")
<TextArea
  value={value}
  onChange={setValue}
  onSubmit={(val) => console.log("Submitted:", val)}
  height={10}
  placeholder="Type here..."
/>
```

| Prop           | Type                      | Description                          |
| -------------- | ------------------------- | ------------------------------------ |
| `value`        | `string`                  | Current value (controlled)           |
| `defaultValue` | `string`                  | Initial value (uncontrolled)         |
| `onChange`     | `(value: string) => void` | Called when value changes            |
| `onSubmit`     | `(value: string) => void` | Called on submit                     |
| `submitKey`    | `"ctrl+enter" \| "enter"` | Submit key (default: `"ctrl+enter"`) |
| `placeholder`  | `string`                  | Placeholder text when empty          |
| `isActive`     | `boolean`                 | Whether input is focused             |
| `height`       | `number`                  | Visible height in rows (required)    |
| `cursorStyle`  | `"block" \| "underline"`  | Cursor style (default: `"block"`)    |

Keyboard shortcuts: Arrow keys, Home/End, Ctrl+A/E (line start/end), Ctrl+K/U (kill line), PageUp/PageDown, Backspace/Delete.

## Link

Renders a terminal hyperlink using OSC 8 escape sequences. In supporting terminals (iTerm2, Ghostty, Kitty, etc.), the text is clickable. Also registers an `onClick` handler for mouse-driven interaction within inkx.

```tsx
import { Link } from "inkx"

<Link href="https://example.com">Visit Example</Link>
<Link href="https://example.com" color="green">Green Link</Link>
<Link href="km://node/abc123" onClick={(e) => navigate(e)}>Internal Link</Link>
```

| Prop        | Type                              | Description                                       |
| ----------- | --------------------------------- | ------------------------------------------------- |
| `href`      | `string`                          | URL (http/https, or custom scheme)                |
| `children`  | `ReactNode`                       | Link text content                                 |
| `color`     | `string`                          | Text color (default: `"blue"`)                    |
| `underline` | `boolean`                         | Underline the link (default: `true`)              |
| `onClick`   | `(event: InkxMouseEvent) => void` | Click handler (preventDefault to skip navigation) |
| `testID`    | `string`                          | Test ID for locator queries                       |

## Transform

Applies a string transformation to each line of rendered text output. Compatible with Ink's Transform component.

```tsx
import { Transform, Text } from "inkx"

// Uppercase all text
<Transform transform={output => output.toUpperCase()}>
  <Text>Hello World</Text>
</Transform>

// Add line numbers
<Transform transform={(line, index) => `${index + 1}: ${line}`}>
  <Text>First line{'\n'}Second line</Text>
</Transform>
```

| Prop        | Type                                      | Description                             |
| ----------- | ----------------------------------------- | --------------------------------------- |
| `transform` | `(line: string, index: number) => string` | Function applied to each line of output |
| `children`  | `ReactNode`                               | Text content to transform               |

The transform should not change the dimensions of the output (e.g., adding characters that change line width) — otherwise layout will be incorrect.

## Image

Renders a bitmap image in the terminal using Kitty graphics or Sixel protocol, with automatic protocol detection and text fallback.

```tsx
import { Image } from "inkx"

// From a PNG buffer
<Image src={pngBuffer} width={40} height={15} />

// From a file path
<Image src="/path/to/image.png" width={60} />

// With explicit protocol and custom fallback
<Image src={data} protocol="sixel" fallback="[photo]" />
```

| Prop       | Type                           | Description                                                                        |
| ---------- | ------------------------------ | ---------------------------------------------------------------------------------- |
| `src`      | `Buffer \| string`             | PNG image data (Buffer) or file path to a PNG file                                 |
| `width`    | `number`                       | Width in terminal columns (default: available width from layout)                   |
| `height`   | `number`                       | Height in terminal rows (default: half the width for rough aspect ratio)           |
| `fallback` | `string`                       | Text to display when image rendering is not supported (default: `"[image]"`)       |
| `protocol` | `"kitty" \| "sixel" \| "auto"` | Which protocol to use (default: `"auto"` — tries Kitty, then Sixel, then fallback) |

The component operates in two phases: during layout it renders a Box that reserves the visual space, then after render it writes the image escape sequence directly to stdout, positioned over the reserved space.

**Protocol detection helpers:**

```tsx
import { isKittyGraphicsSupported, isSixelSupported } from "inkx"

if (isKittyGraphicsSupported()) {
  /* Kitty graphics available */
}
if (isSixelSupported()) {
  /* Sixel available */
}
```

**Low-level encoding functions:**

```tsx
import { encodeKittyImage, deleteKittyImage } from "inkx"
import { encodeSixel } from "inkx"

const kittySeq = encodeKittyImage(pngBuffer, { id: 1, cols: 40, rows: 15 })
const deleteSeq = deleteKittyImage(1)
const sixelSeq = encodeSixel({ pixels, width: 320, height: 240 })
```

## Spinner

An animated loading spinner with multiple built-in styles.

```tsx
import { Spinner } from "inkx"

<Spinner />
<Spinner type="arc" label="Loading..." />
<Spinner type="bounce" interval={120} />
```

| Prop       | Type                                    | Description                              |
| ---------- | --------------------------------------- | ---------------------------------------- |
| `type`     | `"dots" \| "line" \| "arc" \| "bounce"` | Spinner style preset (default: `"dots"`) |
| `label`    | `string`                                | Label text shown after spinner           |
| `interval` | `number`                                | Animation interval in ms (default: 80)   |

## ProgressBar

A terminal progress bar with determinate and indeterminate modes.

```tsx
import { ProgressBar } from "inkx"

<ProgressBar value={0.5} />
<ProgressBar value={0.75} color="green" label="Downloading..." />
<ProgressBar />  {/* indeterminate (animated bounce) */}
```

| Prop             | Type      | Description                                        |
| ---------------- | --------- | -------------------------------------------------- |
| `value`          | `number`  | Progress 0-1 (omit for indeterminate)              |
| `width`          | `number`  | Width in columns (default: available via layout)   |
| `fillChar`       | `string`  | Fill character (default: `"█"`)                    |
| `emptyChar`      | `string`  | Empty character (default: `"░"`)                   |
| `showPercentage` | `boolean` | Show percentage label (default: true if value set) |
| `label`          | `string`  | Label text before the bar                          |
| `color`          | `string`  | Color of the filled portion                        |

## SelectList

A keyboard-navigable single-select list with controlled and uncontrolled modes.

```tsx
import { SelectList } from "inkx"

const items = [
  { label: "Apple", value: "apple" },
  { label: "Banana", value: "banana" },
  { label: "Cherry", value: "cherry", disabled: true },
]

<SelectList items={items} onSelect={(opt) => console.log(opt.value)} />
```

| Prop               | Type                                            | Description                                      |
| ------------------ | ----------------------------------------------- | ------------------------------------------------ |
| `items`            | `SelectOption[]`                                | List of options (`{ label, value, disabled? }`)  |
| `highlightedIndex` | `number`                                        | Controlled: current highlighted index            |
| `onHighlight`      | `(index: number) => void`                       | Called when highlight changes                    |
| `onSelect`         | `(option: SelectOption, index: number) => void` | Called on Enter to confirm selection             |
| `initialIndex`     | `number`                                        | Initial index for uncontrolled mode              |
| `maxVisible`       | `number`                                        | Max visible items (scrolls the rest)             |
| `isActive`         | `boolean`                                       | Whether this list captures input (default: true) |

Keyboard: `j`/`Down` to move down, `k`/`Up` to move up, `Enter` to select, `Ctrl+A` for first, `Ctrl+E` for last. Disabled items are skipped.

## Table

A data table with headers, column alignment, and auto-sized columns.

```tsx
import { Table } from "inkx"
;<Table
  columns={[
    { header: "Name", key: "name" },
    { header: "Age", key: "age", align: "right" },
  ]}
  data={[
    { name: "Alice", age: 30 },
    { name: "Bob", age: 25 },
  ]}
/>
```

| Prop         | Type                                          | Description                                             |
| ------------ | --------------------------------------------- | ------------------------------------------------------- |
| `columns`    | `TableColumn[]`                               | Column definitions (`{ header, key?, width?, align? }`) |
| `data`       | `Array<Record<string, unknown> \| unknown[]>` | Data rows (objects or arrays)                           |
| `showHeader` | `boolean`                                     | Show header row (default: true)                         |
| `separator`  | `string`                                      | Column separator (default: `" │ "`)                     |
| `headerBold` | `boolean`                                     | Bold header text (default: true)                        |

Column `align` supports `"left"` (default), `"right"`, and `"center"`. Columns auto-size to fit content when `width` is omitted.

## Badge

A small inline label for status display.

```tsx
import { Badge } from "inkx"

<Badge label="Active" variant="success" />
<Badge label="Warning" variant="warning" />
<Badge label="Custom" color="magenta" />
```

| Prop      | Type                                                          | Description                          |
| --------- | ------------------------------------------------------------- | ------------------------------------ |
| `label`   | `string`                                                      | Badge text                           |
| `variant` | `"default" \| "primary" \| "success" \| "warning" \| "error"` | Color variant (default: `"default"`) |
| `color`   | `string`                                                      | Custom color (overrides variant)     |

## Divider

A horizontal separator line with optional centered title.

```tsx
import { Divider } from "inkx"

<Divider />
<Divider title="Section" />
<Divider char="=" width={40} />
```

| Prop    | Type     | Description                                      |
| ------- | -------- | ------------------------------------------------ |
| `char`  | `string` | Character to repeat (default: `"─"`)             |
| `title` | `string` | Title text centered in the divider               |
| `width` | `number` | Width in columns (default: available via layout) |

## Newline

Inserts a line break:

```tsx
<Text>First line</Text>
<Newline />
<Text>Second line</Text>
```

## Spacer

Fills available space (equivalent to `flexGrow: 1`):

```tsx
<Box>
  <Text>Left</Text>
  <Spacer />
  <Text>Right</Text>
</Box>
```
