# Packages

Most apps only need `silvery` — it re-exports everything you need from the internal packages.

## Public Packages

| Package           | npm               | Description                                                     |
| ----------------- | ----------------- | --------------------------------------------------------------- |
| `silvery`         | `silvery`         | Components, hooks, renderer — the one package you need          |
| `@silvery/test`   | `@silvery/test`   | Testing utilities (virtual renderer, Playwright-style locators) |
| `@silvery/ink`    | `@silvery/ink`    | Ink compatibility layer for migration                           |
| `@silvery/create` | `@silvery/create` | App composition and state management _(coming soon)_            |

## Internal Packages

These are implementation details — you'll only need them for advanced use cases like custom renderers or direct pipeline access.

| Package                | npm                    | Description                                                 |
| ---------------------- | ---------------------- | ----------------------------------------------------------- |
| `@silvery/ag-react`    | `@silvery/ag-react`    | React reconciler, components, and hooks                     |
| `@silvery/ag-term`     | `@silvery/ag-term`     | Terminal runtime, ANSI output, rendering pipeline           |
| `@silvery/ag-react/ui` | `@silvery/ag-react/ui` | Component library (45+ components) + CLI progress utilities |
| `@silvery/theme`       | `@silvery/theme`       | Theme tokens, 84 color schemes, theme CLI                   |
| `@silvery/ink`         | `@silvery/ink`         | Legacy Ink/Chalk compatibility                              |

## Import Conventions

### Quick Start

Most apps import everything from `silvery`:

```tsx
import { Box, Text, render, useBoxRect, useInput, createTerm } from "silvery"
```

### Power-User Imports

Use the public `silvery/*` subpaths before reaching for implementation packages:

```tsx
// Interactive app runtime
import { run, createApp, useApp } from "silvery/runtime"

// Terminal-specific APIs
import { createTerm, parseMouseSequence } from "silvery/term"

// Theme system
import { sterling, type SterlingTheme } from "silvery/theme"

// UI subpackages
import { Spinner, ProgressBar } from "silvery/ui/cli"
```

For framework authors and custom renderers, import from scoped packages:

```tsx
// Core renderer packages
import { createAg, type AgNode } from "@silvery/ag"
import { createTermProvider } from "@silvery/ag-term/runtime"

// Testing
import { createRenderer } from "@silvery/test"
```

::: tip Coming soon: `@silvery/create`
The `@silvery/create` composable-app package (TEA state machines, `pipe()` composition, plugin system) is in active development. APIs shown elsewhere in the docs labeled "Silvertea" are not yet shipped. Use `useState` / `useReducer` / `Zustand` for shared state today.
:::

### Runtime Entry Points

```tsx
// High-level app framework
import { run, createApp, useApp } from "silvery/runtime"

// Ink-compatible API
import { Box, Text, render } from "silvery/ink"

// Chalk-compatible styling
import chalk from "silvery/chalk"
```

## `silvery` (Umbrella)

Re-exports the application-facing surface from `@silvery/ag-react`. This is the primary import for most applications.

**Components**: Box, Text, Newline, Spacer, Static, Transform, TextInput, TextArea, SelectList, Toggle, Button, Spinner, ProgressBar, Table, Badge, Divider, VirtualList, VirtualView, Console, Image, Link, Form, FormField, Toast, CommandPalette, TreeView, Breadcrumb, Tabs, TabList, Tab, TabPanel, Tooltip, Skeleton, ErrorBoundary, ModalDialog, PickerDialog, PickerList, SplitView, ThemeProvider.

**Hooks**: useBoxRect, useScrollRect, useInput, useApp, useStdout, useFocus, useFocusManager, useFocusWithin, usePaste, useCursor, useAnimation, useAnimatedTransition, useScrollback, useToast.

**Functions**: render, renderSync, renderToString, createTerm.

## `@silvery/ag-term`

Terminal runtime and rendering pipeline. Handles ANSI output, buffer management, terminal capabilities detection, and the 5-phase rendering pipeline (reconcile, measure, layout, content, output).

Key exports: `createTerm`, `Pipeline`, buffer utilities, ANSI helpers, terminal capability detection.

## `@silvery/ag-react`

React reconciler adapted for terminal rendering. Provides the component model, hooks, and reconciliation logic.

## `silvery/ui`

Public UI subpath for component-family utilities that are not always needed by the top-level app surface.

**CLI mode** (no React needed):

```ts
import { Spinner, ProgressBar } from "silvery/ui/cli"
const stop = Spinner.start("Loading...")
```

**Wrapper utilities**:

```ts
import { withSpinner, withProgress } from "silvery/ui/wrappers"
const data = await withSpinner(fetchData(), "Loading...")
```

## `@silvery/create`

App composition and state management. _(Coming soon — API is in active development.)_

## `@silvery/theme`

Theme system with 84 color schemes, auto-generation from a single color, semantic tokens, and contrast checking.

See the [Theming Guide](/guide/theming) for full documentation.

## `@silvery/test`

Testing utilities with Playwright-style auto-locators, buffer assertions, and virtual rendering.

```tsx
import { createRenderer } from "@silvery/test"

const render = createRenderer()
const app = render(<App />)
expect(app.text).toContain("Hello")
```

## `@silvery/ink`

Ink and Chalk compatibility layers. Usually accessed via `silvery/ink` and `silvery/chalk` entry points rather than directly.

The Ink compat layer is decomposed into composable plugins:

| Plugin            | What                                                                             |
| ----------------- | -------------------------------------------------------------------------------- |
| `withInkCursor()` | Bridges Ink's `useCursor()` to silvery's `CursorStore` (~50 lines)               |
| `withInkFocus()`  | Provides Ink's flat-list focus system (`useFocus`/`useFocusManager`) (~45 lines) |
| `withInk()`       | Convenience: composes both adapters (~10 lines)                                  |

Import from `@silvery/ink/with-ink`, `@silvery/ink/with-ink-cursor`, or `@silvery/ink/with-ink-focus`. Also re-exported from `@silvery/create/plugins`.

See [Compat Layer Architecture](/reference/compatibility#compat-layer-architecture) for how the adapters bridge Ink APIs to silvery-native systems.

## See Also

- [Import Conventions](/guide/imports) -- Detailed import guide
- [Components & Hooks Reference](/reference/components-hooks) -- Full API reference
