---
title: Import Conventions
---

# Import Conventions

Silvery is organized as a monorepo of focused packages. Most apps only need the umbrella package; deeper imports are available when you need fine-grained control.

## Quick Start

The `silvery` umbrella re-exports everything from `@silvery/ag-react`, which in turn re-exports the most-used APIs from all other packages:

```tsx
import {
  render,
  Box,
  Text,
  Island,
  snapshotGuest,
  useInput,
  useApp,
  useBoxRect,
  createTerm,
} from "silvery"

function App() {
  const { exit } = useApp()
  useInput((input) => {
    if (input === "q") exit()
  })
  return (
    <Box>
      <Text>Hello silvery</Text>
    </Box>
  )
}

using term = createTerm()
await render(<App />, term)
```

This single import covers components, hooks, render functions, Island helpers,
ANSI primitives (`createTerm`, `term`), theming, focus management, terminal
queries, and text utilities.

## Package-by-Package

When the umbrella import is too broad, import from the specific package.

### `silvery` -- umbrella

Re-exports `@silvery/ag-react` plus a `VERSION` constant. Also provides compatibility shims:

```ts
import { Box, Text, render, useInput } from "silvery" // everything from @silvery/ag-react
import { Ink, render as inkRender } from "silvery/ink" // Ink API compatibility
import chalk from "silvery/chalk" // Chalk API compatibility
```

### `silvery` -- components, hooks, render

The app-facing package. Use this for components, hooks, render functions, theming, focus helpers, and most terminal-aware React APIs.

```tsx
import { Box, Text, render, renderSync, renderStatic } from "silvery"
import { Island, snapshotGuest, sandbox, createCellBuffer } from "silvery"
import { useInput, useApp, useBoxRect, useFocusable } from "silvery"
import { TextInput, TextArea, ModalDialog, SelectList } from "silvery"
import { ListView, ScrollbackView, SplitView, Table } from "silvery"
import { ThemeProvider, useTheme, defaultDarkTheme } from "silvery"
import { createTerm, term, createConsole } from "silvery"
import { createTermEditContext, useEditContext } from "silvery"
```

Runtime entry points live under `silvery/runtime`:

```ts
import { run, createApp, useApp } from "silvery/runtime"
```

### Scoped packages -- framework authors and low-level tooling

Reach for scoped packages when you are building silvery itself, a custom renderer, or a tool that intentionally depends on a narrow implementation layer.

#### `@silvery/ag-react` -- reconciler internals

React reconciler and host implementation. Most apps should import its exports through `silvery`.

```tsx
import { createReconciler } from "@silvery/ag-react/reconciler"
import { unmountFiberRoot } from "@silvery/ag-react/reconciler"
```

#### `@silvery/ag` -- core renderer contracts

Framework-agnostic contracts and factories. App code usually reaches these
through `silvery`; custom renderers and guest packages can import the narrower
subpaths directly.

```ts
import { createIsland } from "@silvery/ag/island"
import { snapshotGuest, sandbox } from "@silvery/ag/island-guests"
import type { IslandGuest, IslandHandle } from "@silvery/ag/island-types"
```

#### `@silvery/ag-term` -- terminal buffer, pipeline, ANSI, unicode

Low-level terminal primitives: buffer management, render pipeline, ANSI escape sequences, input parsing, unicode text utilities, and render adapters (terminal, canvas, DOM).

```ts
import { createAg, outputPhase, createOutputPhase } from "@silvery/ag-term"
import { displayWidth, wrapText, truncateText, splitGraphemes } from "@silvery/ag-term"
import { ANSI, enableMouse, setCursorStyle, createTerminalProfile } from "@silvery/ag-term"
import { createTerm, term, patchConsole } from "@silvery/ag-term"
import { HitRegistry, useHitRegion } from "@silvery/ag-term"
import { createCanvasAdapter, createDOMAdapter } from "@silvery/ag-term"
```

Deep imports for specific subsystems:

```ts
// ANSI primitives (term factory, styling, detection, underlines, hyperlinks)
import { createTerm, hyperlink, curlyUnderline } from "@silvery/ag-term/ansi"

// Render pipeline internals
import { createAg } from "@silvery/ag-term/ag"
import { outputPhase, type PipelineConfig } from "@silvery/ag-term/pipeline"
import { outputPhase, createOutputPhase } from "@silvery/ag-term/pipeline"

// Diagnostic toolbelt (withDiagnostics, VirtualTerminal, buffer comparison)
import { withDiagnostics, VirtualTerminal, compareBuffers } from "@silvery/ag-term/toolbelt"
```

### `silvery/runtime` -- app runtime

The runtime layer for interactive terminal applications:

```ts
import { run, createApp, useInput, useApp } from "silvery/runtime"
```

### `silvery/ui` -- higher-level UI utilities

Most React components are re-exported through `silvery`. Use `silvery/ui/*` for non-React CLI utilities or specialized submodules.

```ts
// CLI spinners and progress bars (no React dependency)
import { Spinner, ProgressBar, MultiProgress } from "silvery/ui/cli"

// Fluent task API
import { task, tasks, steps } from "silvery/ui/progress"

// React components (prefer importing from silvery instead)
import { Spinner, ProgressBar } from "silvery/ui/react"

// Other sub-modules
import { TextInput, Select } from "silvery/ui/input"
import { Skeleton, Badge } from "silvery/ui/display"
import { useAnimation, easings } from "silvery/ui/animation"
import { wrapAnsi } from "silvery/ui/ansi"
```

### `@silvery/create` -- app composition _(coming soon)_

App composition, state management, commands, and keybindings. Currently in development — API will be documented when released.

### `@silvery/theme` -- theming system

Semantic color tokens, built-in themes, theme generation and detection.

```ts
import { defaultDarkTheme, defaultLightTheme, generateTheme, detectTheme } from "@silvery/theme"
import { ThemeProvider } from "silvery"
import { useTheme } from "@silvery/theme"
import type { Theme } from "@silvery/theme"
```

### `@silvery/test` -- testing utilities

Virtual renderer, locators, buffer assertions, and keyboard simulation for tests.

```ts
import { createRenderer, render, run } from "@silvery/test"
import { bufferToText, stripAnsi, normalizeFrame } from "@silvery/test"
import { createLocator, createAutoLocator } from "@silvery/test"
import { compareBuffers, formatMismatch } from "@silvery/test"
import { waitFor } from "@silvery/test"
```

## Tree-Shaking and Deep Imports

Every package supports deep imports via the `./*` export map pattern. If you only need a specific module, import it directly to minimize what gets pulled in:

```ts
// Instead of pulling in all of @silvery/ag-term:
import { displayWidth, wrapText } from "@silvery/ag-term/unicode"
import { parseMouseSequence } from "@silvery/ag-term/mouse"
import { detectColorScheme } from "@silvery/ag-term/terminal-colors"

// Specific utilities:
import { parseKey, matchHotkey } from "@silvery/ag-term/keys"
```

This is useful for libraries or tools that want to depend on a narrow slice of Silvery without loading the full component library, React reconciler, or layout engine.
