# Examples

Learn inkx by example. Each example demonstrates a specific pattern and can be run directly.

::: tip Live Demo
See inkx [running in the browser](/examples/live-demo) via xterm.js — the same React components, the same layout engine.
:::

## Running Examples

Clone the repository and run any example:

```bash
git clone https://github.com/beorn/inkx
cd inkx
bun install
bun run examples/dashboard/app.tsx
```

## Available Examples

### [Dashboard](/examples/dashboard)

A multi-pane dashboard demonstrating responsive layouts with `useContentRect()`.

**Key concepts:**

- Multi-pane layouts with `flexGrow`
- Responsive breakpoints based on terminal width
- Proportional column sizing
- Border and padding handling

```
+------------------+---------------------+
| Stats            | Activity Feed       |
| - CPU: 45%       | 12:01 User logged   |
| - Memory: 2.1GB  | 12:00 Build passed  |
| - Disk: 67%      | 11:58 PR merged     |
+------------------+---------------------+
| Recent Items                           |
| > Item 1                               |
|   Item 2                               |
|   Item 3                               |
+----------------------------------------+
```

[View Dashboard Example](/examples/dashboard)

---

### [Task List](/examples/task-list)

A scrollable task list with variable-height items and keyboard navigation.

**Key concepts:**

- `overflow="scroll"` for automatic scrolling
- `scrollTo={index}` to keep selection visible
- Variable-height items (tasks with subtasks)
- Keyboard navigation with `useInput`

```
  Processing (3)
+-----------------------------------------+
| [ ] Research inkx documentation         |
|     - Read the API docs                 |
|     - Try the examples                  |
| [x] Install dependencies                |
| > [ ] Write the migration guide  <--    |
|       - Document breaking changes       |
|       - Add code examples               |
+-----------------------------------------+
  v 2 more
```

[View Task List Example](/examples/task-list)

---

### [Kanban Board](/examples/kanban)

A multi-column kanban board with independent scroll regions.

**Key concepts:**

- Multiple independent scroll containers
- Column-based layouts with `flexGrow`
- State management for cursor position
- Moving items between columns

```
+------------+------------+------------+
| To Do (5)  | Doing (2)  | Done (8)   |
+------------+------------+------------+
| Card 1     |> Card A    | Card X     |
| Card 2     |  Card B    | Card Y     |
| Card 3     |            | Card Z     |
| v 2 more   |            | v 5 more   |
+------------+------------+------------+
```

[View Kanban Example](/examples/kanban)

## Creating Your Own

Start with the simplest example that matches your use case:

| Use Case                | Start With          |
| ----------------------- | ------------------- |
| Single scrollable list  | Task List           |
| Multi-pane layout       | Dashboard           |
| Multiple scroll regions | Kanban              |
| Responsive layout       | Dashboard           |
| Keyboard navigation     | Task List or Kanban |

All examples follow the same patterns:

1. Use `useContentRect()` when you need dimensions
2. Use `overflow="scroll"` + `scrollTo` for scrolling
3. Use `useInput()` for keyboard handling
4. Let flexbox handle proportional sizing
