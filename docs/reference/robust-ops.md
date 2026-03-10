# Designing Robust Ops

The examples in the [Building an App](../guide/building-an-app.md) Level 3 guide use index-based ops: `{ op: "toggleDone", index: 2 }`. This works for single-session undo but breaks when ops need to survive reordering — undo after other edits, concurrent users, or offline sync. If someone inserts at index 1, your `index: 2` now points to the wrong item.

**Prefer identity-based ops**: `{ op: "toggleDone", id: "abc123" }`. This is the same principle behind CRDTs[^crdt] — operations that commute (produce the same result regardless of order) are safe for concurrent use.

```typescript
// Fragile — depends on ordering
type FragileOp = { op: "toggleDone"; index: number };

// Robust — works regardless of order
type RobustOp = { op: "toggleDone"; id: string };

// Gold standard — idempotent (applying twice = applying once)
type IdempotentOp = { op: "setDone"; id: string; done: boolean };
```

| Op style                   | Undo    | Concurrent | Offline sync       |
| -------------------------- | ------- | ---------- | ------------------ |
| `index: 2`                 | Fragile | Breaks     | Breaks             |
| `id: "abc"` + toggle       | Works   | Works      | Double-toggle risk |
| `id: "abc"` + `done: true` | Works   | Works      | Idempotent         |

You don't need to start here. Index-based is fine for simple undo. But when you add collaboration, offline sync, or AI automation — design identity-based, ideally idempotent.

## See Also

- [Building an App — Level 3](../guide/building-an-app.md#level-3-everything-is-data) — where ops-as-data is introduced

---

[^crdt]: [CRDTs](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type) (Conflict-free Replicated Data Types) — data structures designed for distributed systems that can be edited independently on multiple replicas and merged without conflicts.
