# inkx-ui

> UI components for Ink/inkx TUI apps - spinners, progress bars, and more

[![npm version](https://img.shields.io/npm/v/@hightea/ui.svg)](https://www.npmjs.com/package/@hightea/ui)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

<p align="center">
  <img src="./assets/demo.gif" alt="progressx demo" width="600">
</p>

## Features

- **Spinners** - Multiple animated styles (dots, line, arc, bounce, pulse)
- **Progress bars** - With percentage, ETA, and custom formats
- **Multi-task** - listr2-style concurrent task display
- **Wrappers** - Ergonomic APIs for promises, callbacks, generators, and EventEmitters
- **React components** - For inkx/Ink TUI apps
- **Zero dependencies** - Only chalk for colors (peer dep for React)
- **TypeScript** - Full type definitions included

## Installation

```bash
bun add @hightea/ui
# or
npm install @hightea/ui
```

## Quick Start

### Wrap any promise with a spinner

```ts
import { withSpinner } from "@hightea/ui/wrappers"

const data = await withSpinner(fetchData(), "Loading data...")
```

<p align="center">
  <img src="./assets/spinner.gif" alt="Spinner demo" width="400">
</p>

### Wrap callback-based APIs (perfect for existing patterns)

```ts
import { withProgress } from "@hightea/ui/wrappers"

await withProgress((onProgress) => manager.syncFromFs(onProgress), {
  phases: {
    scanning: "Scanning files",
    reconciling: "Reconciling changes",
    rules: "Evaluating rules",
  },
})
```

<p align="center">
  <img src="./assets/progress.gif" alt="Progress bar demo" width="500">
</p>

### Multi-task display

```ts
import { MultiProgress } from "@hightea/ui/cli"

const multi = new MultiProgress()

const download = multi.add("Downloading files", { type: "bar", total: 100 })
const process = multi.add("Processing", { type: "spinner" })

multi.start()

download.start()
// ... update progress
download.complete()

process.start()
process.complete()

multi.stop()
```

<p align="center">
  <img src="./assets/multi.gif" alt="Multi-task demo" width="500">
</p>

## API Reference

### CLI Mode (`@hightea/ui/cli`)

#### Spinner

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
  spinner.succeed("Done!") // ✔ Done!
} catch (e) {
  spinner.fail("Failed") // ✖ Failed
}

// Options
const spinner = new Spinner({
  text: "Loading...",
  style: "dots", // "dots" | "line" | "arc" | "bounce" | "pulse"
  color: "cyan",
  interval: 80, // ms
})
```

#### ProgressBar

```ts
import { ProgressBar } from "@hightea/ui/cli"

const bar = new ProgressBar({
  total: 100,
  format: ":bar :percent | :current/:total | ETA: :eta",
  width: 40,
  complete: "█",
  incomplete: "░",
})

bar.start()
bar.update(50)
bar.increment(10)
bar.stop()

// Multi-phase
bar.setPhase("scanning", { current: 0, total: 100 })
bar.setPhase("processing", { current: 0, total: 50 })
```

**Format tokens:**

- `:bar` - The progress bar
- `:percent` - Percentage (0-100%)
- `:current` - Current value
- `:total` - Total value
- `:eta` - Estimated time remaining
- `:elapsed` - Elapsed time
- `:rate` - Items per second
- `:phase` - Current phase name

#### MultiProgress

```ts
import { MultiProgress } from "@hightea/ui/cli"

const multi = new MultiProgress()

const task1 = multi.add("Download assets", { type: "bar", total: 100 })
const task2 = multi.add("Compile code", { type: "spinner" })
const task3 = multi.add("Run tests", { type: "spinner" })

multi.start()

task1.start()
task1.update(50)
task1.complete()

task2.start()
task2.complete("Compiled successfully")

task3.start()
task3.fail("3 tests failed")

multi.stop()
```

### Wrappers (`@hightea/ui/wrappers`)

#### withSpinner

```ts
import { withSpinner } from "@hightea/ui/wrappers"

// Basic
const result = await withSpinner(asyncOperation(), "Loading...")

// With options
const result = await withSpinner(operation(), "Processing...", {
  style: "arc",
  clearOnComplete: true,
})

// Dynamic text
const result = await withSpinner(longOperation(), (elapsed) => `Processing... (${elapsed}s)`)
```

#### withProgress

```ts
import { withProgress } from "@hightea/ui/wrappers";

// Wrap callback-based APIs
await withProgress(
  (onProgress) => {
    // onProgress({ phase: "scanning", current: 0, total: 100 })
    return doWork(onProgress);
  },
  {
    phases: {
      scanning: "Scanning",
      processing: "Processing",
      finalizing: "Finalizing"
    }
  }
);

// Create reusable callback
const [onProgress, complete] = createProgressCallback({ phases: { ... } });
await someApi(onProgress);
complete();
```

#### wrapGenerator

```ts
import { wrapGenerator } from "@hightea/ui/wrappers"

// Wrap a progress generator
function* processItems() {
  for (let i = 0; i < items.length; i++) {
    processItem(items[i])
    yield { current: i + 1, total: items.length }
  }
}

await wrapGenerator(processItems(), "Processing items")
```

#### wrapEmitter

```ts
import { wrapEmitter, waitForEvent } from "@hightea/ui/wrappers"

// Track EventEmitter state
const stop = wrapEmitter(syncManager, {
  initialText: "Starting...",
  events: {
    ready: { text: "Ready", succeed: true },
    "state-change": { getText: (s) => `State: ${s}` },
    error: { fail: true },
  },
})

// Wait for specific event
await waitForEvent(emitter, "ready", "Waiting...", { timeout: 5000 })
```

### React Components (`@hightea/ui/react`)

```tsx
import { Spinner, ProgressBar, Tasks, Task } from "@hightea/ui/react";

// Spinner
<Spinner label="Loading..." style="dots" color="cyan" />

// Progress bar
<ProgressBar
  value={50}
  total={100}
  width={30}
  showPercentage
  showETA
/>

// Task list
<Tasks>
  <Task title="Scanning files" status="completed" />
  <Task title="Processing" status="running">
    <ProgressBar value={current} total={total} />
  </Task>
  <Task title="Cleanup" status="pending" />
</Tasks>
```

#### Hooks

```tsx
import { useSpinnerFrame, useProgressBar, useTasks, useProgress } from "@hightea/ui/react"

// Spinner frame for custom components
const frame = useSpinnerFrame("dots")

// Progress bar state
const { value, update, increment, eta, percent } = useProgressBar(100)

// Task list state
const { tasks, start, complete, fail } = useTasks([
  { id: "scan", title: "Scanning" },
  { id: "process", title: "Processing" },
])

// Global progress context
const { showSpinner, hideSpinner, updateProgress } = useProgress()
```

#### Context Provider

```tsx
import { ProgressProvider, ProgressIndicator, useProgress } from "@hightea/ui/react"

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

  const handleLoad = async () => {
    showSpinner("Loading...")
    await loadData()
    hideSpinner()
  }
}
```

## Spinner Styles

| Style    | Preview    | Description            |
| -------- | ---------- | ---------------------- | ----------- |
| `dots`   | ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ | Braille dots (default) |
| `line`   | -\\        | /                      | Simple line |
| `arc`    | ◜◠◝◞◡◟     | Arc rotation           |
| `bounce` | ⠁⠂⠄⠂       | Bouncing dot           |
| `pulse`  | █▓▒░▒▓     | Pulsing block          |

## Comparison

| Feature              | progressx | ora | cli-progress | listr2 |
| -------------------- | --------- | --- | ------------ | ------ |
| Spinners             | ✅        | ✅  | ❌           | ✅     |
| Progress bars        | ✅        | ❌  | ✅           | ✅     |
| Multi-task           | ✅        | ❌  | ✅           | ✅     |
| Promise wrapper      | ✅        | ✅  | ❌           | ❌     |
| Callback wrapper     | ✅        | ❌  | ❌           | ❌     |
| Generator wrapper    | ✅        | ❌  | ❌           | ❌     |
| EventEmitter wrapper | ✅        | ❌  | ❌           | ❌     |
| React components     | ✅        | ❌  | ❌           | ❌     |
| ETA calculation      | ✅        | ❌  | ✅           | ✅     |
| Zero deps (CLI)      | ✅        | ❌  | ✅           | ❌     |

## Before/After

### Before (manual ANSI)

```ts
process.stdout.write("\x1b[?25l") // hide cursor
try {
  const result = await manager.syncFromFs((info) => {
    if (info.phase !== lastPhase) {
      if (lastPhase) process.stdout.write("\n")
      lastPhase = info.phase
    }
    const phaseName = info.phase === "scanning" ? "Scanning" : info.phase === "reconciling" ? "Reconciling" : "Rules"
    const progress = info.total > 0 ? ` [${info.current}/${info.total}]` : ""
    process.stdout.write(`\r${chalk.dim(phaseName)}${progress}\x1b[K`)
  })
  process.stdout.write("\x1b[?25h\n") // show cursor
} catch (error) {
  process.stdout.write("\x1b[?25h\n")
  throw error
}
```

### After (with progressx)

```ts
await withProgress((onProgress) => manager.syncFromFs(onProgress), {
  phases: { scanning: "Scanning", reconciling: "Reconciling", rules: "Rules" },
})
```

## Contributing

Contributions welcome! Please read the [contributing guidelines](CONTRIBUTING.md) first.

## License

MIT © [Beorn](https://github.com/beorn)
