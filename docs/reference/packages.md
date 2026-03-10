# Packages

Silvery is organized as a monorepo of focused packages. Most apps only need the umbrella `silvery` package, which re-exports `@silvery/react`.

## Package Overview

| Package           | npm               | Description                                                 |
| ----------------- | ----------------- | ----------------------------------------------------------- |
| `silvery`         | `silvery`         | Umbrella package (re-exports `@silvery/react`)              |
| `packages/term`   | `@silvery/term`   | Terminal runtime, ANSI output, rendering pipeline           |
| `packages/react`  | `@silvery/react`  | React reconciler, components, and hooks                     |
| `packages/ui`     | `@silvery/ui`     | Component library (30+ components) + CLI progress utilities |
| `packages/tea`    | `@silvery/tea`    | TEA state machine store (zustand-based)                     |
| `packages/compat` | `@silvery/compat` | Ink/Chalk compatibility layers                              |
| `packages/test`   | `@silvery/test`   | Testing utilities (virtual renderer, locators)              |
| `packages/theme`  | `@silvery/theme`  | Theme tokens, 38 palettes, theme CLI                        |

## Import Conventions

### Quick Start

Most apps import everything from `silvery`:

```tsx
import { Box, Text, render, useContentRect, useInput, createTerm } from "silvery";
```

### Layered Imports

For fine-grained control, import from scoped packages:

```tsx
// Terminal-specific APIs
import { createTerm, Pipeline } from "@silvery/term";

// React reconciler and hooks
import { Box, Text, useContentRect } from "@silvery/react";

// TEA state management
import { createSlice, createStore } from "@silvery/tea";

// Theme system
import { createTheme, presetTheme } from "@silvery/theme";

// Testing
import { createRenderer } from "@silvery/test";

// UI components
import { Spinner, ProgressBar, Table } from "@silvery/ui";
```

### Runtime Entry Points

```tsx
// High-level app framework
import { run, createApp, useApp } from "@silvery/term/runtime";

// Ink-compatible API
import { Box, Text, render } from "silvery/ink";

// Chalk-compatible styling
import chalk from "silvery/chalk";
```

## `silvery` (Umbrella)

Re-exports everything from `@silvery/react`. This is the primary import for most applications.

**Components**: Box, Text, Newline, Spacer, Static, Transform, TextInput, TextArea, SelectList, Toggle, Button, Spinner, ProgressBar, Table, Badge, Divider, VirtualList, VirtualView, Console, Image, Link, Form, FormField, Toast, CommandPalette, TreeView, Breadcrumb, Tabs, TabList, Tab, TabPanel, Tooltip, Skeleton, ErrorBoundary, ModalDialog, PickerDialog, PickerList, SplitView, ThemeProvider.

**Hooks**: useContentRect, useScreenRect, useInput, useApp, useStdout, useFocus, useFocusManager, useFocusWithin, usePaste, useCursor, useAnimation, useAnimatedTransition, useScrollback, useToast.

**Functions**: render, renderSync, renderToString, createTerm.

## `@silvery/term`

Terminal runtime and rendering pipeline. Handles ANSI output, buffer management, terminal capabilities detection, and the 5-phase rendering pipeline (reconcile, measure, layout, content, output).

Key exports: `createTerm`, `Pipeline`, buffer utilities, ANSI helpers, terminal capability detection.

## `@silvery/react`

React reconciler adapted for terminal rendering. Provides the component model, hooks, and reconciliation logic.

## `@silvery/ui`

Component library with 30+ components plus CLI progress utilities.

**CLI mode** (no React needed):

```ts
import { Spinner, ProgressBar } from "@silvery/ui/cli";
const stop = Spinner.start("Loading...");
```

**Wrapper utilities**:

```ts
import { withSpinner, withProgress } from "@silvery/ui/wrappers";
const data = await withSpinner(fetchData(), "Loading...");
```

## `@silvery/tea`

TEA (The Elm Architecture) state machine store built on Zustand. Provides `createSlice`, `createStore`, effect runners, and plugin composition.

## `@silvery/theme`

Theme system with 38 built-in palettes, auto-generation from a single color, semantic tokens, and contrast checking.

See the [Theming Guide](/guides/theming) for full documentation.

## `@silvery/test`

Testing utilities with Playwright-style auto-locators, buffer assertions, and virtual rendering.

```tsx
import { createRenderer } from "@silvery/test";

const render = createRenderer();
const app = render(<App />);
expect(app.text).toContain("Hello");
```

## `@silvery/compat`

Ink and Chalk compatibility layers. Usually accessed via `silvery/ink` and `silvery/chalk` entry points rather than directly.

## See Also

- [Import Conventions](/guide/imports) -- Detailed import guide
- [Components & Hooks Reference](/reference/components-hooks) -- Full API reference
