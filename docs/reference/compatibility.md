# Ink/Chalk Compatibility

Silvery provides compatibility layers for both Ink and Chalk, making migration straightforward. This reference documents the complete API mapping.

## Ink Compatibility

### Import Mapping

```diff
- import { Box, Text, render, useInput, useApp } from 'ink';
+ import { Box, Text, render, useInput, useApp } from 'silvery';

- import { render } from 'ink-testing-library';
+ import { render } from '@silvery/test';
```

Or use the explicit compat layer:

```tsx
import { Box, Text, render } from "silvery/ink"
```

### Component Compatibility

| Component     | Ink       | Silvery   | Notes              |
| ------------- | --------- | --------- | ------------------ |
| `<Box>`       | Supported | Supported | Same flexbox props |
| `<Text>`      | Supported | Supported | Added `wrap` prop  |
| `<Newline>`   | Supported | Supported | Identical          |
| `<Spacer>`    | Supported | Supported | Identical          |
| `<Static>`    | Supported | Supported | Identical          |
| `<Transform>` | Supported | Supported | Identical          |

### Hook Compatibility

| Hook                | Ink       | Silvery   | Notes                                |
| ------------------- | --------- | --------- | ------------------------------------ |
| `useInput()`        | Supported | Supported | Same callback signature              |
| `useApp()`          | Supported | Supported | Same API                             |
| `useStdout()`       | Supported | Supported | Same API                             |
| `useFocus()`        | Supported | Supported | Enhanced with spatial navigation     |
| `useFocusManager()` | Supported | Supported | Same API                             |
| `measureElement()`  | Supported | Supported | Works, but prefer `useContentRect()` |
| `useBoxMetrics()`   | --        | New       | Post-layout dimensions               |

### render() Differences

```tsx
// Ink
const { unmount, waitUntilExit } = render(<App />)

// Silvery -- just add await
const { unmount, waitUntilExit } = await render(<App />)

// Silvery -- with explicit terminal
using term = createTerm()
const { unmount, waitUntilExit } = await render(<App />, term)
```

### Behavior Differences

| Behavior                | Ink                 | Silvery                       | Reason                       |
| ----------------------- | ------------------- | ----------------------------- | ---------------------------- |
| Text overflow           | Overflows container | Wraps by default              | Better default               |
| First render dimensions | N/A                 | `{ width: 0, height: 0 }`     | Required for layout feedback |
| `overflow` values       | `visible`, `hidden` | `visible`, `hidden`, `scroll` | Scrolling support            |
| Internal APIs           | Exposed             | Hidden                        | Not public API               |

### Flexbox Props

All flexbox props work identically:

| Prop                                | Ink           | Silvery   |
| ----------------------------------- | ------------- | --------- |
| `flexDirection`                     | Supported     | Supported |
| `flexGrow`                          | Supported     | Supported |
| `flexShrink`                        | Supported     | Supported |
| `flexBasis`                         | Supported     | Supported |
| `justifyContent`                    | Supported     | Supported |
| `alignItems`                        | Supported     | Supported |
| `alignSelf`                         | Supported     | Supported |
| `flexWrap`                          | Supported     | Supported |
| `width` / `height`                  | Supported     | Supported |
| `minWidth` / `minHeight`            | Supported     | Supported |
| `maxWidth` / `maxHeight`            | Supported     | Supported |
| `padding` / `paddingX` / `paddingY` | Supported     | Supported |
| `margin` / `marginX` / `marginY`    | Supported     | Supported |
| `gap`                               | Not supported | Supported |

### Border Styles

All border styles work identically: `single`, `double`, `round`, `bold`, `classic`, `arrow`, `heavy`, `doubleSingle`, `singleDouble`.

## Chalk Compatibility

### Import Mapping

```diff
- import chalk from 'chalk';
+ import chalk from 'silvery/chalk';
```

### Feature Support

| Feature           | Chalk                               | silvery/chalk |
| ----------------- | ----------------------------------- | ------------- |
| Standard colors   | `chalk.red()`                       | Supported     |
| Bright colors     | `chalk.redBright()`                 | Supported     |
| Background colors | `chalk.bgRed()`                     | Supported     |
| Modifiers         | `chalk.bold()`, `chalk.dim()`, etc. | Supported     |
| RGB colors        | `chalk.rgb(255, 0, 0)`              | Supported     |
| Hex colors        | `chalk.hex('#ff0000')`              | Supported     |
| 256 colors        | `chalk.ansi256(196)`                | Supported     |
| Chaining          | `chalk.red.bold.underline()`        | Supported     |
| Template literals | `` chalk`{red text}` ``             | Supported     |
| `chalk.level`     | Color level detection               | Supported     |

### Chalk Strings in Components

Chalk-styled strings work inside Silvery's `<Text>` component:

```tsx
import chalk from "silvery/chalk"
import { Text } from "silvery"

<Text>{chalk.red.bold("Error!")}</Text>
<Text>{chalk.green("Success")} and {chalk.yellow("warning")}</Text>
```

## Silvery-Only Features

These features have no Ink/Chalk equivalent:

| Feature               | API                                   |
| --------------------- | ------------------------------------- |
| Layout feedback       | `useContentRect()`                    |
| Scrollable containers | `overflow="scroll"` + `scrollTo`      |
| Input layer isolation | `<InputLayerProvider>`                |
| Spatial focus         | `<FocusScope>` with arrow keys        |
| Mouse events          | `onClick`, `onMouseDown`, `onWheel`   |
| Command system        | `withCommands()`                      |
| Theme tokens          | `color="$primary"`                    |
| TextArea              | Built-in multi-line editing           |
| 30+ components        | VirtualList, Table, ModalDialog, etc. |

## See Also

- [Migrate from Ink](/getting-started/migrate-from-ink) -- Step-by-step migration guide
- [Migrate from Chalk](/getting-started/migrate-from-chalk) -- Chalk migration guide
- [Silvery vs Ink](/guide/silvery-vs-ink) -- Full feature comparison with benchmarks
