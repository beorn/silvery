# Examples

Explore Silvery's features through interactive examples:

::: code-group

```bash [npm]
npx silvery examples
```

```bash [bun]
bunx silvery examples
```

```bash [pnpm]
pnpm dlx silvery examples
```

```bash [vp]
vp silvery examples
```

:::

## By Feature

| Example                                  | What it teaches                 | Key components                         |
| ---------------------------------------- | ------------------------------- | -------------------------------------- |
| [Components](/examples/components)       | 30+ ready-made widgets          | SelectList, Tabs, ProgressBar, Spinner |
| [Layout](/examples/layout)               | CSS flexbox for terminals       | Box, flexGrow, gap, justifyContent     |
| [Forms & Input](/examples/forms)         | Interactive forms and wizards   | SelectList, TextInput, focusScope      |
| [Tables & Data](/examples/tables)        | Data exploration and filtering  | Table, VirtualList, useBoxRect()   |
| [Scrollback](/examples/scrollback)       | Dynamic inline mode (unique)    | ScrollbackList, ScrollbackView         |
| [Terminal Protocols](/examples/terminal) | Kitty keyboard, mouse, images   | Image, Canvas, parseHotkey()           |
| [AI Coding Agent](/examples/ai-chat)     | Streaming and real-time updates | VirtualList, TextInput, tool calls     |
| [Testing](/examples/testing)             | Headless testing API            | createRenderer, press(), getByText()   |

## Running Examples

Clone the repository and run any example:

```bash
git clone https://github.com/beorn/silvery
cd silvery
bun install

# Run the example viewer (Storybook-style TUI):
bun examples

# Run a specific example:
bun examples/apps/aichat/index.tsx
bun examples/apps/cli-wizard.tsx
bun examples/layout/dashboard.tsx
```

## Creating Your Own

Start with the example closest to your use case:

| Use Case                  | Start With                           |
| ------------------------- | ------------------------------------ |
| Interactive form / wizard | [Forms & Input](/examples/forms)     |
| Data table with search    | [Tables & Data](/examples/tables)    |
| Multi-pane dashboard      | [Layout](/examples/layout)           |
| Chat / streaming UI       | [AI Coding Agent](/examples/ai-chat) |
| CLI tool with scrollback  | [Scrollback](/examples/scrollback)   |

All examples follow the same patterns:

1. Use `SelectList` for selection prompts (not manual cursor tracking)
2. Use `TextInput` for text entry (built-in readline with Emacs keybindings)
3. Use `useBoxRect()` for responsive dimensions
4. Use `overflow="scroll"` + `scrollTo` for scrolling
5. Use `$token` colors for consistent theming
