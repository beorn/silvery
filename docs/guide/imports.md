---
title: Import Conventions
---

# Import Conventions

Silvery is organized as a monorepo of focused packages. Most apps only need the umbrella package; deeper imports are available when you need fine-grained control.

## Quick Start

The `silvery` umbrella re-exports everything from `@silvery/ag-react`, which in turn re-exports the most-used APIs from all other packages:

```tsx
import { render, Box, Text, useInput, useApp, useBoxRect, createTerm } from "silvery"

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

This single import covers components, hooks, render functions, ANSI primitives (`createTerm`, `term`), theming, focus management, terminal queries, and text utilities.

## Package-by-Package

When the umbrella import is too broad, import from the specific package.

### `silvery` -- umbrella

Re-exports `@silvery/ag-react` plus a `VERSION` constant. Also provides compatibility shims:

```ts
import { Box, Text, render, useInput } from "silvery" // everything from @silvery/ag-react
import { Ink, render as inkRender } from "silvery/ink" // Ink API compatibility
import chalk from "silvery/chalk" // Chalk API compatibility
```

### `@silvery/ag-react` -- reconciler, components, hooks, render

The main package. Contains the React reconciler, all built-in components, hooks, and render functions. This is what `silvery` re-exports.

```tsx
import { Box, Text, render, renderSync, renderStatic } from "@silvery/ag-react"
import { useInput, useApp, useBoxRect, useFocusable } from "@silvery/ag-react"
import { TextInput, TextArea, ModalDialog, SelectList } from "@silvery/ag-react"
import { VirtualList, ScrollbackView, SplitView, Table } from "@silvery/ag-react"
import { ThemeProvider, useTheme, defaultDarkTheme } from "@silvery/ag-react"
import { createTerm, term, patchConsole } from "@silvery/ag-react"
import { createTermEditContext, useEditContext } from "@silvery/ag-react"
```

Deep imports for subsets:

```ts
import { useBoxRect, useFocusable } from "@silvery/ag-react/hooks"
import { createReconciler } from "@silvery/ag-react/reconciler"
```

### `@silvery/ag-term` -- terminal buffer, pipeline, ANSI, unicode

Low-level terminal primitives: buffer management, render pipeline, ANSI escape sequences, input parsing, unicode text utilities, and render adapters (terminal, canvas, DOM).

```ts
import { executeRender, outputPhase, createOutputPhase } from "@silvery/ag-term"
import { displayWidth, wrapText, truncateText, splitGraphemes } from "@silvery/ag-term"
import { ANSI, enableMouse, setCursorStyle, detectTerminalCaps } from "@silvery/ag-term"
import { createTerm, term, patchConsole } from "@silvery/ag-term"
import { HitRegistry, useHitRegion } from "@silvery/ag-term"
import { createCanvasAdapter, createDOMAdapter } from "@silvery/ag-term"
```

Deep imports for specific subsystems:

```ts
// ANSI primitives (term factory, styling, detection, underlines, hyperlinks)
import { createTerm, hyperlink, curlyUnderline } from "@silvery/ag-term/ansi"

// Render pipeline internals
import { executeRender, type PipelineConfig } from "@silvery/ag-term/pipeline"
import { outputPhase, createOutputPhase } from "@silvery/ag-term/pipeline"

// Diagnostic toolbelt (withDiagnostics, VirtualTerminal, buffer comparison)
import { withDiagnostics, VirtualTerminal, compareBuffers } from "@silvery/ag-term/toolbelt"
```

### `@silvery/ag-term/runtime` -- app runtime

The runtime layer for interactive terminal applications:

```ts
import { run } from "@silvery/ag-term/runtime"
import { createTermProvider } from "@silvery/ag-term/runtime"
```

### `@silvery/ag-react/ui` -- higher-level UI components

Component library used by `@silvery/ag-react`. Most components are re-exported through `@silvery/ag-react`, so direct imports are only needed for non-React CLI usage or accessing sub-modules.

```ts
// CLI spinners and progress bars (no React dependency)
import { Spinner, ProgressBar, MultiProgress } from "@silvery/ag-react/ui/cli"

// Fluent task API
import { task, tasks, steps } from "@silvery/ag-react/ui/progress"

// React components (prefer importing from @silvery/ag-react instead)
import { Spinner, ProgressBar } from "@silvery/ag-react/ui/react"

// Other sub-modules
import { TextInput, Select } from "@silvery/ag-react/ui/input"
import { Skeleton, Badge } from "@silvery/ag-react/ui/display"
import { useAnimation, easings } from "@silvery/ag-react/ui/animation"
import { wrapAnsi } from "@silvery/ag-react/ui/ansi"
```

### `@silvery/create` -- app composition _(coming soon)_

App composition, state management, commands, and keybindings. Currently in development — API will be documented when released.

### `@silvery/theme` -- theming system

Semantic color tokens, built-in themes, theme generation and detection.

```ts
import { defaultDarkTheme, defaultLightTheme, generateTheme, detectTheme } from "@silvery/theme"
import { ThemeProvider, useTheme } from "@silvery/theme"
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
