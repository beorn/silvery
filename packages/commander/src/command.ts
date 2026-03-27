/**
 * Enhanced Commander Command with auto-colorized help, Standard Schema support,
 * and array-as-choices detection.
 *
 * Subclasses Commander's Command so `new Command("app")` just works --
 * it's Commander with auto-colorized help, automatic Standard Schema /
 * legacy Zod detection, and array choices in `.option()`.
 *
 * @example
 * ```ts
 * import { Command, port, csv } from "@silvery/commander"
 *
 * new Command("deploy")
 *   .option("-p, --port <n>", "Port", port)
 *   .option("--tags <t>", "Tags", csv)
 *   .option("-e, --env <e>", "Env", ["dev", "staging", "prod"])
 *
 * program.parse()
 * ```
 */

import { Command as BaseCommand, Option } from "commander"
import { colorizeHelp } from "./colorize.ts"
import type { StandardSchemaV1 } from "./presets.ts"

// --- Standard Schema support ---

/** Runtime check: is this value a Standard Schema v1 object? */
function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  return typeof value === "object" && value !== null && "~standard" in (value as any)
}

/** Wrap a Standard Schema as a Commander parser function */
function standardSchemaParser<T>(schema: StandardSchemaV1<T>): (value: string) => T {
  return (value: string) => {
    const result = schema["~standard"].validate(value)
    if ("issues" in result) {
      const msg = result.issues.map((i) => i.message).join(", ")
      throw new Error(msg)
    }
    return result.value
  }
}

// --- Legacy Zod support (pre-3.24, no ~standard) ---

/**
 * Duck-type interface for older Zod schemas that don't implement Standard Schema.
 * Any object with `parse(value: string) => T` and `_def` qualifies.
 */
interface ZodLike<T = any> {
  parse(value: unknown): T
  _def: unknown
}

/** Runtime check: is this value a legacy Zod-like schema (without Standard Schema)? */
function isLegacyZodSchema(value: unknown): value is ZodLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as any).parse === "function" &&
    "_def" in (value as any) &&
    !("~standard" in (value as any))
  )
}

/** Wrap a legacy Zod schema as a Commander parser function */
function legacyZodParser<T>(schema: ZodLike<T>): (value: string) => T {
  return (value: string) => {
    try {
      return schema.parse(value)
    } catch (err: any) {
      // Format Zod errors as Commander-style messages
      if (err?.issues) {
        const messages = err.issues.map((i: any) => i.message).join(", ")
        throw new Error(messages)
      }
      throw err
    }
  }
}

export class Command extends BaseCommand {
  constructor(name?: string) {
    super(name)
    colorizeHelp(this as any)
  }

  /**
   * Add an option with smart third-argument detection.
   *
   * The third argument is detected in order:
   * 1. **Array** -- treated as choices (Commander `.choices()`)
   * 2. **Standard Schema v1** -- wrapped as a parser function
   * 3. **Legacy Zod** (pre-3.24, has `_def` + `parse`) -- wrapped as a parser
   * 4. **Function** -- passed through as Commander's parser function
   * 5. **Anything else** -- passed through as a default value
   */
  override option(flags: string, description?: string, parseArgOrDefault?: any, defaultValue?: any): this {
    if (Array.isArray(parseArgOrDefault)) {
      const opt = new Option(flags, description ?? "").choices(parseArgOrDefault as string[])
      this.addOption(opt)
      return this
    }
    if (isStandardSchema(parseArgOrDefault)) {
      return super.option(flags, description ?? "", standardSchemaParser(parseArgOrDefault))
    }
    if (isLegacyZodSchema(parseArgOrDefault)) {
      return super.option(flags, description ?? "", legacyZodParser(parseArgOrDefault))
    }
    if (typeof parseArgOrDefault === "function") {
      return super.option(flags, description ?? "", parseArgOrDefault, defaultValue)
    }
    return super.option(flags, description ?? "", parseArgOrDefault)
  }

  // Subcommands also get colorized help, Standard Schema, and array choices
  override createCommand(name?: string): Command {
    return new Command(name)
  }
}
