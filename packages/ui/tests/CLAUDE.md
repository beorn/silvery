# inkx-ui Tests

**Layer 1 — UI Components**: Progress indicators, input widgets, display components, and async wrappers for TUI apps.

## What to Test Here

- **CLI components**: Spinner lifecycle (start/stop/succeed/fail), ProgressBar (update/ratio/ETA), MultiProgress (task management)
- **React components**: Spinner, ProgressBar, Task/Tasks, ProgressProvider/useProgress element creation and props
- **Input components**: TextInput (value/onChange/placeholder), Select (options/value/maxVisible)
- **Display components**: Table (columns, data, border, alignment)
- **Wrappers**: withSpinner (promise resolution), withProgress (callback-based), wrapGenerator, wrapEmitter/waitForEvent
- **Declarative steps**: `steps()` definition parsing, label generation (camelCase to title), step execution
- **ETA utilities**: calculateETA, formatETA, createETATracker with sample buffers
- **Dotz streaming**: incremental report rendering via store flush (uses `inkx` render)

## What NOT to Test Here

- Actual terminal rendering / ANSI output — most tests capture/suppress stdout
- inkx framework internals — that's @hightea/term
- Real async operations — wrappers are tested with resolved promises

## Patterns

Most tests suppress stdout to avoid spinner/progress output noise:

```typescript
let originalWrite: typeof process.stdout.write

beforeEach(() => {
  originalWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = (() => true) as typeof process.stdout.write
})

afterEach(() => {
  process.stdout.write = originalWrite
})

test("withSpinner resolves with promise result", async () => {
  const result = await withSpinner(Promise.resolve(42), "Loading", { clearOnComplete: true })
  expect(result).toBe(42)
})
```

## Ad-Hoc Testing

```bash
bun vitest run vendor/hightea/packages/ui/tests/                    # All inkx-ui tests
bun vitest run vendor/hightea/packages/ui/tests/spinner.test.ts     # Spinner tests
bun vitest run vendor/hightea/packages/ui/tests/select.test.ts      # Select component
bun vitest run vendor/hightea/packages/ui/tests/declarative-steps.test.ts  # Steps API
```

## Efficiency

Fast tests (~100ms). CLI component tests are slightly heavier due to stdout capture. React component tests only verify element creation (no full render). The `dotz-streaming` test uses `inkx` render which adds ~200ms.

## See Also

- [Test layering philosophy](../../.claude/skills/tests/test-layers.md)
