/**
 * Extended Zod object with CLI types.
 *
 * Spreads all of Zod's exports and adds CLI-specific schemas.
 * zod is a required peer dependency (^4): the main entry loads this module,
 * so an unbundled consumer without zod fails at import. A bundler may still
 * drop it when `z` is unused.
 *
 * @example
 * ```ts
 * import { z, Command } from "@silvery/commander"
 *
 * new Command("deploy")
 *   .option("-p, --port <n>", "Port", z.port)
 *   .option("--tags <t>", "Tags", z.csv)
 *   .option("-e, --env <e>", "Env", ["dev", "staging", "prod"])
 *
 * program.parse()
 * ```
 */

import * as zod from "zod"

export const z = {
  ...zod,
  // CLI types (built on Zod schemas)
  port: zod.coerce.number().int().min(1).max(65535),
  int: zod.coerce.number().int(),
  uint: zod.coerce.number().int().min(0),
  float: zod.coerce.number(),
  csv: zod.string().transform((v: string) =>
    v
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean),
  ),
  url: zod.string().url(),
  path: zod.string().min(1),
  email: zod.string().email(),
  date: zod.coerce.date(),
  json: zod.string().transform((v: string) => JSON.parse(v)),
  bool: zod
    .enum(["true", "false", "1", "0", "yes", "no", "y", "n"] as const)
    .transform((v: string) => ["true", "1", "yes", "y"].includes(v)),
  intRange: (min: number, max: number) => zod.coerce.number().int().min(min).max(max),
}
