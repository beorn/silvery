# Plugin Architecture

## Status: Implemented

Plugins are functions `(app) => enhancedApp` that compose via `pipe()`. The `.Root` component pattern lets plugins wrap the React element tree with providers.

## Core Concepts

### Plugin Shape

A plugin is a function that takes an app and returns an enhanced app:

```typescript
type Plugin<T, U> = (app: T) => T & U
```

Plugins set `app.Root` — a React component that wraps children with providers. They compose by preserving the previous Root:

```typescript
const PrevRoot = app.Root ?? Fragment
const MyRoot = ({ children }) => (
  <MyProvider>
    <PrevRoot>{children}</PrevRoot>
  </MyProvider>
)
```

### pipe() Composition

Plugins compose left-to-right via `pipe()`:

```typescript
const app = pipe(
  createApp(store),
  withReact(<App />),
  withTerminal(process),
  withInk(),
)
await app.run()
```

Later plugins wrap earlier ones — `withInk()` wraps `withTerminal()` which wraps `withReact()`.

### Built-in Error Boundary

`SilveryErrorBoundary` is silvery's default error boundary, applied as the **outermost** wrapper in `createApp()` and `run()`. All apps get error catching for free — plugins don't need their own error boundaries.

## Built-in Plugins

### Core (silvery)

| Plugin | What | Package |
|--------|------|---------|
| `withReact(<Element />)` | Mounts React element tree | `@silvery/tea` |
| `withTerminal(process)` | Terminal I/O (stdin/stdout, raw mode, alternate screen) | `@silvery/tea` |
| `withFocus()` | Tree-based focus management (scopes, spatial nav) | `@silvery/tea` |
| `withDomEvents()` | DOM-style event dispatch (capture/target/bubble) | `@silvery/tea` |
| `withCommands(opts)` | Named commands with keybindings and introspection | `@silvery/tea` |
| `withKeybindings(opts)` | Configurable keybinding resolution | `@silvery/tea` |
| `withDiagnostics()` | Render invariant checking | `@silvery/tea` |

### Ink Compatibility (`@silvery/compat`)

The Ink compat layer is decomposed into composable plugins:

| Plugin | What | Lines |
|--------|------|-------|
| `withInkCursor()` | Bridges Ink's `useCursor` to silvery's `CursorStore` | ~50 |
| `withInkFocus()` | Provides Ink's flat-list focus (`useFocus`/`useFocusManager`) | ~45 |
| `withInk()` | Composes `withInkCursor()` + `withInkFocus()` | ~10 |

`withInk()` is the convenience plugin — it applies both adapters in one call. For fine-grained control, use the individual plugins:

```typescript
// All-in-one (most apps)
const app = pipe(createApp(store), withReact(<App />), withTerminal(process), withInk())

// Fine-grained (pick what you need)
const app = pipe(createApp(store), withReact(<App />), withTerminal(process), withInkCursor())
```

**Why decomposed?** Ink's `useCursor` and `useFocus` are independent APIs. An app using only `useCursor` shouldn't pay for the focus system. Decomposition also makes the mapping clearer: each thin adapter bridges one Ink API to its silvery-native equivalent.

## Design Principles

- **Plugins are just React providers** — no custom API, no registration
- **Composition order = nesting order** — later plugins wrap earlier ones
- **Core providers always present** — plugins add on top of silvery's base stack
- **`.Root` is the plugin extension point** — composable via `PrevRoot` pattern
- **Error boundary is built-in** — `SilveryErrorBoundary` wraps everything in `createApp()`

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
