// silvery/pipe — the one import-free composition primitive.
//
// `pipe` and its `AppPlugin` type live in `@silvery/create/pipe`
// (packages/create/src/pipe.ts), which imports nothing. This subpath exists so
// a consumer outside Silvery's app surface — a config composition, a daemon
// factory — can pin `silvery/pipe` by exact version and compose values without
// importing the app barrel or any UI dependency. There is one pipe
// implementation; this file only re-exports it (32325 Slice A).
export * from "@silvery/create/pipe"
