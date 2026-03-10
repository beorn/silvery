# Future Targets

Silvery's architecture separates the component model from the rendering target. The same React components can render to different outputs -- terminal today, browser and native tomorrow.

## Current Status

| Target       | Status       | Entry Point      |
| ------------ | ------------ | ---------------- |
| Terminal     | Production   | `@silvery/term`  |
| Canvas 2D    | Experimental | `silvery/canvas` |
| DOM          | Experimental | `silvery/dom`    |
| WebGL        | Future       | --               |
| React Native | Future       | --               |
| PDF/Email    | Future       | --               |

## Why Multi-Target Matters

Silvery's core innovation is two-phase rendering with synchronous layout feedback -- components know their size during render via `useContentRect()`. This solves the "ResizeObserver dance" problem across all targets, not just terminals.

### What Carries Over

- **Reconciler** (100%) -- React component model, hooks, reconciliation
- **Layout engine** (100%) -- Flexily flexbox computation
- **`useContentRect()`** (100%) -- Synchronous layout feedback
- **Style system** (partial) -- Semantic tokens and theme infrastructure
- **State management** (100%) -- TEA, Zustand, signals -- all target-independent

Approximately 30% of the codebase is directly reusable across targets.

## Canvas 2D

The Canvas adapter renders Silvery components to an HTML5 Canvas element. This enables:

- Terminal-style UIs embedded in web pages
- Interactive demos and documentation (like the examples on this site)
- Pixel-perfect rendering without DOM layout overhead

```tsx
import { render } from "silvery/canvas"

const canvas = document.getElementById("app") as HTMLCanvasElement
render(<App />, canvas)
```

## DOM

The DOM adapter renders Silvery components as standard HTML elements. This bridges the gap between terminal and web development:

- Same components render as `<div>` and `<span>` elements
- CSS styling supplements the built-in style system
- Useful for web-based terminal emulators and admin panels

```tsx
import { render } from "silvery/dom"

const root = document.getElementById("app")!
render(<App />, root)
```

## Beyond React

The two-phase rendering pattern is framework-agnostic. Potential future adapters:

- **Svelte** -- Compile-time reactivity, no reconciler overhead
- **Solid** -- Fine-grained reactivity with signals
- **Framework-agnostic core** -- Layout + buffer + diffing as a standalone library

React remains the priority. Framework adapters are a long-term exploration.

## Roadmap

See the [full roadmap](/roadmap) for release timeline and 1.0 checklist.
