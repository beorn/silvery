# @silvery/signals

Reactive signals for silvery -- thin wrapper around [alien-signals](https://github.com/nicepkg/alien-signals).

Provides fine-grained reactivity: signals hold values, computeds derive from them, and effects re-run when dependencies change.

Part of the [Silvery](https://silvery.dev) ecosystem.

## Install

> Install from npm; a git install resolves the TypeScript source and runs only under Bun.

```bash
npm install @silvery/signals
```

## Quick Start

```ts
import { signal, computed, effect, batch } from "@silvery/signals"

const count = signal(0)
const doubled = computed(() => count() * 2)
effect(() => console.log(`doubled: ${doubled()}`)) // logs "doubled: 0"

batch(() => {
  count(1)
  count(2)
}) // logs "doubled: 4" (once, not twice)
```

## API

### Core

- **`signal(value)`** -- Create a reactive value (call to read, call with arg to write)
- **`computed(fn)`** -- Derived value that recomputes when dependencies change
- **`effect(fn)`** -- Side effect that re-runs when dependencies change
- **`batch(fn)`** -- Batch multiple updates into one notification

### Advanced

- **`effectScope(fn)`** -- Group effects for collective disposal
- **`startBatch()` / `endBatch()`** -- Manual batch control
- **`trigger(signal)`** -- Force subscribers to re-run
- **`isSignal(v)`**, **`isComputed(v)`**, **`isEffect(v)`**, **`isEffectScope(v)`** -- Type guards

## License

MIT
