# Components

## Box

Flexbox container with borders, padding, and overflow control.

```tsx
<Box flexDirection="column" padding={1} borderStyle="single">
  <Text>Content</Text>
</Box>
```

Box supports all standard flexbox props: `flexDirection`, `flexGrow`, `flexShrink`, `flexBasis`, `alignItems`, `alignSelf`, `justifyContent`, `flexWrap`, `width`, `height`, `minWidth`, `minHeight`, `maxWidth`, `maxHeight`, `padding`, `paddingX`, `paddingY`, `margin`, `gap`, `borderStyle`, `borderColor`, `overflow`.

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
