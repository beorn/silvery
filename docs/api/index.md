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

| Hook                            | Description                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [useBoxRect](/api/use-box-rect) | Get component dimensions during render ([container queries for terminals](/getting-started/migrate-from-ink#_1-components-know-their-size-the-big-win)) |
| [useInput](/api/use-input)      | Handle keyboard and mouse input                                                                                                                         |
| [useApp](/api/use-app)          | Access the app instance (exit, rerender)                                                                                                                |
| [useStdout](/api/use-stdout)    | Access stdout for raw writes                                                                                                                            |
| [Focus Hooks](/api/use-focus)   | Focus management (useFocusable, useFocusScope)                                                                                                          |

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
