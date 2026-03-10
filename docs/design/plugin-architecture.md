# Plugin Architecture: withReact() + withInk()

## Status: Partially Implemented

The `.Root` component pattern is implemented — plugins set `app.Root` to compose providers.
The test renderer retains `wrapRoot` as a direct option for `render()`.

## Problem

Silvery has three entry points for rendering React elements, each with its own provider stack:

1. **`render()`** (test renderer, `renderer.ts`) — wraps with `CursorProvider > TermContext > StdoutContext > FocusManagerContext > RuntimeContext`, plus optional `wrapRoot` callback
2. **`run()`** / **`createApp()`** (runtime, `create-app.tsx`) — wraps with `CursorProvider > TermContext > StdoutContext > FocusManagerContext > RuntimeContext`, plus optional `Root` component from plugins
3. **`renderToXterm()`** (xterm, `xterm/index.ts`) — no provider wrapping at all
4. **Ink compat** (`ink.ts`) — reimplements provider wrapping: `CursorProvider > InkCursorStoreCtx > InkFocusProvider > InkErrorBoundary`, applied via `app.Root` (pipe) or `wrapRoot` (test renderer)

Problems:

- **Duplication**: Each entry point builds its own provider tree, with slight variations
- **Ink reimplements**: The compat layer reimplements ~300 lines of render pipeline to add its providers
- **xterm has nothing**: Web showcases have no access to silvery's focus management, cursor tracking, etc.

## Proposed Solution: Composable Plugins

A plugin is a function that wraps a React element with additional providers/behavior:

```typescript
type Plugin = (element: ReactElement) => ReactElement
```

### Built-in Plugins

```typescript
// Core React reconciler contexts (always applied)
function withSilvery(opts: { term: Term; focusManager?: FocusManager; cursorStore?: CursorStore }): Plugin {
  return (el) =>
    createElement(
      CursorProvider,
      { store: opts.cursorStore ?? createCursorStore() },
      createElement(
        TermContext.Provider,
        { value: opts.term },
        createElement(
          StdoutContext.Provider,
          { value: { stdout: opts.term.stdout, write: () => {} } },
          createElement(
            FocusManagerContext.Provider,
            { value: opts.focusManager ?? createFocusManager() },
            createElement(RuntimeContext.Provider, { value: runtimeValue }, el),
          ),
        ),
      ),
    )
}

// Ink compatibility layer (adds Ink-specific contexts)
function withInk(opts?: { cursorStore?: CursorStore }): Plugin {
  return (el) =>
    createElement(
      InkCursorStoreCtx.Provider,
      { value: opts?.cursorStore ?? createCursorStore() },
      createElement(InkFocusProvider, null, createElement(InkErrorBoundary, null, el)),
    )
}

// Theme provider
function withTheme(palette: ColorPalette): Plugin {
  return (el) => createElement(ThemeProvider, { palette }, el)
}
```

### Composition

Plugins compose via simple function chaining:

```typescript
function composePlugins(...plugins: Plugin[]): Plugin {
  return (el) => plugins.reduceRight((acc, plugin) => plugin(acc), el)
}
```

### Usage

```typescript
// Pure silvery app
await run(<App />, {
  plugins: [withTheme(catppuccinMocha)],
})

// Ink compat app
const app = render(<InkApp />, {
  plugins: [withInk()],
})

// xterm.js showcase with focus + theme
const instance = renderToXterm(<Showcase />, term, {
  plugins: [withTheme(nord)],
})

// Custom plugin
function withAnalytics(): Plugin {
  return (el) => createElement(AnalyticsProvider, null, el)
}

await run(<App />, {
  plugins: [withTheme(dracula), withAnalytics()],
})
```

### Implementation Plan

1. **Phase 1: `.Root` component pattern** (DONE)
   - Plugins set `app.Root` — a React component wrapping children with providers
   - Plugins compose: `const PrevRoot = app.Root ?? Fragment`
   - `createApp()` reads `Root` from run options, applies inside silvery's core providers
   - `render()` (test) retains `wrapRoot` callback for direct usage
   - `withInk()` sets `app.Root` and injects it into run options

2. **Phase 2: Add withTheme() to showcases**
   - Apply `withTheme()` to all web showcases
   - Enables theme switching in the showcase viewer

### Design Principles

- **Plugins are just React providers** — no custom API, no registration
- **Composition order = nesting order** — later plugins wrap earlier ones
- **Core providers always present** — plugins add on top of silvery's base stack
- **`.Root` is the plugin extension point** — composable via `PrevRoot` pattern

### Current Pattern

```typescript
// pipe() composition — plugins set app.Root:
const app = pipe(
  createApp(store),
  withReact(<Board />),
  withTerminal(process),
  withInk(),  // sets app.Root to Ink providers wrapping PrevRoot
)

// Test renderer — wrapRoot still works for direct usage:
render(<App />, { wrapRoot: createInkWrapRoot() })
```

## Alternatives Considered

### 1. Provider Registry Pattern

Register providers globally: `silvery.use(InkPlugin)`. Rejected because:

- Global state causes cross-test contamination
- Order-dependent registration is error-prone
- Can't have different provider stacks for different render instances

### 2. Middleware Pattern (Redux-style)

Each plugin wraps the render function itself. Rejected because:

- Over-engineered for wrapping React context providers
- The problem is just "add providers to the tree", not "intercept render pipeline"

### 3. Config Object Pattern

Pass a config describing desired features: `{ focus: true, cursor: true, theme: 'nord' }`. Rejected because:

- Limited to pre-defined options
- Can't support arbitrary third-party providers
- Requires silvery to know about all possible plugins at compile time
