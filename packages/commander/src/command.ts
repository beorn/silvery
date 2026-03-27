/**
 * Enhanced Commander Command with auto-colorized help and Standard Schema support.
 *
 * Subclasses Commander's Command so `new Command("app")` just works —
 * it's Commander with auto-colorized help and automatic Standard Schema /
 * legacy Zod detection in `.option()`.
 *
 * @example
 * ```ts
 * import { Command } from "@silvery/commander"
 * import { port, csv } from "@silvery/commander/parse"
 *
 * const program = new Command("myapp")
 *   .description("My CLI tool")
 *   .version("1.0.0")
 *   .option("-p, --port <n>", "Port", port)
 *   .option("--tags <t>", "Tags", csv)
 *
 * program.parse()
 * ```
 */

import { Command as BaseCommand } from "commander"
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
   * Add an option with automatic Standard Schema / legacy Zod detection.
   *
   * When the third argument is a Standard Schema v1 object (Zod >=3.24,
   * Valibot >=1.0, ArkType >=2.0, or @silvery/commander presets), it's
   * automatically wrapped as a Commander parser function.
   *
   * When the third argument is a legacy Zod schema (pre-3.24, has `_def`
   * and `parse` but no `~standard`), it's also wrapped automatically.
   */
  option(flags: string, description?: string, parseArgOrDefault?: any, defaultValue?: any): this {
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

  // Subcommands also get colorized help and Standard Schema support
  createCommand(name?: string): Command {
    return new Command(name)
  }
}
