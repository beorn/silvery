/**
 * AsyncIterable stream helpers for event-driven TUI architecture.
 *
 * These are pure functions over AsyncIterables - no EventEmitters, no callbacks.
 * All helpers properly handle cleanup via return() on early break.
 *
 * @example
 * ```typescript
 * const keys = term.keys()
 * const resizes = term.resizes()
 *
 * // Merge multiple sources
 * const events = merge(
 *   map(keys, k => ({ type: 'key', ...k })),
 *   map(resizes, r => ({ type: 'resize', ...r }))
 * )
 *
 * // Consume until ctrl+c
 * for await (const event of events) {
 *   if (event.type === 'key' && event.key === 'ctrl+c') break
 * }
 * ```
 */

/**
 * Merge multiple AsyncIterables into one.
 *
 * Values are emitted in arrival order (first-come). When all sources complete,
 * the merged iterable completes. If any source throws, the error propagates
 * and remaining sources are cleaned up.
 *
 * IMPORTANT: Each call to merge() creates a fresh iterable. Don't share
 * the same merged iterable between multiple consumers.
 *
 * @example
 * ```typescript
 * const merged = merge(keys, resizes, ticks)
 * for await (const event of merged) {
 *   // Process events from any source
 * }
 * ```
 */
export async function* merge<T>(
  ...sources: AsyncIterable<T>[]
): AsyncGenerator<T, void, undefined> {
  if (sources.length === 0) return

  // Track active iterators and their pending promises
  const iterators = sources.map((source) => source[Symbol.asyncIterator]())
  const pending = new Map<number, Promise<{ index: number; result: IteratorResult<T, unknown> }>>()

  async function nextWithIndex(
    idx: number,
  ): Promise<{ index: number; result: IteratorResult<T, unknown> }> {
    const iterator = iterators[idx]
    if (!iterator) throw new Error(`No iterator at index ${idx}`)
    const result = await iterator.next()
    return { index: idx, result }
  }

  // Start all iterators
  for (let i = 0; i < iterators.length; i++) {
    pending.set(i, nextWithIndex(i))
  }

  try {
    while (pending.size > 0) {
      // Race all pending promises
      const { index, result } = await Promise.race(pending.values())

      if (result.done) {
        // This source is exhausted, remove it
        pending.delete(index)
      } else {
        // Yield the value and request next from this source
        yield result.value
        pending.set(index, nextWithIndex(index))
      }
    }
  } finally {
    // Clean up all iterators on early exit or error
    await Promise.all(iterators.map((it) => (it.return ? it.return() : Promise.resolve())))
  }
}

/**
 * Transform each value from an AsyncIterable.
 *
 * @example
 * ```typescript
 * const keyEvents = map(keys, k => ({ type: 'key' as const, key: k }))
 * ```
 */
export async function* map<T, U>(
  source: AsyncIterable<T>,
  fn: (value: T) => U,
): AsyncGenerator<U, void, undefined> {
  const iterator = source[Symbol.asyncIterator]()
  try {
    // Use the iterator directly to avoid double-iteration
    for await (const value of { [Symbol.asyncIterator]: () => iterator }) {
      yield fn(value)
    }
  } finally {
    if (iterator.return) {
      await iterator.return()
    }
  }
}

/**
 * Filter values from an AsyncIterable.
 *
 * @example
 * ```typescript
 * const letters = filter(keys, k => k.key.length === 1)
 * ```
 */
export async function* filter<T>(
  source: AsyncIterable<T>,
  predicate: (value: T) => boolean,
): AsyncGenerator<T, void, undefined> {
  const iterator = source[Symbol.asyncIterator]()
  try {
    for await (const value of { [Symbol.asyncIterator]: () => iterator }) {
      if (predicate(value)) {
        yield value
      }
    }
  } finally {
    if (iterator.return) {
      await iterator.return()
    }
  }
}

/**
 * Filter and transform in one pass (type narrowing).
 *
 * @example
 * ```typescript
 * const keyEvents = filterMap(events, e =>
 *   e.type === 'key' ? e : undefined
 * )
 * ```
 */
export async function* filterMap<T, U>(
  source: AsyncIterable<T>,
  fn: (value: T) => U | undefined,
): AsyncGenerator<U, void, undefined> {
  const iterator = source[Symbol.asyncIterator]()
  try {
    for await (const value of { [Symbol.asyncIterator]: () => iterator }) {
      const mapped = fn(value)
      if (mapped !== undefined) {
        yield mapped
      }
    }
  } finally {
    if (iterator.return) {
      await iterator.return()
    }
  }
}

/**
 * Take values until an AbortSignal fires.
 *
 * When the signal aborts, the iterator completes gracefully (no error thrown).
 * The source iterator is properly cleaned up.
 *
 * @example
 * ```typescript
 * const controller = new AbortController()
 * const events = takeUntil(allEvents, controller.signal)
 *
 * // Later: controller.abort() will end the iteration
 * ```
 */
export async function* takeUntil<T>(
  source: AsyncIterable<T>,
  signal: AbortSignal,
): AsyncGenerator<T, void, undefined> {
  if (signal.aborted) return

  const iterator = source[Symbol.asyncIterator]()

  // Create a promise that resolves when signal aborts
  let abortResolve: () => void
  const abortPromise = new Promise<void>((resolve) => {
    abortResolve = resolve
  })
  const onAbort = () => abortResolve()
  signal.addEventListener("abort", onAbort, { once: true })

  try {
    while (!signal.aborted) {
      // Race between next value and abort
      const result = await Promise.race([
        iterator.next(),
        abortPromise.then(() => ({ done: true, value: undefined }) as const),
      ])

      if (result.done) break
      yield result.value as T
    }
  } finally {
    signal.removeEventListener("abort", onAbort)
    if (iterator.return) {
      await iterator.return()
    }
  }
}

