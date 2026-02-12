# Inkx Examples

Interactive examples demonstrating Inkx features. Organized by category.

## Running Examples

Browse all examples in the interactive viewer:

```bash
bun examples
```

Run any example standalone:

```bash
bun examples/<category>/<name>.tsx
```

## Structure

Examples are organized into category directories. Each exports a `meta` object
with `name` and `description`. The viewer auto-discovers all examples — no
registry to maintain.

```
examples/
  _banner.tsx           # Shared banner component (not an example)
  viewer.tsx            # Interactive example browser
  layout/               # Layout and responsive design
  interactive/          # Keyboard-driven interactive apps
  runtime/              # Runtime layer demos (Layer 1-3)
  inline/               # Inline mode and scrollback
  playground/           # Web playground (not an example)
  screenshots/          # Screenshot generation tool
  web/                  # Web render targets (canvas, DOM)
```

## Layout

| Example     | File                     | Description                                   |
| ----------- | ------------------------ | --------------------------------------------- |
| Dashboard   | `layout/dashboard.tsx`   | Multi-pane dashboard with keyboard navigation |
| Live Resize | `layout/live-resize.tsx` | Responsive columns via `useContentRect()`     |
| Overflow    | `layout/overflow.tsx`    | `overflow="hidden"` content clipping          |

## Interactive

| Example       | File                            | Description                                      |
| ------------- | ------------------------------- | ------------------------------------------------ |
| AI Chat       | `interactive/ai-chat.tsx`       | Chat UI with VirtualList and streaming responses |
| Todo App      | `interactive/app-todo.tsx`      | Layer 3: `createApp()` with Zustand store        |
| Async Data    | `interactive/async-data.tsx`    | Suspense boundaries with `use()` hook            |
| Kanban        | `interactive/kanban.tsx`        | Multi-column kanban with card movement           |
| Layout Ref    | `interactive/layout-ref.tsx`    | `forwardRef` + `onLayout` callbacks              |
| Scroll        | `interactive/scroll.tsx`        | Basic scrollable list                            |
| Search Filter | `interactive/search-filter.tsx` | React concurrent features (`useDeferredValue`)   |
| Task List     | `interactive/task-list.tsx`     | VirtualList with variable-height items           |
| TextArea      | `interactive/textarea.tsx`      | Multi-line text input component                  |
| Virtual 10K   | `interactive/virtual-10k.tsx`   | VirtualList with 10,000 items                    |

## Runtime

| Example         | File                          | Description                                      |
| --------------- | ----------------------------- | ------------------------------------------------ |
| Elm Counter     | `runtime/elm-counter.tsx`     | Layer 1: `createRuntime()` with Elm architecture |
| Hello Runtime   | `runtime/hello-runtime.tsx`   | Layer 1: minimal static render                   |
| Run Counter     | `runtime/run-counter.tsx`     | Layer 2: `run()` with React hooks                |
| Runtime Counter | `runtime/runtime-counter.tsx` | Layer 1: `createRuntime()` with event loop       |

## Inline

| Example         | File                         | Description                                    |
| --------------- | ---------------------------- | ---------------------------------------------- |
| Inline Simple   | `inline/inline-simple.tsx`   | Basic inline rendering                         |
| Inline Progress | `inline/inline-progress.tsx` | Inline progress bar                            |
| Inline Non-TTY  | `inline/inline-nontty.tsx`   | Inline output for piped/non-TTY                |
| Scrollback      | `inline/scrollback.tsx`      | REPL with `useScrollback` + VirtualList frozen |

## Creating New Examples

1. Add a `.tsx` file in the appropriate category directory
2. Export a `meta` object: `export const meta: ExampleMeta = { name: "...", description: "..." }`
3. Export your main component as a named function
4. Wrap with `ExampleBanner` in the `import.meta.main` block for standalone mode
5. The viewer discovers it automatically — no registry to update
