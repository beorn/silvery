# Task List Example

A scrollable task list with variable-height items and keyboard navigation.

[[toc]]

## What It Demonstrates

- **Automatic scrolling** with `overflow="scroll"` and `scrollTo`
- **Variable-height items** - tasks with subtasks render taller
- **Keyboard navigation** with `useInput()`
- **Selection styling** with inverse colors

## Screenshot

```
  Tasks (7 items)
+------------------------------------------+
| [ ] Research InkX documentation          |
|     - Read the API docs                  |
|     - Try the examples                   |
| [x] Install dependencies                 |
|>[x] Set up project structure             |
|     - Create src/ directory              |
|     - Add tsconfig.json                  |
| [ ] Write the migration guide            |
+------------------------------------------+
  v 3 more
```

## Running the Example

```bash
cd inkx
bun run examples/task-list/app.tsx
```

## Full Source Code

::: code-group

```tsx [app.tsx]
import { Box, Text, render, useLayout, useInput, useApp } from "inkx";
import { useState } from "react";

interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

interface Task {
  id: string;
  title: string;
  done: boolean;
  subtasks?: Subtask[];
}

const initialTasks: Task[] = [
  {
    id: "1",
    title: "Research InkX documentation",
    done: false,
    subtasks: [
      { id: "1a", title: "Read the API docs", done: true },
      { id: "1b", title: "Try the examples", done: false },
    ],
  },
  {
    id: "2",
    title: "Install dependencies",
    done: true,
  },
  {
    id: "3",
    title: "Set up project structure",
    done: true,
    subtasks: [
      { id: "3a", title: "Create src/ directory", done: true },
      { id: "3b", title: "Add tsconfig.json", done: true },
    ],
  },
  {
    id: "4",
    title: "Write the migration guide",
    done: false,
    subtasks: [
      { id: "4a", title: "Document breaking changes", done: false },
      { id: "4b", title: "Add code examples", done: false },
      { id: "4c", title: "Review with team", done: false },
    ],
  },
  {
    id: "5",
    title: "Update README",
    done: false,
  },
  {
    id: "6",
    title: "Add CI/CD pipeline",
    done: false,
    subtasks: [
      { id: "6a", title: "Set up GitHub Actions", done: false },
      { id: "6b", title: "Add test workflow", done: false },
    ],
  },
  {
    id: "7",
    title: "Release v1.0",
    done: false,
  },
];

function App() {
  const { exit } = useApp();
  const [tasks, setTasks] = useState(initialTasks);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      exit();
    }

    if (key.downArrow) {
      setSelectedIndex((i) => Math.min(i + 1, tasks.length - 1));
    }

    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(i - 1, 0));
    }

    if (input === " " || key.return) {
      // Toggle selected task
      setTasks((prev) =>
        prev.map((task, i) =>
          i === selectedIndex ? { ...task, done: !task.done } : task
        )
      );
    }
  });

  const completedCount = tasks.filter((t) => t.done).length;

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Header total={tasks.length} completed={completedCount} />
      <TaskList tasks={tasks} selectedIndex={selectedIndex} />
      <HelpBar />
    </Box>
  );
}

function Header({ total, completed }: { total: number; completed: number }) {
  const { width } = useLayout();

  return (
    <Box paddingX={1} marginBottom={1}>
      <Text bold>Tasks</Text>
      <Text> ({completed}/{total} done)</Text>
    </Box>
  );
}

function TaskList({
  tasks,
  selectedIndex,
}: {
  tasks: Task[];
  selectedIndex: number;
}) {
  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="single"
      overflow="scroll"
      scrollTo={selectedIndex}
    >
      {tasks.map((task, i) => (
        <TaskRow key={task.id} task={task} isSelected={i === selectedIndex} />
      ))}
    </Box>
  );
}

function TaskRow({ task, isSelected }: { task: Task; isSelected: boolean }) {
  const { width } = useLayout();

  const checkbox = task.done ? "[x]" : "[ ]";
  const prefix = isSelected ? ">" : " ";

  // Calculate available width for title
  // prefix (1) + space (1) + checkbox (3) + space (1) = 6 chars
  const titleWidth = Math.max(0, width - 6);

  const truncatedTitle =
    task.title.length > titleWidth
      ? task.title.slice(0, titleWidth - 1) + "..."
      : task.title;

  return (
    <Box flexDirection="column">
      <Text
        backgroundColor={isSelected ? "cyan" : undefined}
        color={isSelected ? "black" : undefined}
      >
        {prefix} {checkbox} {truncatedTitle}
      </Text>
      {task.subtasks?.map((subtask) => (
        <SubtaskRow key={subtask.id} subtask={subtask} isParentSelected={isSelected} />
      ))}
    </Box>
  );
}

function SubtaskRow({
  subtask,
  isParentSelected,
}: {
  subtask: Subtask;
  isParentSelected: boolean;
}) {
  const { width } = useLayout();

  const checkbox = subtask.done ? "x" : " ";

  // Subtasks are indented: 4 spaces + "- [x] " = 10 chars
  const titleWidth = Math.max(0, width - 10);

  const truncatedTitle =
    subtask.title.length > titleWidth
      ? subtask.title.slice(0, titleWidth - 1) + "..."
      : subtask.title;

  return (
    <Text
      dimColor={!isParentSelected}
      backgroundColor={isParentSelected ? "cyan" : undefined}
      color={isParentSelected ? "black" : undefined}
    >
      {"    "}- [{checkbox}] {truncatedTitle}
    </Text>
  );
}

function HelpBar() {
  return (
    <Box paddingX={1} marginTop={1}>
      <Text dimColor>
        Up/Down: navigate | Space/Enter: toggle | q: quit
      </Text>
    </Box>
  );
}

render(<App />);
```

