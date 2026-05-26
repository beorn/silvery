# Providers and Plugins

::: danger Coming Soon — Silvertea (`@silvery/create`)
Providers (`pipe()`, `createApp`, `withReact`, `withTerminal`, `withFocus`, `withDomEvents`, …) are part of **Silvertea**, the composable app layer that ships as `@silvery/create`. Silvertea is in active development — the APIs documented below are **not yet released**.

For shipped composition today, use [`render()`](/api/render) + [`run()`](/guide/runtime-getting-started) with standard React state primitives.
:::

Silvery apps are built by composing **providers** — small functions that each add one capability to the app object. Providers are composed left-to-right using `pipe()`.

## pipe() Composition

```typescript
import { pipe, createApp, withReact, withTerminal, withFocus, withDomEvents } from '@silvery/create'

const app = pipe(
  createApp(store),
  withReact(<Board />),
  withTerminal(process),
  withFocus(),
  withDomEvents(),
)
await app.run()
```

`pipe(base, p1, p2, p3)` is equivalent to `p3(p2(p1(base)))`. Each provider receives the result of the previous one and returns an enhanced version. TypeScript infers the accumulating type through the chain — if `withFocus()` adds `.focusNext()` and `withDomEvents()` requires it, the compiler catches ordering mistakes at the call site.

## The AppPlugin Type

```typescript
export type AppPlugin<A, B> = (app: A) => B
```

A provider is just a function from one app shape to another. No base class, no registration — plain functions that spread the input and add new fields:

```typescript
const withCustom = (app) => ({
  ...app,
  custom: () => console.log("hello"),
})

const enhanced = pipe(baseApp, withCustom)
enhanced.custom() // typed!
```

## Built-in Providers

All providers live in `@silvery/create` and follow the `with-*` naming convention (file name) / `with*` (export name).

| Provider                         | File                  | What it adds                                                             |
| -------------------------------- | --------------------- | ------------------------------------------------------------------------ |
| **withApp()**                    | `with-app.ts`         | Domain state registry (`models`), command tree (`commands`), keymaps     |
| **withReact(element)**           | `with-react.ts`       | React reconciler mount, virtual buffer, component rendering              |
| **withRender(term)**             | `with-render.ts`      | Render pipeline — `render()` and `renderStatic()` methods from term caps |
| **withTerminal(process, opts?)** | `with-terminal.ts`    | Terminal I/O — alternate screen, raw mode, resize, cursor, cleanup       |
| **withFocus()**                  | `with-focus.ts`       | Tab/Shift+Tab focus navigation, Escape to parent scope                   |
| **withDomEvents()**              | `with-dom-events.ts`  | Mouse dispatch — hit testing, bubbling, click-to-focus, double-click     |
| **withDiagnostics()**            | `with-diagnostics.ts` | Debug overlays — incremental vs fresh render checks after commands       |
| **withLinks()**                  | `with-links.ts`       | Hyperlink event routing — `link:open` events from Link components        |

## Writing a Custom Provider

A provider is a function that takes the current app and returns an enhanced version. Use a factory function if it needs configuration:

```typescript
// with-logger.ts
import type { AppPlugin } from '@silvery/create'

interface LoggerOptions {
  level: 'debug' | 'info' | 'warn'
}

export function withLogger(options: LoggerOptions = { level: 'info' }) {
  return (app) => {
    const log = (msg: string) => {
      if (options.level === 'debug') console.log(`[debug] ${msg}`)
    }

    // Wrap an existing method (decorator pattern)
    const originalPress = app.press
    return {
      ...app,
      log,
      press: (...args) => {
        log(`press: ${JSON.stringify(args)}`)
        return originalPress(...args)
      },
    }
  }
}

// Usage:
const app = pipe(
  createApp(store),
  withReact(<App />),
  withTerminal(process),
  withLogger({ level: 'debug' }),
)
app.log('custom method available')
```

### Provider Guidelines

1. **Spread the input** — `{ ...app, newField }` preserves everything upstream added
2. **Return type flows automatically** — TypeScript infers the union of input + your additions
3. **Wrap, don't replace** — to modify behavior (e.g., intercepting `press()`), call the original
4. **One concern per provider** — focus does focus, mouse does mouse, don't bundle unrelated features
5. **Factory for options** — `withFoo(opts)` returns `(app) => enhanced`, not `withFoo(app, opts)`

## Naming Conventions

- **Files**: `with-kebab-case.ts` (e.g., `with-dom-events.ts`)
- **Exports**: `withCamelCase` (e.g., `withDomEvents`)
- **Package**: Providers that ship with silvery live in `@silvery/create`

## Provider Order Matters

Providers compose left-to-right. Later providers can depend on fields added by earlier ones:

```typescript
pipe(
  createApp(store),
  withReact(<App />),     // adds reconciler, buffer
  withTerminal(process),  // adds term I/O
  withFocus(),            // adds focus navigation (needs press())
  withDomEvents(),        // adds mouse dispatch (needs focus manager from withFocus)
)
```

If you put `withDomEvents()` before `withFocus()`, TypeScript will error — `withDomEvents` expects the focus manager that `withFocus` provides.

## Features Directory Convention

Backend-specific feature services (terminal-only, canvas-only) use a `features/` subfolder within the backend package. For example, `ag-term/src/features/` holds terminal-specific feature implementations that providers wire up. This keeps backend-agnostic provider logic in `@silvery/create` while platform-specific code stays in the backend package.

## Relationship to Headless Machines

Providers wire capabilities into the app. **Headless machines** (`@silvery/headless`) provide the pure state logic that providers consume. For example, `withFocus()` manages focus state, and a future selection provider would consume the selection machine from `@silvery/headless`. See [Headless Machines](./headless-machines.md) for the machine API.
