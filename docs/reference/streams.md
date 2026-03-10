# AsyncIterable Stream Helpers

Pure functions for composing AsyncIterables. No EventEmitters, no callbacks.

## Philosophy

**Pull-based**: Consumer controls flow via `for await...of`. Natural backpressure.

**Lazy**: Iterators don't start until first `next()`. No work until consumed.

**Cleanup**: All helpers honor `return()` for early-break cleanup.

## Core Helpers

### merge(...sources)

Merge multiple AsyncIterables into one. Values emit in arrival order.

```typescript
import { merge, map } from "@silvery/term/streams";

const keys = term.keys();
const resizes = term.resizes();

const events = merge(
  map(keys, (k) => ({ type: "key", ...k })),
  map(resizes, (r) => ({ type: "resize", ...r })),
);

for await (const event of events) {
  // Process any event
}
```

**Behavior:**

- First-come ordering (non-deterministic if simultaneous)
- Completes when ALL sources complete
- Errors propagate, remaining sources cleaned up
- Fresh iterable per call (don't share between consumers)

### map(source, fn)

Transform each value.

```typescript
const keyEvents = map(keys, (k) => ({ type: "key", key: k }));
```

### filter(source, predicate)

Keep values matching predicate.

```typescript
const letters = filter(keys, (k) => /^[a-z]$/.test(k.key));
```

### filterMap(source, fn)

Filter + map in one pass. Return `undefined` to skip.

```typescript
const keyEvents = filterMap(events, (e) => (e.type === "key" ? e : undefined));
```

### takeUntil(source, signal)

Stop when AbortSignal fires. Graceful completion (no error).

```typescript
const controller = new AbortController();

// Later: controller.abort() ends iteration
for await (const event of takeUntil(events, controller.signal)) {
  // ...
}
```

### take(source, n)

Take first n values.

```typescript
const first3 = take(events, 3);
```

## Composition Helpers

### concat(...sources)

Concatenate in sequence (not interleaved).

```typescript
const all = concat(header, body, footer);
```

### zip(...sources)

Zip together. Completes at shortest source.

```typescript
const pairs = zip(keys, timestamps); // [key, timestamp][]
```

### batch(source, size)

Collect into arrays of size n.

```typescript
const batched = batch(events, 10); // AsyncIterable<Event[]>
```

## Rate Limiting

### throttle(source, ms)

Emit first, then ignore for duration.

```typescript
const throttled = throttle(mouseMoves, 16); // ~60fps
```

### debounce(source, ms)

**Note**: True debouncing is complex with pull-based iterables. This implementation yields only the final value after source completes.

```typescript
const debounced = debounce(source, 300); // Last value after source ends
```

## Testing Helpers

### fromArray(items)

Create AsyncIterable from array.

```typescript
const events = fromArray([
  { type: "key", key: "j" },
  { type: "key", key: "k" },
]);
```

### fromArrayWithDelay(items, ms)

Create with delay between items.

```typescript
const slow = fromArrayWithDelay([1, 2, 3], 100); // 100ms gaps
```

## Cleanup Guarantee

All helpers clean up properly on:

- Normal completion (source exhausted)
- Early break (`break` in `for await`)
- Errors (thrown and propagated)

```typescript
for await (const event of merge(a, b, c)) {
  if (done) break; // All 3 sources get return() called
}
```

## Known Limitations

1. **Multiple consumers**: Don't share merged iterables. Each `merge()` call creates fresh iterable.

2. **Slow consumer blocks producer**: If you await slow work, next event is blocked.

   ```typescript
   for await (const e of events) {
     await slowWork(); // Blocks next event
   }
   ```

   Mitigation: Use separate async task for slow work.

3. **Debounce is limited**: Pull-based iterables can't do real-time debouncing. Use push-based patterns for that.

4. **Merge ordering**: If two sources yield "simultaneously", order is implementation-defined (but consistent within one iteration).

## React Integration

Bridge to React hooks via AbortController:

```typescript
useEffect(() => {
  const controller = new AbortController();
  const events = takeUntil(runtime.events(), controller.signal);

  (async () => {
    for await (const event of events) {
      if (event.type === "key") handler(event.key);
    }
  })();

  return () => controller.abort();
}, []);
```
