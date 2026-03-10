<script setup>
import LiveDemo from '../.vitepress/components/LiveDemo.vue'
</script>

# Components

Silvery provides layout, text, input, and display components for building terminal UIs.

<LiveDemo xtermSrc="/examples/showcase.html?demo=text-input" :height="250" />

## Box

The primary layout component. Uses Yoga (flexbox) for layout.

```tsx
import { Box, Text } from "silvery";
<Box flexDirection="row" justifyContent="space-between">
  <Text>Left</Text>
  <Text>Right</Text>
</Box>;
```

### Scrolling

Use `overflow="scroll"` with `scrollTo` for automatic scrolling:

```tsx
<Box flexDirection="column" overflow="scroll" scrollTo={selectedIndex}>
  {items.map((item, i) => (
    <Text key={i} inverse={i === selectedIndex}>
      {item}
    </Text>
  ))}
</Box>
```

See [Scrolling Guide](/guide/scrolling) for details.

### Props

| Prop             | Type                                                                          | Default        | Description                 |
| ---------------- | ----------------------------------------------------------------------------- | -------------- | --------------------------- |
| `flexDirection`  | `"row" \| "column" \| "row-reverse" \| "column-reverse"`                      | `"row"`        | Main axis direction         |
| `flexGrow`       | `number`                                                                      | `0`            | Grow factor                 |
| `flexShrink`     | `number`                                                                      | `1`            | Shrink factor               |
| `flexBasis`      | `number \| string`                                                            | -              | Initial size                |
| `justifyContent` | `"flex-start" \| "flex-end" \| "center" \| "space-between" \| "space-around"` | `"flex-start"` | Main axis alignment         |
| `alignItems`     | `"flex-start" \| "flex-end" \| "center" \| "stretch"`                         | `"stretch"`    | Cross axis alignment        |
| `padding`        | `number`                                                                      | `0`            | Padding on all sides        |
| `paddingX`       | `number`                                                                      | `0`            | Horizontal padding          |
| `paddingY`       | `number`                                                                      | `0`            | Vertical padding            |
| `margin`         | `number`                                                                      | `0`            | Margin on all sides         |
| `width`          | `number \| string`                                                            | -              | Fixed or percentage width   |
| `height`         | `number \| string`                                                            | -              | Fixed or percentage height  |
| `minWidth`       | `number`                                                                      | -              | Minimum width               |
| `minHeight`      | `number`                                                                      | -              | Minimum height              |
| `borderStyle`    | `"single" \| "double" \| "round" \| "bold" \| "classic"`                      | -              | Border style                |
| `borderColor`    | `string`                                                                      | -              | Border color                |
| `overflow`       | `"visible" \| "hidden" \| "scroll"`                                           | `"visible"`    | Overflow behavior           |
| `scrollTo`       | `number`                                                                      | -              | Child index to keep visible |

## Text

Renders text with styling. Supports Chalk strings.

```tsx
import { Text } from "silvery";
import chalk from "chalk";

// Basic styling
<Text color="green" bold>Success!</Text>

// Chalk strings work too
<Text>{chalk.red.bold("Error!")}</Text>
```

### Auto-Truncation

Text automatically truncates to fit available width:

```tsx
<Box width={20}>
  <Text>This is a very long text that will be truncated</Text>
</Box>
// Output: "This is a very lon…"
```

Opt out with `wrap={false}` if you need overflow behavior.

### Props

| Prop              | Type                                                                              | Default      | Description                |
| ----------------- | --------------------------------------------------------------------------------- | ------------ | -------------------------- |
| `color`           | `string`                                                                          | -            | Text color                 |
| `backgroundColor` | `string`                                                                          | -            | Background color           |
| `bold`            | `boolean`                                                                         | `false`      | Bold text                  |
| `italic`          | `boolean`                                                                         | `false`      | Italic text                |
| `underline`       | `boolean`                                                                         | `false`      | Underlined text            |
| `strikethrough`   | `boolean`                                                                         | `false`      | Strikethrough text         |
| `dimColor`        | `boolean`                                                                         | `false`      | Dimmed color               |
| `inverse`         | `boolean`                                                                         | `false`      | Swap foreground/background |
| `wrap`            | `"wrap" \| "truncate" \| "truncate-start" \| "truncate-middle" \| "truncate-end"` | `"truncate"` | Text wrapping behavior     |

