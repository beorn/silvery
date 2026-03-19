# Scaling with Signals

As your app grows, selectors show their cost. Zustand runs _every_ selector on _every_ store update — 100 `<Row>` components each with `useApp(s => s.rows.get(id))` means 100 selector calls when the cursor moves, even though only 2 rows changed.

[Signals](https://github.com/tc39/proposal-signals) (TC39 proposal, stage 1) flip this. Components call signal accessors and automatically subscribe to exactly what they touched — no diffing, no linear scan. Same model as [SolidJS](https://www.solidjs.com/) and [Angular](https://angular.dev/guide/signals). We use [alien-signals](https://github.com/stackblitz/alien-signals) — the fastest signals implementation (~1KB, push-pull, proven by Vue 3.6 adoption).

With signals, the factory returns a plain object — signals _are_ the reactive state, so you don't need Zustand's `set()`. Read with `sig()`, write with `sig(newValue)`:

```tsx
import { signal, computed, batch } from "@silvery/signal"

const app = createApp(
  () => {
    const cursor = signal(0)
    const items = signal([
      { id: "1", text: "Buy milk", done: false },
      { id: "2", text: "Write docs", done: true },
      { id: "3", text: "Fix bug", done: false },
    ])
    const doneCount = computed(() => items().filter((i) => i.done).length)

    return {
      cursor,
      items,
      doneCount,
      moveCursor(delta: number) {
        cursor(clamp(cursor() + delta, 0, items().length - 1))
      },
      toggleDone() {
        const i = cursor()
        items(items().map((item, j) => (j === i ? { ...item, done: !item.done } : item)))
      },
    }
  },
  {
    key(input, key, { store }) {
      if (input === "j") store.moveCursor(1)
      if (input === "k") store.moveCursor(-1)
      if (input === "x") store.toggleDone()
      if (input === "q") return "exit"
    },
  },
)
```

`signal()` creates reactive state — call it to read, call with a value to write. `computed()` derives from signals — `doneCount` recomputes only when `items` changes, not on cursor moves. `batch()` groups multiple signal writes into a single notification:

```tsx
batch(() => {
  cursor(0)
  items(newItems)
  filter("")
})
// → one notification, one re-render
```

Signals are orthogonal to the levels — you can use them at Level 2 or Level 5. They're a performance optimization, not a conceptual shift. If your app doesn't have performance issues with selectors, skip them.

> **Silvery:** `@silvery/signal` provides the reactive core (alien-signals) plus `createStore()` for deep objects, `createResource()` for async, and `/react` bindings (`useSignal`). React integration via `useSyncExternalStore`.

## Scaling to Thousands of Items

Your todo list has 5,000 items and the cursor stutters. Two techniques help at any level:

**Per-entity signals** — `Map<string, Signal<T>>` gives each item its own signal. Edit one item → 1 re-render:

```tsx
const cursor = signal<string>("item-0")
const items = new Map<string, Signal<ItemData>>()

return {
  cursor,
  items,
  currentItem: computed(() => items.get(cursor())?.()),
  updateItem(id: string, data: ItemData) {
    const s = items.get(id)
    if (s) s(data) // only this item's subscribers re-render
  },
  removeItem(id: string) {
    items.delete(id) // clean up — stale signals leak memory
  },
}
```

**VirtualList** — only mount the ~50 visible rows. Combined with per-entity signals: edit one item → 1 re-render. Move cursor → 2 re-renders. O(visible), not O(total).

## See Also

- [Building an App](../guides/terminal-apps.md) — the guide that introduces shared stores at Level 2
- [State Management](../guides/state-management.md) — createApp, createSlice API reference
- [Hooks Reference](hooks.md) — useApp, useContentRect
