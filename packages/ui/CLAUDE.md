# inkx-ui - Progress Indicators and UI Components

UI components for Ink/inkx TUI apps. Spinners, progress bars, multi-task displays, and ergonomic async wrappers.

## Imports

All exports are **named exports**. Choose the sub-export based on your use case:

```ts
// Main - includes CLI components and wrappers (no React dependency)
import { Spinner, ProgressBar, MultiProgress, withSpinner, withProgress } from "@hightea/ui"

// CLI mode - direct stdout usage, no React
import { Spinner, ProgressBar, MultiProgress } from "@hightea/ui/cli"

// React components - for inkx/Ink TUI apps
import { Spinner, ProgressBar, Tasks, Task, useProgress, ProgressProvider } from "@hightea/ui/react"

// Wrappers - ergonomic async pattern adapters
import {
  withSpinner,
  withProgress,
  wrapGenerator,
  wrapEmitter,
  withSelect,
  withTextInput,
} from "@hightea/ui/wrappers"

// Progress - declarative steps API (recommended for multi-step operations)
import { steps, step } from "@hightea/ui/progress"

// Input - React input components
import { TextInput, Select } from "@hightea/ui/input"

// Display - React display components
import { Table } from "@hightea/ui/display"

// ANSI - low-level terminal control
import { CURSOR_HIDE, CURSOR_SHOW, write, isTTY } from "@hightea/ui/ansi"

// Utils - ETA calculation
import { createETATracker, formatETA } from "@hightea/ui/utils"
```

## Common Patterns

### Declarative Steps (Recommended)

```ts
import { steps, step } from "@hightea/ui/progress"

// Auto-naming from function names
const loader = steps({
  loadModules, // "Load modules"
  loadRepo: {
    // Group: "Load repo"
    discover, //   "Discover"
    parse, //   "Parse"
  },
})

const results = await loader.run({ clear: true })

// Single step
const data = await step("Loading data").wrap(fetchData())
```

### Promise Wrapper

```ts
import { withSpinner } from "@hightea/ui/wrappers"

// Wrap any promise
const data = await withSpinner(fetchData(), "Loading...")

// With options
const data = await withSpinner(operation(), "Processing...", {
  style: "arc",
  clearOnComplete: true,
})
```

### Callback-Based APIs

```ts
import { withProgress } from "@hightea/ui/wrappers"

// Wrap callback-based APIs (perfect for existing onProgress patterns)
await withProgress((onProgress) => manager.syncFromFs(onProgress), {
  phases: {
    scanning: "Scanning files",
    reconciling: "Reconciling changes",
    rules: "Evaluating rules",
  },
})
```

### CLI Spinner

```ts
import { Spinner } from "@hightea/ui/cli"

// Quick start/stop
const stop = Spinner.start("Loading...")
await doWork()
stop()

// With success/fail
const spinner = new Spinner("Processing...")
spinner.start()
try {
  await work()
  spinner.succeed("Done!")
} catch (e) {
  spinner.fail("Failed")
}
```

### Multi-Task Display

```ts
import { MultiProgress } from "@hightea/ui/cli"

const multi = new MultiProgress()

const download = multi.add("Downloading files", { type: "bar", total: 100 })
const process = multi.add("Processing", { type: "spinner" })

multi.start()

download.start()
download.update(50)
download.complete()

process.start()
process.complete()

multi.stop()
```

### React Components

```tsx
import { Spinner, ProgressBar, Tasks, Task } from '@hightea/ui/react'
import { ProgressProvider, useProgress, ProgressIndicator } from '@hightea/ui/react'

// Individual components
<Spinner label="Loading..." style="dots" color="cyan" />
<ProgressBar value={50} total={100} showPercentage showETA />

// Task list
<Tasks>
  <Task title="Scanning files" status="completed" />
  <Task title="Processing" status="running">
    <ProgressBar value={current} total={total} />
  </Task>
  <Task title="Cleanup" status="pending" />
</Tasks>

// Context for deep components
function App() {
  return (
    <ProgressProvider>
      <ProgressIndicator />
      <MainContent />
    </ProgressProvider>
  )
}

function DeepComponent() {
  const { showSpinner, hideSpinner } = useProgress()
  // Use from anywhere in the tree
}
```

### Interactive Prompts

```ts
import { withSelect, withTextInput } from "@hightea/ui/wrappers"

// Selection
const choice = await withSelect({
  message: "Choose environment:",
  options: [
    { label: "Development", value: "dev" },
    { label: "Production", value: "prod" },
  ],
})

// Text input
const name = await withTextInput({
  message: "Enter project name:",
  placeholder: "my-project",
})
```

## Anti-Patterns

### Wrong: Importing React components from main entry

```ts
// WRONG - requires React even for CLI-only usage
import { Spinner } from "@hightea/ui" // This is CLI Spinner, ok
import { Task } from "@hightea/ui" // Task only exists in /react

// RIGHT - use specific sub-exports
import { Spinner } from "@hightea/ui/cli" // CLI version
import { Spinner, Task } from "@hightea/ui/react" // React versions
```

### Wrong: Using deprecated task/tasks API

```ts
// DEPRECATED - task() and tasks() are legacy
import { task, tasks } from "@hightea/ui/progress"

// RIGHT - use steps() for new code
import { steps, step } from "@hightea/ui/progress"

const data = await step("Loading").wrap(fetchData())
```

### Wrong: Not handling spinner cleanup on error

```ts
// WRONG - spinner keeps running if work() throws
const spinner = new Spinner("Working...")
spinner.start()
await work()
spinner.succeed()

// RIGHT - use try/catch or wrapper
const spinner = new Spinner("Working...")
spinner.start()
try {
  await work()
  spinner.succeed()
} catch (e) {
  spinner.fail("Failed")
  throw e
}

// BETTER - use withSpinner (handles cleanup automatically)
await withSpinner(work(), "Working...")
```

### Wrong: Manual ANSI cursor management

```ts
// WRONG - error-prone, doesn't handle cleanup
process.stdout.write("\x1b[?25l") // hide cursor
await work()
process.stdout.write("\x1b[?25h") // show cursor (skipped on error!)

// RIGHT - use withCursor or built-in components
import { withCursor } from "@hightea/ui/ansi"

await withCursor(false, async () => {
  await work()
}) // cursor restored automatically
```

## Key Types

| Type               | Description                           |
| ------------------ | ------------------------------------- |
| `ProgressCallback` | `(info: ProgressInfo) => void`        |
| `ProgressInfo`     | `{ phase, current, total, message? }` |
| `StepsRunner`      | Declarative steps executor            |
| `TaskHandle`       | Multi-progress task control           |
| `CallableSpinner`  | Spinner with `stop()` as function     |

## Sub-Export Summary

| Export                    | Use Case                             |
| ------------------------- | ------------------------------------ |
| `@hightea/ui`          | CLI components + wrappers (no React) |
| `@hightea/ui/cli`      | Direct stdout spinners/progress bars |
| `@hightea/ui/react`    | React components for inkx apps       |
| `@hightea/ui/wrappers` | Async pattern adapters               |
| `@hightea/ui/progress` | Declarative steps API                |
| `@hightea/ui/input`    | React input components               |
| `@hightea/ui/display`  | React display components (Table)     |
| `@hightea/ui/ansi`     | Low-level ANSI terminal control      |
| `@hightea/ui/utils`    | ETA calculation utilities            |