## Newline

Renders a newline character.

```tsx
import { Newline, Text } from "silvery";

<Text>Line 1</Text>
<Newline />
<Text>Line 2</Text>
```

## Spacer

Flexible space that expands to fill available room.

```tsx
import { Box, Spacer, Text } from "silvery";
<Box>
  <Text>Left</Text>
  <Spacer />
  <Text>Right</Text>
</Box>;
```

## Static

Renders content that won't be updated. Useful for logs or output that scrolls up.

```tsx
import { Static, Box, Text } from "silvery";

function App() {
  const [logs, setLogs] = useState<string[]>([]);

  return (
    <Box flexDirection="column">
      <Static items={logs}>{(log, i) => <Text key={i}>{log}</Text>}</Static>
      <Text>Current status...</Text>
    </Box>
  );
}
```

### Props

| Prop       | Type                                    | Description              |
| ---------- | --------------------------------------- | ------------------------ |
| `items`    | `T[]`                                   | Array of items to render |
| `children` | `(item: T, index: number) => ReactNode` | Render function          |

## Input Components

### TextInput

Single-line text input with full readline shortcuts (Ctrl+A/E, Ctrl+K/U, Alt+B/F, Ctrl+Y with kill ring).

```tsx
import { TextInput } from "silvery";
<TextInput
  value={text}
  onChange={setText}
  onSubmit={handleSubmit}
  placeholder="Type here..."
  prompt="> "
/>;
```

### TextArea

Multi-line text editing with cursor navigation, line wrapping, and text selection.

```tsx
import { TextArea } from "silvery";
<TextArea
  value={text}
  onChange={setText}
  height={5}
  placeholder="Type here..."
  submitKey="ctrl+enter"
  onSubmit={handleSubmit}
  scrollMargin={1}
/>;
```

| Prop           | Type                                      | Default        | Description                                     |
| -------------- | ----------------------------------------- | -------------- | ----------------------------------------------- |
| `value`        | `string`                                  | -              | Current value (controlled)                      |
| `defaultValue` | `string`                                  | -              | Initial value (uncontrolled)                    |
| `onChange`     | `(value: string) => void`                 | -              | Called when value changes                       |
| `onSubmit`     | `(value: string) => void`                 | -              | Called on submit key press                      |
| `submitKey`    | `"ctrl+enter" \| "enter" \| "meta+enter"` | `"ctrl+enter"` | Key combo to trigger submit                     |
| `height`       | `number`                                  | **required**   | Visible height in rows                          |
| `placeholder`  | `string`                                  | -              | Placeholder text when empty                     |
| `isActive`     | `boolean`                                 | -              | Override focus system                           |
| `cursorStyle`  | `"block" \| "underline"`                  | `"block"`      | Unfocused cursor style                          |
| `scrollMargin` | `number`                                  | `1`            | Context lines above/below cursor when scrolling |
| `disabled`     | `boolean`                                 | `false`        | Ignore input and dim text                       |
| `maxLength`    | `number`                                  | -              | Maximum character count                         |
| `testID`       | `string`                                  | -              | Test ID for focus system                        |

Features: Shift+Arrow selection, Ctrl+A select all, Ctrl+Home/End document navigation, word-wise movement (Ctrl+Arrow), readline shortcuts (Ctrl+K/U/Y), column memory for vertical movement.

### SelectList

Single-select list with keyboard navigation (arrow keys, j/k, Home/End), disabled item support, and `maxVisible` for scroll windowing.

