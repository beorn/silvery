# API Reference

Everything you need to build terminal UIs with Silvery.

## Components

### Layout

| Component               | Description                                             |
| ----------------------- | ------------------------------------------------------- |
| [Box](/api/box)         | Flexbox container — the building block for all layouts  |
| [Text](/api/text)       | Styled text with colors, bold, italic, underline, links |
| [Newline](/api/newline) | Line break between text elements                        |
| [Spacer](/api/spacer)   | Flexible space that fills available room                |
| [Static](/api/static)   | Renders content once, outside the rerender cycle        |

### Interactive

| Component                              | Description                                                |
| -------------------------------------- | ---------------------------------------------------------- |
| [SelectList](/api/select-list)         | Keyboard-navigable list with j/k, search, disabled items   |
| [TextInput](/api/text-input)           | Single-line input with full readline shortcuts             |
| [TextArea](/api/text-area)             | Multi-line text editor with selection and scrolling        |
| [ListView](/api/list-view)             | Virtualized list for large datasets (replaces VirtualList) |
| [Tabs](/api/tabs)                      | Tab container with h/l keyboard navigation                 |
| [CommandPalette](/api/command-palette) | Fuzzy-search command launcher (Ctrl+P / ⌘K style)          |

### Display

| Component                        | Description                                          |
| -------------------------------- | ---------------------------------------------------- |
| [Table](/api/table)              | Data table with columns, alignment, and borders      |
| [Spinner](/api/spinner)          | Animated loading indicator (dots, line, arc, bounce) |
| [ProgressBar](/api/progress-bar) | Determinate and indeterminate progress display       |

### Deprecated

| Component                        | Replacement                            |
| -------------------------------- | -------------------------------------- |
| [VirtualList](/api/virtual-list) | Use [ListView](/api/list-view) instead |

## Functions

| Function              | Description                            |
| --------------------- | -------------------------------------- |
| [render](/api/render) | Render a React element to the terminal |

## Hooks

| Hook                            | Description                                                              |
| ------------------------------- | ------------------------------------------------------------------------ |
| [useBoxRect](/api/use-box-rect) | Get component dimensions during render — container queries for terminals |
| [useInput](/api/use-input)      | Handle keyboard and mouse input                                          |
| [useApp](/api/use-app)          | Access the app instance (exit, rerender)                                 |
| [useStdout](/api/use-stdout)    | Access stdout for raw writes                                             |
| [Focus Hooks](/api/use-focus)   | Focus management (useFocusable, useFocusScope)                           |

## Term sub-owners

Typed facets of the `Term` abstraction — one owner per class of shared-global I/O state. See the [I/O umbrella guide](/guide/term) for the architecture.

| Owner                             | Description                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------ |
| [term.input](/api/term-input)     | Single stdin mediator — `probe()` for terminal queries, `onData()` subscribers |
| [term.output](/api/term-output)   | stdout / stderr / `console.*` sink during alt-screen rendering                 |
| [term.modes](/api/term-modes)     | Raw mode, alt screen, bracketed paste, Kitty keyboard, mouse, focus            |
| [term.size](/api/term-size)       | Reactive cols/rows with 16 ms resize coalescing (alien-signals)                |
| [term.console](/api/term-console) | `console.*` capture + replay, complementary to `term.output`'s sink            |

## Quick Import

All exports come from one package:

```tsx
import {
  Box,
  Text,
  SelectList,
  TextInput,
  TextArea,
  ListView,
  Tabs,
  Table,
  Spinner,
  ProgressBar,
  render,
  useBoxRect,
  useInput,
  useApp,
} from "silvery"
```
