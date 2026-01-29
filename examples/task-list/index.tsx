/**
 * Task List Example
 *
 * A scrollable task list demonstrating:
 * - 50+ items for scrolling demonstration
 * - overflow="hidden" with manual scroll state
 * - Toggle task completion with space
 * - Variable height items (some with subtasks)
 */

import React, { useState, useMemo } from "react";
import {
  render,
  Box,
  Text,
  useInput,
  useApp,
  createTerm,
  type Key,
} from "../../src/index.js";

// ============================================================================
// Types
// ============================================================================

interface Task {
  id: number;
  title: string;
  completed: boolean;
  priority: "high" | "medium" | "low";
  subtasks?: string[];
}

// ============================================================================
// Data Generation
// ============================================================================

function generateTasks(count: number): Task[] {
  const priorities: Array<"high" | "medium" | "low"> = [
    "high",
    "medium",
    "low",
  ];
  const taskTemplates = [
    "Review pull request",
    "Update documentation",
    "Fix bug in authentication",
    "Implement new feature",
    "Write unit tests",
    "Refactor legacy code",
    "Update dependencies",
    "Create API endpoint",
    "Design database schema",
    "Optimize performance",
    "Add error handling",
    "Setup CI/CD pipeline",
    "Write integration tests",
    "Code review feedback",
    "Deploy to staging",
  ];

  const subtaskTemplates = [
    ["Research solutions", "Implement changes", "Test thoroughly"],
    ["Check requirements", "Update code"],
    ["Review with team", "Make adjustments", "Get approval", "Merge"],
  ];

  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: `${taskTemplates[i % taskTemplates.length]} #${Math.floor(i / taskTemplates.length) + 1}`,
    completed: Math.random() > 0.7,
    priority: priorities[i % 3] as "high" | "medium" | "low",
    // Every 5th task has subtasks
    subtasks:
      i % 5 === 0 ? subtaskTemplates[i % subtaskTemplates.length] : undefined,
  }));
}

// ============================================================================
// Components
// ============================================================================

function PriorityBadge({
  priority,
}: {
  priority: "high" | "medium" | "low";
}): JSX.Element {
  const colors = {
    high: "red",
    medium: "yellow",
    low: "green",
  };
  const symbols = {
    high: "!!!",
    medium: "!!",
    low: "!",
  };

  return (
    <Text color={colors[priority]} bold>
      [{symbols[priority]}]
    </Text>
  );
}

function TaskItem({
  task,
  isSelected,
  isExpanded,
}: {
  task: Task;
  isSelected: boolean;
  isExpanded: boolean;
}): JSX.Element {
  const checkbox = task.completed ? "[x]" : "[ ]";
  const hasSubtasks = task.subtasks && task.subtasks.length > 0;

  return (
    <Box flexDirection="column">
      <Box>
        {isSelected ? (
          <Text backgroundColor="cyan" color="black">
            {" "}
            {checkbox} {task.title}{" "}
          </Text>
        ) : (
          <Text strikethrough={task.completed} dim={task.completed}>
            {checkbox} {task.title}
          </Text>
        )}{" "}
        <PriorityBadge priority={task.priority} />
        {hasSubtasks && <Text dim> ({task.subtasks!.length} subtasks)</Text>}
      </Box>
      {hasSubtasks && isExpanded && (
        <Box flexDirection="column" marginLeft={4}>
          {task.subtasks!.map((subtask, idx) => (
            <Text key={idx} dim>
              - {subtask}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

function StatusBar({
  tasks,
  cursor,
  scrollOffset,
  visibleCount,
}: {
  tasks: Task[];
  cursor: number;
  scrollOffset: number;
  visibleCount: number;
}): JSX.Element {
  const completed = tasks.filter((t) => t.completed).length;
  const total = tasks.length;
  const percent = Math.round((completed / total) * 100);

  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      justifyContent="space-between"
    >
      <Text>
        <Text bold>{completed}</Text>
        <Text dim>
          /{total} completed ({percent}%)
        </Text>
      </Text>
      <Text dim>
        Item {cursor + 1}/{total} | Scroll: {scrollOffset + 1}-
        {Math.min(scrollOffset + visibleCount, total)}
      </Text>
    </Box>
  );
}

function TaskList(): JSX.Element {
  const { exit } = useApp();
  const [tasks, setTasks] = useState(() => generateTasks(60));
  const [cursor, setCursor] = useState(0);
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());

  // Fixed visible count (in a real app, this would use useLayout)
  const visibleCount = 15;

  // Calculate scroll offset to keep cursor visible
  const scrollOffset = useMemo(() => {
    const halfVisible = Math.floor(visibleCount / 2);
    const maxOffset = Math.max(0, tasks.length - visibleCount);

    // Keep cursor centered when possible
    let offset = cursor - halfVisible;
    offset = Math.max(0, Math.min(offset, maxOffset));
    return offset;
  }, [cursor, visibleCount, tasks.length]);

  // Get visible tasks
  const visibleTasks = useMemo(() => {
    return tasks.slice(scrollOffset, scrollOffset + visibleCount);
  }, [tasks, scrollOffset, visibleCount]);

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) {
      exit();
    }
    if (key.upArrow || input === "k") {
      setCursor((prev) => Math.max(0, prev - 1));
    }
    if (key.downArrow || input === "j") {
      setCursor((prev) => Math.min(tasks.length - 1, prev + 1));
    }
    if (key.pageUp) {
      setCursor((prev) => Math.max(0, prev - visibleCount));
    }
    if (key.pageDown) {
      setCursor((prev) => Math.min(tasks.length - 1, prev + visibleCount));
    }
    if (key.home) {
      setCursor(0);
    }
    if (key.end) {
      setCursor(tasks.length - 1);
    }
    if (input === " ") {
      // Toggle completion
      setTasks((prev) =>
        prev.map((task, idx) =>
          idx === cursor ? { ...task, completed: !task.completed } : task,
        ),
      );
    }
    if (key.return || input === "e") {
      // Toggle expand/collapse subtasks
      const taskId = tasks[cursor]?.id;
      if (taskId !== undefined && tasks[cursor]?.subtasks) {
        setExpandedTasks((prev) => {
          const next = new Set(prev);
          if (next.has(taskId)) {
            next.delete(taskId);
          } else {
            next.add(taskId);
          }
          return next;
        });
      }
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="yellow">
          Task List
        </Text>
        <Text dim>
          {" "}
          | j/k or arrows to navigate | space to toggle | enter to expand | q to
          quit
        </Text>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="blue"
        overflow="hidden"
        height={visibleCount + 2}
      >
        {visibleTasks.map((task, visibleIndex) => {
          const actualIndex = scrollOffset + visibleIndex;
          return (
            <TaskItem
              key={task.id}
              task={task}
              isSelected={actualIndex === cursor}
              isExpanded={expandedTasks.has(task.id)}
            />
          );
        })}
      </Box>

      <StatusBar
        tasks={tasks}
        cursor={cursor}
        scrollOffset={scrollOffset}
        visibleCount={visibleCount}
      />
    </Box>
  );
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  using term = createTerm();
  const { waitUntilExit } = await render(<TaskList />, term);
  await waitUntilExit();
}

main().catch(console.error);
