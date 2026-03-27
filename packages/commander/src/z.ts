/**
 * Extended Zod object with CLI presets.
 *
 * Spreads all of Zod's exports and adds CLI-specific schemas.
 * Tree-shakeable — only evaluated if user imports `z`.
 *
 * @example
 * ```ts
 * import { z, Command } from "@silvery/commander"
 *
 * const program = new Command("deploy")
 *   .option("-p, --port <n>", "Port", z.port)
 *   .option("-e, --env <e>", "Environment", z.oneOf(["dev", "staging", "prod"]))
 *   .option("--tags <t>", "Tags", z.csv)
 *
 * program.parse()
 * ```
 */

import * as zod from "zod"

export const z = {
  ...zod,
  // CLI presets (built on Zod schemas)
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
  oneOf: <const T extends readonly [string, ...string[]]>(values: T) => zod.enum(values),
}
