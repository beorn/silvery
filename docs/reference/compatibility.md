# Ink/Chalk Compatibility

Silvery provides compatibility layers for both Ink and Chalk, making migration straightforward. This reference documents the complete API mapping.

## Compatibility Summary

| Test suite                                  | Pass rate           | Notes                          |
| ------------------------------------------- | ------------------- | ------------------------------ |
| Ink's own test suite (via `bun run compat`) | **804/813 (98.9%)** | Real Ink tests, Flexily engine |
| Chalk's own test suite                      | **32/32 (100%)**    | Full Chalk API compatibility   |

Compatibility is tested by cloning the real Ink and Chalk repos and running their original test suites against silvery's compat layer (`bun run compat`). The 9 remaining Ink test failures are edge cases in the Flexily layout engine (flex-wrap, aspect ratio) and minor compat gaps (overflowX, measure-element, render-to-string). For exact Yoga layout parity, silvery supports Yoga as a pluggable engine. See [Silvery vs Ink](/guide/silvery-vs-ink#compatibility-at-a-glance) for the full breakdown.

## Ink Compatibility

### Import Mapping

```diff
- import { Box, Text, render, useInput, useApp } from 'ink'
+ import { Box, Text, render, useInput, useApp } from 'silvery'

- import { render } from 'ink-testing-library'
+ import { render } from '@silvery/test'
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
| `measureElement()`  | Supported | Supported | Works, but prefer `useBoxRect()` |
| `useBoxMetrics()`   | --        | New       | Post-layout dimensions               |

### render() Differences

```tsx
// Ink
const { unmount, waitUntilExit } = render(<App />)

// Silvery -- render() is sync, returns RenderHandle; .run() is async
const app = render(<App />)
await app.run()

// Silvery -- with explicit terminal
using term = createTerm()
const app = render(<App />, term)
await app.run()
```

### Behavior Differences

| Behavior                | Ink                 | Silvery                       | Reason                         |
| ----------------------- | ------------------- | ----------------------------- | ------------------------------ |
| Default `flexDirection` | `column`            | `row`                         | W3C CSS spec compliance        |
| Text overflow           | Overflows container | Wraps by default              | Better default                 |
| First render dimensions | N/A                 | `{ width: 0, height: 0 }`     | Required for responsive layout |
| `overflow` values       | `visible`, `hidden` | `visible`, `hidden`, `scroll` | Scrolling support              |
| Internal APIs           | Exposed             | Hidden                        | Not public API                 |

> **Layout engine note**: Silvery defaults to [Flexily](https://beorn.codes/flexily), which follows the W3C CSS spec where Yoga diverges. For exact Ink layout parity (e.g., `flexWrap`, `alignContent`, percentage `flexBasis`), use Yoga as the layout engine. See [Flexily vs Yoga Philosophy](/guide/silvery-vs-ink#flexily-vs-yoga-philosophy).

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
- import chalk from 'chalk'
+ import chalk from 'silvery/chalk'
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

## Compat Layer Architecture

The Ink compatibility layer (`@silvery/ink`) is built as thin adapters that bridge Ink's APIs to silvery-native systems. Understanding the architecture helps you decide when to use Ink-compat hooks vs silvery-native ones.

### How It Works

> **Coming Soon:** The `withInk()`, `pipe()`, and `createApp()` composition APIs shown below are part of the era2b compatibility layer, which is not yet released. The current migration path uses `render()` directly (see [Migrate from Ink](/getting-started/migrate-from-ink)).

`withInk()` composes two independent plugins:

```typescript
// withInk() = withInkCursor() + withInkFocus()
const app = pipe(
  createApp(store),
  withReact(<App />),
  withTerminal(process),
  withInk(), // applies both adapters
)
```

| Plugin            | Ink API                           | Bridges to                     | Size      |
| ----------------- | --------------------------------- | ------------------------------ | --------- |
| `withInkCursor()` | `useCursor()`                     | silvery `CursorStore`          | ~50 lines |
| `withInkFocus()`  | `useFocus()`, `useFocusManager()` | `InkFocusProvider` (flat list) | ~45 lines |

Error handling is **not part of the compat layer** — silvery's built-in `SilveryErrorBoundary` wraps all apps automatically in `createApp()`.

### Ink Focus vs Silvery Focus

The two focus systems have fundamentally different designs:

|                  | Ink Focus (`useFocus`)                   | Silvery Focus (`useFocusable`)                     |
| ---------------- | ---------------------------------------- | -------------------------------------------------- |
| **Model**        | Flat list of component-registered IDs    | Tree of layout nodes with spatial awareness        |
| **Navigation**   | Tab/Shift+Tab only                       | Tab, arrow keys (spatial), click-to-focus          |
| **Scoping**      | None — all focusables in one global list | Focus scopes isolate regions (e.g., modal dialogs) |
| **Registration** | Components call `add(id)` / `remove(id)` | Automatic from layout tree                         |
| **Events**       | None                                     | DOM-style focus/blur with capture/target/bubble    |

**For new code, use silvery's focus system.** The Ink compat focus exists for apps migrating from Ink that already use `useFocus()` / `useFocusManager()`.

### Ink Cursor vs Silvery Cursor

Both systems write to the same `CursorStore` — `withInkCursor()` just provides the `InkCursorStoreCtx` context that Ink's `useCursor()` hook reads from. The underlying cursor mechanism is identical.

### Gradual Migration Path

You can incrementally drop Ink adapters as you adopt silvery-native APIs:

1. **Start**: `withInk()` — everything works like Ink
2. **Replace focus**: Switch from `useFocus()` to `useFocusable()`, drop `withInkFocus()`
3. **Replace cursor**: Switch from Ink's `useCursor()` to silvery's `useCursor()`, drop `withInkCursor()`
4. **Done**: No compat layer needed

## Silvery-Only Features

These features have no Ink/Chalk equivalent:

| Feature               | API                                   |
| --------------------- | ------------------------------------- |
| Layout feedback       | `useBoxRect()`                    |
| Scrollable containers | `overflow="scroll"` + `scrollTo`      |
| Input layer isolation | `<InputLayerProvider>`                |
| Spatial focus         | `<FocusScope>` with arrow keys        |
| Mouse events          | `onClick`, `onMouseDown`, `onWheel`   |
| Command system        | `withCommands()`                      |
| Theme tokens          | `color="$primary"`                    |
| TextArea              | Built-in multi-line editing           |
| 45+ components        | VirtualList, Table, ModalDialog, etc. |

## See Also

- [Migrate from Ink](/getting-started/migrate-from-ink) -- Step-by-step migration guide
- [Migrate from Chalk](/getting-started/migrate-from-chalk) -- Chalk migration guide
- [Silvery vs Ink](/guide/silvery-vs-ink) -- Full feature comparison with benchmarks
