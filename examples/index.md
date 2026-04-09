# Silvery Examples

Examples organized by complexity: simple component demos, full apps, and specialized showcases.

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
  components/           # Simple component demos (run() + hooks, no store)
  apps/                 # Full interactive apps (render/createApp/pipe)
  layout/               # Layout and responsive design
  runtime/              # Runtime layer demos (Layer 1-3)
  inline/               # Inline mode and scrollback
  kitty/                # Kitty protocol features (graphics, keyboard)
  interactive/          # Debug tools (underscore-prefixed, internal)
  playground/           # Web playground (not an example)
  screenshots/          # Screenshot generation tool
  web/                  # Web render targets (canvas, DOM)
```

## Components

Simple, self-contained demos using `run()` + React hooks. No store, no TEA.
Best starting point for new users.

| Example      | File                          | Description                                  |
| ------------ | ----------------------------- | -------------------------------------------- |
| Hello        | `components/hello.tsx`        | Simplest app — styled text, exit on keypress |
| Counter      | `components/counter.tsx`      | Interactive counter with useState + useInput |
| Text Input   | `components/text-input.tsx`   | Single-line text entry with readline         |
| Select List  | `components/select-list.tsx`  | Keyboard-navigable single-select list        |
| Spinner      | `components/spinner.tsx`      | Four animated loading spinner styles         |
| Progress Bar | `components/progress-bar.tsx` | Determinate and indeterminate progress       |
| Virtual List | `components/virtual-list.tsx` | Efficient scrollable list with 200 items     |

## Apps

Full interactive applications demonstrating real-world patterns.

| Example         | File                     | Description                                    |
| --------------- | ------------------------ | ---------------------------------------------- |
| AI Coding Agent | `apps/aichat/`           | Coding agent with streaming, tool calls        |
| Todo App        | `apps/app-todo.tsx`      | Layer 3: `createApp()` with Zustand store      |
| Async Data      | `apps/async-data.tsx`    | Suspense boundaries with `use()` hook          |
| CLI Wizard      | `apps/cli-wizard.tsx`    | Multi-step scaffolding wizard                  |
| Clipboard       | `apps/clipboard.tsx`     | OSC 52 clipboard copy/paste across sessions    |
| Components      | `apps/components.tsx`    | 30+ component gallery with tabs                |
| Data Explorer   | `apps/data-explorer.tsx` | Searchable, scrollable process table           |
| Dev Tools       | `apps/dev-tools.tsx`     | Live log viewer with ListView                  |
| Explorer        | `apps/explorer.tsx`      | Tabbed log viewer + process explorer           |
| Gallery         | `apps/gallery.tsx`       | Images, pixel art, and truecolor rendering     |
| Kanban          | `apps/kanban.tsx`        | Multi-column kanban with card movement         |
| Layout Ref      | `apps/layout-ref.tsx`    | `forwardRef` + `onLayout` callbacks            |
| Outline         | `apps/outline.tsx`       | Outline vs border side-by-side comparison      |
| Panes           | `apps/panes/`            | Split-pane layout with coding agent            |
| Paste Demo      | `apps/paste-demo.tsx`    | Bracketed paste mode — paste as single event   |
| Scroll          | `apps/scroll.tsx`        | Basic scrollable list                          |
| Search Filter   | `apps/search-filter.tsx` | React concurrent features (`useDeferredValue`) |
| Task List       | `apps/task-list.tsx`     | ListView with variable-height items            |
| Terminal        | `apps/terminal.tsx`      | Keyboard, mouse, clipboard, focus kitchensink  |
| TextArea        | `apps/textarea.tsx`      | Multi-line text input component                |
| Theme           | `apps/theme.tsx`         | Theme explorer with live palette preview       |
| Transform       | `apps/transform.tsx`     | Text post-processing with Transform component  |
| Virtual 10K     | `apps/virtual-10k.tsx`   | ListView with 10,000 items                     |

## Layout

| Example     | File                     | Description                                   |
| ----------- | ------------------------ | --------------------------------------------- |
| Dashboard   | `layout/dashboard.tsx`   | Multi-pane dashboard with keyboard navigation |
| Live Resize | `layout/live-resize.tsx` | Responsive columns via `useBoxRect()`     |
| Overflow    | `layout/overflow.tsx`    | `overflow="hidden"` content clipping          |

## Kitty Protocol

| Example         | File                        | Description                                      |
| --------------- | --------------------------- | ------------------------------------------------ |
| Image Viewer    | `kitty/images.tsx`          | Raw Kitty graphics protocol image display        |
| Image Component | `kitty/image-component.tsx` | Declarative `<Image>` with protocol auto-detect  |
| Key Events      | `kitty/keys.tsx`            | Interactive key chord tester with Kitty protocol |
| Input           | `kitty/input.tsx`           | Kitty keyboard input demonstration               |
| Canvas          | `kitty/canvas.tsx`          | Canvas rendering via Kitty graphics              |
| Paint           | `kitty/paint.tsx`           | Terminal paint app using Kitty graphics          |

## Runtime

| Example         | File                          | Description                                      |
| --------------- | ----------------------------- | ------------------------------------------------ |
| Elm Counter     | `runtime/elm-counter.tsx`     | Layer 1: `createRuntime()` with Elm architecture |
| Hello Runtime   | `runtime/hello-runtime.tsx`   | Layer 1: minimal static render                   |
| Run Counter     | `runtime/run-counter.tsx`     | Layer 2: `run()` with React hooks                |
| Runtime Counter | `runtime/runtime-counter.tsx` | Layer 1: `createRuntime()` with event loop       |

## Inline

| Example         | File                         | Description                     |
| --------------- | ---------------------------- | ------------------------------- |
| Inline Simple   | `inline/inline-simple.tsx`   | Basic inline rendering          |
| Inline Progress | `inline/inline-progress.tsx` | Inline progress bar             |
| Inline Non-TTY  | `inline/inline-nontty.tsx`   | Inline output for piped/non-TTY |
| Scrollback      | `inline/scrollback.tsx`      | REPL with ListView cache        |

## Creating New Examples

1. Add a `.tsx` file in the appropriate category directory
2. Export a `meta` object: `export const meta: ExampleMeta = { name: "...", description: "..." }`
3. Export your main component as a named function
4. Wrap with `ExampleBanner` in the `import.meta.main` block for standalone mode
5. The viewer discovers it automatically — no registry to update

**Component examples** go in `components/` — use `run()` + hooks, keep them short (30-60 lines).
**App examples** go in `apps/` — use `render()`/`createApp()`/`pipe()` for richer patterns.
