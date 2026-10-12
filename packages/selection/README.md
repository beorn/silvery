# @silvery/selection

Node selection, text sub-selection, and pointer gestures for [Silvery](../../README.md) apps. Pure transitions operate on serializable snapshots; `createSelection` adds reactive reads through alien-signals.

```ts
import { createSelection, type ID } from "@silvery/selection"

const first = "first" as ID
const middle = "middle" as ID
const last = "last" as ID
const order = [first, middle, last]
const nodes = new Set(order)

const selection = createSelection({
  tree: {
    walkOrder: () => order,
    contains: (id) => nodes.has(id),
    parent: () => undefined,
    children: () => [],
  },
})

selection.node.select([first])
selection.node.extend(last)
console.log(selection.snapshot().ids) // ["first", "middle", "last"]
```

**Your tree supplies the order.** Implement `SelectionApp.tree` using your application's visible walk order, parent/child relationships, and an existence lookup. The example uses a flat list. `ID` is a branded string type; adapt the IDs your application already owns at this boundary.

**Reads and writes.** Read computed values with `node.cursor()`, `node.anchor()`, `node.ids()`, `kind()`, and `snapshot()`. Use `node.select`, `node.extend`, `deselect`, and the `text`, `root`, and `drag` accessors to change selection. Drag previews become committed on `drag.end()` and return to the starting state on `drag.cancel()`.

**Tree changes.** Call `reconcile()` when valid nodes change. For a structural edit with before/after tree snapshots, use `transform(op, prevTree, nextTree)` after the edit to repair selected IDs and cursor state together.

For reducer-style consumers, the package also exports the pure `apply*` transitions, `applyPointerEvent`, ordered sets, and occurrence-path helpers. See the [public exports](src/index.ts), [store contract](src/store.ts), and [existing examples in the store tests](tests/store.test.ts).

**License:** [MIT](LICENSE).
