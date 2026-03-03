// --- Types ---

/** True if F accepts at least 2 args */
type HasParams<F> = F extends (a: any, b: any, ...rest: any[]) => any ? true : false

/** Extract 2nd arg type, or never for 1-arg handlers */
type HandlerParams<F> =
  HasParams<F> extends true ? (F extends (s: any, params: infer P) => any ? P : never) : never

/** One variant of the op union */
type OpVariant<Name extends string, F> =
  [HandlerParams<F>] extends [never] ? { op: Name } : { op: Name } & HandlerParams<F>

/** Full op union inferred from handler map */
export type InferOp<H> = {
  [K in keyof H & string]: OpVariant<K, H[K]>
}[keyof H & string]

/** Union of all handler return types */
type ApplyReturn<H> = {
  [K in keyof H]: H[K] extends (...args: any[]) => infer R ? R : never
}[keyof H]

/** Handlers-only slice (no state factory) */
export type Slice<S, H extends Record<string, (s: S, ...args: any[]) => any>> = H & {
  apply(s: S, op: InferOp<H>): ApplyReturn<H>
  readonly Op: InferOp<H>
}

/** Slice with bundled state factory */
export type SliceWithInit<S, H extends Record<string, (s: S, ...args: any[]) => any>> = Slice<S, H> & {
  create(): { state: S; apply: (op: InferOp<H>) => ApplyReturn<H> }
}

// --- Implementation ---

// Shared: build the slice object from handlers
function makeSlice<S, H extends Record<string, (s: S, ...args: any[]) => any>>(handlers: H): Slice<S, H> {
  const apply = (s: S, op: { op: string }) => {
    const handler = handlers[op.op]
    if (!handler) throw new Error(`Unknown op: ${op.op}`)
    return handler(s, op)
  }
  return Object.assign({ apply }, handlers) as any
}

// Overload 1: state factory + handlers (primary)
export function createSlice<S, H extends Record<string, (s: S, ...args: any[]) => any>>(
  init: () => S,
  handlers: H,
): SliceWithInit<S, H>

// Overload 2: curried, no state (fallback)
export function createSlice<S>(): <H extends Record<string, (s: S, ...args: any[]) => any>>(
  handlers: H,
) => Slice<S, H>

export function createSlice(...args: any[]): any {
  if (args.length === 0) {
    // Curried form
    return <H>(handlers: H) => makeSlice(handlers)
  }
  // State factory form
  const [init, handlers] = args
  const slice = makeSlice(handlers)
  ;(slice as any).create = () => {
    const state = init()
    return { state, apply: (op: any) => slice.apply(state, op) }
  }
  return slice
}
