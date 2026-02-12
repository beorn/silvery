/**
 * Tests that all examples in the viewer registry:
 * 1. Can be imported without launching a TUI (import.meta.main guard)
 * 2. Export the named component (if specified in registry)
 *
 * This prevents regressions where new examples forget the import.meta.main guard,
 * causing the viewer to crash when importing them for preview.
 */

import { describe, test, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

// Mirror the viewer's example registry — keep in sync with examples/viewer.tsx
const EXAMPLES: {
  name: string
  file: string
  component?: string
}[] = [
  { name: "Dashboard", file: "dashboard/index.tsx", component: "Dashboard" },
  {
    name: "Overflow Test",
    file: "test-overflow/index.tsx",
    component: "OverflowApp",
  },
  { name: "Kanban Board", file: "kanban/index.tsx", component: "KanbanBoard" },
  { name: "Task List", file: "task-list/index.tsx", component: "TaskList" },
  { name: "Scroll", file: "scroll/index.tsx", component: "ScrollExample" },
  {
    name: "Search Filter",
    file: "search-filter/index.tsx",
    component: "SearchApp",
  },
  { name: "Async Data", file: "async-data/index.tsx" },
  {
    name: "Layout Ref",
    file: "layout-ref/index.tsx",
    component: "LayoutRefApp",
  },
  { name: "TextArea", file: "textarea/index.tsx", component: "NoteEditor" },
  { name: "Todo App", file: "app-todo.tsx" },
  { name: "Hello Runtime", file: "hello-runtime.tsx" },
  { name: "Runtime Counter", file: "runtime-counter.tsx" },
  { name: "Run Counter", file: "run-counter.tsx" },
  { name: "Elm Counter", file: "mode3-counter.tsx" },
  { name: "Inline Simple", file: "inline-simple.tsx" },
  { name: "Inline Progress", file: "inline-progress.tsx" },
  { name: "Scrollback", file: "scrollback/index.tsx", component: "Repl" },
  { name: "Non-TTY Mode", file: "inline-nontty.tsx" },
]

const EXAMPLES_DIR = resolve(__dirname, "../examples")

describe("examples viewer compatibility", () => {
  test("all examples have import.meta.main guard", () => {
    const missing: string[] = []

    for (const ex of EXAMPLES) {
      const path = resolve(EXAMPLES_DIR, ex.file)
      const source = readFileSync(path, "utf-8")
      if (!source.includes("import.meta.main")) {
        missing.push(`${ex.name} (${ex.file})`)
      }
    }

    expect(missing).toEqual([])
  })

  // Examples with component exports must be importable without side effects
  // and must export the named component
  for (const ex of EXAMPLES.filter((e) => e.component)) {
    test(`${ex.name}: exports ${ex.component}`, async () => {
      const path = resolve(EXAMPLES_DIR, ex.file)
      const mod = (await import(path)) as Record<string, unknown>
      expect(typeof mod[ex.component!]).toBe("function")
    })
  }
})
