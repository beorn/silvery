/**
 * silvery-ui - UI components for Ink/silvery TUI apps
 *
 * Progress indicators, spinners, and step runners for CLI applications.
 *
 * @example
 * ```ts
 * // Declarative step runner
 * import { steps } from "./progress/index";
 *
 * const results = await steps({
 *   loadData: () => fetchData(),
 *   process: () => process(),
 * }).run({ clear: true });
 *
 * // Low-level CLI components
 * import { Spinner, ProgressBar } from "./cli/index";
 *
 * // React/TUI components
 * import { Spinner, ProgressBar } from "./react/index";
 * ```
 *
 * @packageDocumentation
 */

// Re-export everything for convenience
export * from "./types.js"
export * from "./cli/index.js"
export * from "./wrappers/index.js"
export * from "./progress/index.js"

// Note: React components should be imported from "./react/index"
// to avoid requiring React as a dependency for CLI-only usage. The
// `progress/*` barrel above is CLI-only (uses `cli/*` primitives), so
// it's safe to include here without dragging React in.
//
// Why the explicit re-export: package.json maps `./ui/*` to
// `./src/ui/*/index.ts` as a glob, which Bun honors but vitest's
// resolver does not — consumers importing `@silvery/ag-react/ui/progress`
// fail to load under vitest. Re-exporting from the parent barrel here
// gives consumers a single import path that works in both environments.