/**
 * Take the first n values from an AsyncIterable.
 *
 * @example
 * ```typescript
 * const firstThree = take(events, 3)
 * ```
 */
export async function* take<T>(
  source: AsyncIterable<T>,
  count: number,
): AsyncGenerator<T, void, undefined> {
  if (count <= 0) return

  const iterator = source[Symbol.asyncIterator]()
  let taken = 0

  try {
    for await (const value of { [Symbol.asyncIterator]: () => iterator }) {
      yield value
      taken++
      if (taken >= count) break
    }
  } finally {
    if (iterator.return) {
      await iterator.return()
    }
  }
}

/**
 * Create an AsyncIterable from an array (useful for testing).
 *
 * @example
 * ```typescript
 * const events = fromArray([
 *   { type: 'key', key: 'j' },
 *   { type: 'key', key: 'k' },
 * ])
 * ```
 */
export async function* fromArray<T>(items: T[]): AsyncGenerator<T, void, undefined> {
  for (const item of items) {
    yield item
  }
}

/**
 * Create an AsyncIterable that yields after a delay (useful for testing).
 *
 * @example
 * ```typescript
 * const delayed = fromArrayWithDelay([1, 2, 3], 100) // 100ms between each
 * ```
 */
export async function* fromArrayWithDelay<T>(
  items: T[],
  delayMs: number,
): AsyncGenerator<T, void, undefined> {
  for (const item of items) {
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    yield item
  }
}

/**
 * Throttle high-frequency sources.
 *
 * Emits the first value immediately, then ignores values for the specified
 * duration. After the duration, the next value is emitted and the cycle repeats.
 *
 * @example
 * ```typescript
 * const throttled = throttle(mouseMoves, 16) // ~60fps
 * ```
 */
export async function* throttle<T>(
  source: AsyncIterable<T>,
  ms: number,
): AsyncGenerator<T, void, undefined> {
  const iterator = source[Symbol.asyncIterator]()
  let lastEmit = 0

  try {
    for await (const value of { [Symbol.asyncIterator]: () => iterator }) {
      const now = Date.now()
      if (now - lastEmit >= ms) {
        lastEmit = now
        yield value
      }
    }
  } finally {
    if (iterator.return) {
      await iterator.return()
    }
  }
}

/**
 * Debounce values - only emit after source is quiet for specified duration.
 *
 * NOTE: With pull-based AsyncIterables, true debouncing is complex. This
 * implementation collects all values and only yields the final value after
 * the source completes and quiet period passes. For real-time debouncing,
 * consider using a push-based pattern or EventEmitter.
 *
 * @example
 * ```typescript
 * const debounced = debounce(searchInput, 300) // Yields last value after source ends + delay
 * ```
 */
export async function* debounce<T>(
  source: AsyncIterable<T>,
  ms: number,
): AsyncGenerator<T, void, undefined> {
  const iterator = source[Symbol.asyncIterator]()
  let last: { value: T } | undefined

  try {
    for await (const value of { [Symbol.asyncIterator]: () => iterator }) {
      last = { value }
    }

    if (last) {
      await new Promise((resolve) => setTimeout(resolve, ms))
      yield last.value
    }
  } finally {
    if (iterator.return) {
      await iterator.return()
    }
  }
}

/**
 * Collect values into batches of specified size.
 *
 * @throws {Error} If size is not positive
 *
 * @example
 * ```typescript
 * const batched = batch(events, 10) // Emit arrays of 10 events
 * ```
 */
export function batch<T>(
  source: AsyncIterable<T>,
  size: number,
): AsyncGenerator<T[], void, undefined> {
  if (size <= 0) throw new Error("Batch size must be positive")
  return batchImpl(source, size)
}

async function* batchImpl<T>(
  source: AsyncIterable<T>,
  size: number,
): AsyncGenerator<T[], void, undefined> {
  const iterator = source[Symbol.asyncIterator]()
  let buffer: T[] = []

  try {
    for await (const value of { [Symbol.asyncIterator]: () => iterator }) {
      buffer.push(value)
      if (buffer.length >= size) {
        yield buffer
        buffer = []
      }
    }
    // Emit remaining items
    if (buffer.length > 0) {
      yield buffer
    }
  } finally {
    if (iterator.return) {
      await iterator.return()
    }
  }
}

/**
 * Concatenate multiple AsyncIterables in sequence.
 *
 * @example
 * ```typescript
 * const all = concat(header, body, footer)
 * ```
 */
export async function* concat<T>(
  ...sources: AsyncIterable<T>[]
): AsyncGenerator<T, void, undefined> {
  for (const source of sources) {
    yield* source
  }
}

/**
 * Zip multiple AsyncIterables together.
 * Completes when the shortest source completes.
 *
 * @example
 * ```typescript
 * const pairs = zip(keys, timestamps) // [key, timestamp][]
 * ```
 */
export async function* zip<T extends unknown[]>(
  ...sources: { [K in keyof T]: AsyncIterable<T[K]> }
): AsyncGenerator<T, void, undefined> {
  const iterators = sources.map((source) => source[Symbol.asyncIterator]())

  try {
    while (true) {
      const results = await Promise.all(iterators.map((it) => it.next()))

      // If any source is done, we're done
      if (results.some((r) => r.done)) break

      yield results.map((r) => r.value) as T
    }
  } finally {
    await Promise.all(iterators.map((it) => (it.return ? it.return() : Promise.resolve())))
  }
}