:::

## Code Walkthrough

### Scrollable Container

The `TaskList` component wraps tasks in a scrollable container:

```tsx
function TaskList({ tasks, selectedIndex }: { tasks: Task[]; selectedIndex: number }) {
  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="single"
      overflow="scroll"
      scrollTo={selectedIndex}
    >
      {tasks.map((task, i) => (
        <TaskRow key={task.id} task={task} isSelected={i === selectedIndex} />
      ))}
    </Box>
  );
}
```

Key props:
- `overflow="scroll"` - enables scrolling
- `scrollTo={selectedIndex}` - keeps selected item visible
- `flexGrow={1}` - fills available vertical space

### Variable Height Items

Tasks with subtasks are taller than tasks without:

```tsx
function TaskRow({ task, isSelected }: { task: Task; isSelected: boolean }) {
  return (
    <Box flexDirection="column">
      <Text>{/* main task line */}</Text>
      {task.subtasks?.map((subtask) => (
        <SubtaskRow key={subtask.id} subtask={subtask} />
      ))}
    </Box>
  );
}
```

InkX measures each task's actual height. No height estimation needed.

### Selection Styling

Selected items use `backgroundColor="cyan"` and `color="black"`:

```tsx
<Text
  backgroundColor={isSelected ? "cyan" : undefined}
  color={isSelected ? "black" : undefined}
>
  {prefix} {checkbox} {truncatedTitle}
</Text>
```

The selection extends to subtasks when the parent task is selected.

### Keyboard Navigation

The `useInput` hook handles arrow keys and toggling:

```tsx
useInput((input, key) => {
  if (key.downArrow) {
    setSelectedIndex((i) => Math.min(i + 1, tasks.length - 1));
  }

  if (key.upArrow) {
    setSelectedIndex((i) => Math.max(i - 1, 0));
  }

  if (input === " " || key.return) {
    setTasks((prev) =>
      prev.map((task, i) =>
        i === selectedIndex ? { ...task, done: !task.done } : task
      )
    );
  }
});
```

### Text Truncation

Both tasks and subtasks truncate long titles:

```tsx
const titleWidth = Math.max(0, width - 6);
const truncatedTitle =
  task.title.length > titleWidth
    ? task.title.slice(0, titleWidth - 1) + "..."
    : task.title;
```

The available width comes from `useLayout()`.

## Key InkX Features Used

| Feature | Usage |
|---------|-------|
| `overflow="scroll"` | Scrollable task list |
| `scrollTo={index}` | Keep selection visible as you navigate |
| `useLayout()` | Calculate available width for text truncation |
| `useInput()` | Arrow key navigation and task toggling |
| Variable heights | Tasks with subtasks naturally expand |

## How Scrolling Works

InkX handles variable-height scrolling automatically:

1. **Yoga measures all items** - Each task (with its subtasks) gets measured
2. **Calculate visible range** - Based on `scrollTo` and container height
3. **Render visible items** - Only visible tasks get their content rendered
4. **Show overflow indicators** - "^ N more" / "v N more" appear automatically

You don't need to:
- Estimate item heights
- Manually track scroll position
- Implement virtualization
- Handle edge cases

## Exercises

1. **Add task creation** - Press `a` to add a new task
2. **Add subtask navigation** - Use Tab to move into subtasks
3. **Add filtering** - Press `f` to filter by status (all/done/pending)
4. **Add persistence** - Save tasks to a JSON file
5. **Add drag-and-drop** - Reorder tasks with shift+arrow keys