```tsx
import { SelectList } from "silvery";
<SelectList
  items={[
    { label: "React", value: "react" },
    { label: "Vue", value: "vue" },
    { label: "Svelte", value: "svelte" },
  ]}
  onSelect={(item) => console.log(item.value)}
/>;
```

### Toggle, Button

Simple interactive primitives for boolean toggles and clickable buttons.

## Display Components

| Component     | Description                                                |
| ------------- | ---------------------------------------------------------- |
| `Spinner`     | Animated spinner with presets (dots, line, arc, bounce)    |
| `ProgressBar` | Determinate and indeterminate progress with custom fill    |
| `Table`       | Column-aligned table with header, per-column alignment     |
| `Badge`       | Styled label/tag                                           |
| `Divider`     | Horizontal rule                                            |
| `VirtualList` | O(1) scroll for thousands of items (fixed/variable height) |
| `VirtualView` | Virtualized arbitrary content                              |
| `Console`     | Captures `console.log` output via `patchConsole()`         |
| `Transform`   | Per-line string transformation on children                 |
| `Image`       | Kitty graphics / Sixel with text fallback                  |
| `Link`        | OSC 8 hyperlink                                            |

## Shadcn-Style Components

Higher-level pre-styled components using `$token` semantic colors. Import from `silvery`:

| Component                               | Description                                          |
| --------------------------------------- | ---------------------------------------------------- |
| `Form` / `FormField`                    | Form layout with label, description, error message   |
| `Toast` / `useToast()`                  | Auto-dismiss notifications with severity levels      |
| `CommandPalette`                        | Fuzzy-search command palette (Ctrl+K pattern)        |
| `TreeView`                              | Expandable/collapsible tree with keyboard navigation |
| `Breadcrumb`                            | Path breadcrumb with separator customization         |
| `Tabs` / `TabList` / `Tab` / `TabPanel` | Tabbed interface with keyboard navigation            |
| `Tooltip`                               | Contextual tooltip overlay                           |
| `Skeleton`                              | Loading placeholder with configurable width/lines    |
| `ErrorBoundary`                         | React error boundary with `resetKeys` and `fallback` |
| `ModalDialog`                           | Modal overlay with focus trapping                    |
| `PickerDialog` / `PickerList`           | Selection dialog                                     |

These components use the theming system — wrap your app in `ThemeProvider` with `defaultDarkTheme` or `defaultLightTheme` and the components will use semantic colors automatically. Any color prop starting with `$` is resolved against the active theme (e.g. `color="$primary"`, `backgroundColor="$surface"`).

## @silvery/ui — Progress & Input Package

`@silvery/ui` is a separate package with progress indicators and ergonomic async wrappers. It works both as standalone CLI output (no React) and as React components inside Silvery apps.

::: code-group

```bash [npm]
npm install @silvery/ui
```

```bash [bun]
bun add @silvery/ui
```

```bash [pnpm]
pnpm add @silvery/ui
```

```bash [yarn]
yarn add @silvery/ui
```

:::

**CLI mode** (direct stdout, no React):

```ts
import { Spinner, ProgressBar, MultiProgress } from "@silvery/ui/cli";

const stop = Spinner.start("Loading...");
await doWork();
stop();
```

**Wrappers** (ergonomic async adapters):

```ts
import { withSpinner, withProgress } from "@silvery/ui/wrappers";

const data = await withSpinner(fetchData(), "Loading data...");
```

**Declarative steps**:

```ts
import { steps } from "@silvery/ui/progress";

const loader = steps({ loadModules, parseConfig, validate });
await loader.run({ clear: true });
```

**React components** (for Silvery/Ink apps):

```tsx
import { Spinner, ProgressBar, Tasks, Task } from "@silvery/ui/react";
import { TextInput, Select } from "@silvery/ui/input";
```

See the [@silvery/ui README](https://github.com/beorn/silvery/tree/main/packages/ui) for full documentation.
