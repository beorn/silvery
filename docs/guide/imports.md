---
title: Import Conventions
---

# Import Conventions

Silvery is organized as a monorepo of focused packages. Most apps only need the umbrella package; deeper imports are available when you need fine-grained control.

## Quick Start

The `silvery` umbrella re-exports everything from `@silvery/react`, which in turn re-exports the most-used APIs from all other packages:

```tsx
import { render, Box, Text, useInput, useApp, useContentRect, createTerm } from "silvery"

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

Re-exports `@silvery/react` plus a `VERSION` constant. Also provides compatibility shims:

```ts
import { Box, Text, render, useInput } from "silvery" // everything from @silvery/react
import { Ink, render as inkRender } from "silvery/ink" // Ink API compatibility
import chalk from "silvery/chalk" // Chalk API compatibility
```

### `@silvery/react` -- reconciler, components, hooks, render

The main package. Contains the React reconciler, all built-in components, hooks, and render functions. This is what `silvery` re-exports.

```tsx
import { Box, Text, render, renderSync, renderStatic } from "@silvery/react"
import { useInput, useApp, useContentRect, useFocusable } from "@silvery/react"
import { TextInput, TextArea, ModalDialog, SelectList } from "@silvery/react"
import { VirtualList, ScrollbackView, SplitView, Table } from "@silvery/react"
import { ThemeProvider, useTheme, defaultDarkTheme } from "@silvery/react"
import { createTerm, term, patchConsole } from "@silvery/react"
import { withCommands, withKeybindings } from "@silvery/react"
import { createTermEditContext, useEditContext } from "@silvery/react"
```

Deep imports for subsets:

```ts
import { useContentRect, useFocusable } from "@silvery/react/hooks"
import { createReconciler } from "@silvery/react/reconciler"
```

### `@silvery/term` -- terminal buffer, pipeline, ANSI, unicode

Low-level terminal primitives: buffer management, render pipeline, ANSI escape sequences, input parsing, unicode text utilities, and render adapters (terminal, canvas, DOM).

```ts
import { executeRender, outputPhase, createOutputPhase } from "@silvery/term"
import { displayWidth, wrapText, truncateText, splitGraphemes } from "@silvery/term"
import { ANSI, enableMouse, setCursorStyle, detectTerminalCaps } from "@silvery/term"
import { createTerm, term, patchConsole } from "@silvery/term"
import { HitRegistry, useHitRegion } from "@silvery/term"
import { createCanvasAdapter, createDOMAdapter } from "@silvery/term"
```

Deep imports for specific subsystems:

```ts
// ANSI primitives (term factory, styling, detection, underlines, hyperlinks)
import { createTerm, hyperlink, curlyUnderline } from "@silvery/term/ansi"

// Render pipeline internals
import { executeRender, type PipelineConfig } from "@silvery/term/pipeline"
import { outputPhase, createOutputPhase } from "@silvery/term/pipeline"

// Diagnostic toolbelt (withDiagnostics, VirtualTerminal, buffer comparison)
import { withDiagnostics, VirtualTerminal, compareBuffers } from "@silvery/term/toolbelt"
```

### `@silvery/term/runtime` -- app runtime

The runtime layer for building full terminal applications with event loops, state stores, and the `createApp` pattern:

```ts
import { run, createApp, createRuntime } from "@silvery/term/runtime"
import { layout, diff, createBuffer } from "@silvery/term/runtime"
import { createStore, withFocusManagement } from "@silvery/term/runtime"
import { createTermProvider } from "@silvery/term/runtime"
import { merge, map, filter, takeUntil } from "@silvery/term/runtime"
```

### `@silvery/ui` -- higher-level UI components

Component library used by `@silvery/react`. Most components are re-exported through `@silvery/react`, so direct imports are only needed for non-React CLI usage or accessing sub-modules.

```ts
// CLI spinners and progress bars (no React dependency)
import { Spinner, ProgressBar, MultiProgress } from "@silvery/ui/cli"

// Fluent task API
import { task, tasks, steps } from "@silvery/ui/progress"

// React components (prefer importing from @silvery/react instead)
import { Spinner, ProgressBar } from "@silvery/ui/react"

// Other sub-modules
import { TextInput, Select } from "@silvery/ui/input"
import { Skeleton, Badge } from "@silvery/ui/display"
import { useAnimation, easings } from "@silvery/ui/animation"
import { wrapAnsi } from "@silvery/ui/ansi"
```

### `@silvery/tea` -- TEA state machine utilities

Pure TypeScript (no React dependency). TEA types, effect constructors, focus manager, key parsing, text cursor utilities, plugin composition, and stream helpers.

```ts
import { none, batch, dispatch, compose, createSlice } from "@silvery/tea"
import { createFocusManager } from "@silvery/tea"
import { parseKey, matchHotkey, keyToName } from "@silvery/tea"
import { cursorToRowCol, cursorMoveDown, getWrappedLines } from "@silvery/tea"
import { applyTextOp, invertTextOp } from "@silvery/tea"
import { withCommands, withKeybindings, withDiagnostics } from "@silvery/tea"
import { tea, collect, createStore } from "@silvery/tea"
```

Deep imports:

```ts
import { none, batch, dispatch } from "@silvery/tea/core"
import { createStore, silveryUpdate } from "@silvery/tea/store"
import { tea, collect } from "@silvery/tea/tea"
import { merge, filter, takeUntil } from "@silvery/tea/streams"
```

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
// Instead of pulling in all of @silvery/term:
import { displayWidth, wrapText } from "@silvery/term/unicode"
import { parseMouseSequence } from "@silvery/term/mouse"
import { detectColorScheme } from "@silvery/term/terminal-colors"

// Instead of pulling in all of @silvery/tea:
import { parseKey, matchHotkey } from "@silvery/tea/keys"
import { cursorToRowCol } from "@silvery/tea/text-cursor"
```

This is useful for libraries or tools that want to depend on a narrow slice of Silvery without loading the full component library, React reconciler, or layout engine.
