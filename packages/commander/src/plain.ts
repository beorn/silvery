/**
 * Plain Commander — Standard Schema presets without auto-colorization.
 *
 * Exports the base Commander Command (no auto-colorized help) plus the
 * same typed option presets (int, uint, port, csv, intRange). Does NOT
 * import @silvery/ansi — zero styling overhead.
 *
 * For colorization, import `colorizeHelp` from `@silvery/commander` (main entry).
 *
 * @example
 * ```ts
 * import { Command, port, csv } from "@silvery/commander/plain"
 *
 * const program = new Command("myapp")
 *   .option("-p, --port <n>", "Port", port)
 *   .option("-e, --env <e>", "Env", ["dev", "staging", "prod"])
 * ```
 */

export { Command } from "commander"
export { int, uint, port, csv, intRange } from "./presets.ts"
export type { StandardSchemaV1 } from "./presets.ts"
