/**
 * Type-safe Commander.js wrapper — replaces @commander-js/extra-typings.
 *
 * Uses TypeScript 5.4+ const type parameters and template literal types
 * to infer option types from .option() calls. Inspired by
 * @commander-js/extra-typings, which achieves similar results with a
 * 1536-line .d.ts using recursive generic accumulation. This
 * implementation achieves the same inference in ~100 lines of type-level
 * code by leveraging modern TS features (const type params, template
 * literal types, conditional mapped types).
 *
 * @example
 * ```ts
 * import { createCLI } from "@silvery/commander"
 *
 * const cli = createCLI("myapp")
 *   .description("My app")
 *   .option("-v, --verbose", "Increase verbosity")
 *   .option("-p, --port <number>", "Port to listen on", parseInt)
 *   .option("-o, --output [path]", "Output path")
 *   .option("--no-color", "Disable color output")
 *
 * cli.parse()
 * const opts = cli.opts()
 * //    ^? { verbose: boolean, port: number, output: string | true, color: boolean }
 * ```
 */

import { Command as BaseCommand, Option, Argument } from "commander"
import { colorizeHelp } from "./index.ts"

// --- Type-level option parsing ---
//
// Approach: Each .option() call captures the flags string as a const
// type parameter. Template literal types extract the flag name and
// determine the value type (boolean for bare flags, string for <value>,
// string | true for [value]). The result accumulates via intersection
// types across chained calls. Prettify<T> flattens the intersections
// for clean hover output.
//
// Negated flags (--no-X) are detected and produce a `X: boolean` key.

/** Flatten intersection types for clean hover output */
export type Prettify<T> = { [K in keyof T]: T[K] } & {}

/** Check if a flags string is a negated flag like "--no-color" */
type IsNegated<S extends string> = S extends `${string}--no-${string}` ? true : false

/**
 * Extract the option key name from a flags string like "-p, --port <value>".
 *
 * Priority: long flag > short flag. Handles negated flags (--no-X → X),
 * kebab-case conversion (--dry-run → dryRun), and short-only flags (-v → v).
 */
type ExtractLongName<S extends string> = S extends `${string}--no-${infer Rest}`
  ? Rest extends `${infer Name} ${string}`
    ? CamelCase<Name>
    : CamelCase<Rest>
  : S extends `${string}--${infer Rest}`
    ? Rest extends `${infer Name} ${string}`
      ? CamelCase<Name>
      : CamelCase<Rest>
    : S extends `-${infer Short}`
      ? Short extends `${infer C} ${string}`
        ? C
        : Short
      : never

/** Convert kebab-case to camelCase: "dry-run" → "dryRun" */
type CamelCase<S extends string> = S extends `${infer A}-${infer B}${infer Rest}`
  ? `${A}${Uppercase<B>}${CamelCase<Rest>}`
  : S

/** Determine the value type from a flags string */
type FlagValueType<S extends string> =
  IsNegated<S> extends true
    ? boolean // negated flags are always boolean
    : S extends `${string}<${string}>`
      ? string // required arg → string
      : S extends `${string}[${string}]`
        ? string | true // optional arg → string | true
        : boolean // no arg → boolean

/** Add a flag to an options record */
type AddOption<Opts, Flags extends string, Default = undefined> = Opts & {
  [K in ExtractLongName<Flags>]: Default extends undefined ? FlagValueType<Flags> | undefined : FlagValueType<Flags>
}

// --- Type-level argument parsing ---

/** Extract whether an argument is required (<name>) or optional ([name]) */
type ArgType<S extends string> = S extends `<${string}>`
  ? string
  : S extends `[${string}]`
    ? string | undefined
    : string

// --- Typed opts helper (resolves accumulated Opts for action handlers) ---
/** Resolve accumulated option types for use in action handler signatures */
export type TypedOpts<Opts> = Prettify<Opts>

// --- Standard Schema support (v1) ---

/**
 * Standard Schema v1 interface — the universal schema interop protocol.
 * Supports any schema library that implements Standard Schema (Zod >=3.24,
 * Valibot >=1.0, ArkType >=2.0, etc.).
 *
 * Inlined to avoid any dependency on @standard-schema/spec.
 * See: https://github.com/standard-schema/standard-schema
 */
export interface StandardSchemaV1<T = unknown> {
  readonly "~standard": {
    readonly version: 1
    readonly vendor: string
    readonly validate: (
      value: unknown,
    ) => { value: T } | { issues: ReadonlyArray<{ message: string; path?: ReadonlyArray<unknown> }> }
  }
}

/** Type-level extraction: infer the output type from a Standard Schema */
type InferStandardSchema<S> = S extends StandardSchemaV1<infer T> ? T : never

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

/** Type-level extraction: if Z is a Zod schema, infer its output type */
type InferZodOutput<Z> = Z extends { parse(value: unknown): infer T; _def: unknown } ? T : never

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

// --- Typed Command ---

/**
 * A Commander Command with inferred option and argument types.
 * Wraps Commander's Command and tracks option types at the type level.
 * Help is automatically colorized.
 *
 * @typeParam Opts - Accumulated option types from .option() calls
 * @typeParam Args - Accumulated argument types from .argument() calls (tuple)
 */
export class TypedCommand<Opts = {}, Args extends any[] = []> {
  readonly _cmd: BaseCommand

  constructor(name?: string) {
    this._cmd = new BaseCommand(name)
    colorizeHelp(this._cmd as any)
  }

  /** Set program description */
  description(str: string, argsDescription?: Record<string, string>): this {
    this._cmd.description(str, argsDescription as any)
    return this
  }

  /** Set program version */
  version(str: string, flags?: string, description?: string): this {
    this._cmd.version(str, flags, description)
    return this
  }

  /**
   * Add an option with type inference.
   *
   * Supports five overload patterns:
   * 1. `.option(flags, description?)` — type inferred from flags syntax
   * 2. `.option(flags, description, defaultValue)` — removes `undefined` from type
   * 3. `.option(flags, description, parser, defaultValue?)` — type inferred from parser return type
   * 4. `.option(flags, description, standardSchema)` — type inferred from Standard Schema output
   * 5. `.option(flags, description, zodSchema)` — type inferred from Zod schema output (legacy, pre-3.24)
   */
  option<const F extends string, S extends StandardSchemaV1>(
    flags: F,
    description: string,
    schema: S,
  ): TypedCommand<Opts & { [K in ExtractLongName<F>]: InferStandardSchema<S> }, Args>

  option<const F extends string, Z extends ZodLike>(
    flags: F,
    description: string,
    schema: Z,
  ): TypedCommand<Opts & { [K in ExtractLongName<F>]: InferZodOutput<Z> }, Args>

  option<const F extends string, P extends (value: string, previous: any) => any>(
    flags: F,
    description: string,
    parseArg: P,
    defaultValue?: ReturnType<P>,
  ): TypedCommand<Opts & { [K in ExtractLongName<F>]: ReturnType<P> }, Args>

  option<const F extends string, D = undefined>(
    flags: F,
    description?: string,
    defaultValue?: D,
  ): TypedCommand<AddOption<Opts, F, D>, Args>

  option(flags: string, description?: string, parseArgOrDefault?: any, defaultValue?: any): any {
    if (isStandardSchema(parseArgOrDefault)) {
      ;(this._cmd as any).option(flags, description ?? "", standardSchemaParser(parseArgOrDefault))
    } else if (isLegacyZodSchema(parseArgOrDefault)) {
      ;(this._cmd as any).option(flags, description ?? "", legacyZodParser(parseArgOrDefault))
    } else if (typeof parseArgOrDefault === "function") {
      ;(this._cmd as any).option(flags, description ?? "", parseArgOrDefault, defaultValue)
    } else {
      ;(this._cmd as any).option(flags, description ?? "", parseArgOrDefault)
    }
    return this
  }

  /** Add a required option */
  requiredOption<const F extends string>(
    flags: F,
    description?: string,
    defaultValue?: string,
  ): TypedCommand<Opts & { [K in ExtractLongName<F>]: FlagValueType<F> }, Args> {
    ;(this._cmd as any).requiredOption(flags, description ?? "", defaultValue)
    return this as any
  }

  /**
   * Add an option with a fixed set of allowed values (choices).
   * The option type is narrowed to a union of the provided values.
   *
   * @example
   * ```ts
   * .optionWithChoices("-e, --env <env>", "Environment", ["dev", "staging", "prod"] as const)
   * // → env: "dev" | "staging" | "prod" | undefined
   * ```
   */
  optionWithChoices<const F extends string, const C extends readonly string[]>(
    flags: F,
    description: string,
    choices: C,
  ): TypedCommand<Opts & { [K in ExtractLongName<F>]: C[number] | undefined }, Args> {
    const option = new Option(flags, description).choices(choices as unknown as string[])
    ;(this._cmd as any).addOption(option)
    return this as any
  }

  /** Add a subcommand */
  command(nameAndArgs: string, description?: string): TypedCommand<{}> {
    const sub = (this._cmd as any).command(nameAndArgs, description)
    colorizeHelp(sub as any)
    const typed = new TypedCommand<{}>()
    // Replace the internal command with the one Commander created
    ;(typed as any)._cmd = sub
    return typed
  }

  /**
   * Add an argument with type tracking.
   * `<name>` = required (string), `[name]` = optional (string | undefined).
   */
  argument<const N extends string>(
    name: N,
    description?: string,
    defaultValue?: unknown,
  ): TypedCommand<Opts, [...Args, ArgType<N>]> {
    this._cmd.argument(name, description ?? "", defaultValue)
    return this as any
  }

  /**
   * Set action handler with typed parameters.
   * Callback receives: ...arguments, opts, command.
   */
  action(fn: (...args: [...Args, Prettify<Opts>, TypedCommand<Opts, Args>]) => void | Promise<void>): this {
    this._cmd.action(fn as any)
    return this
  }

  /** Get typed parsed options */
  opts(): Prettify<Opts> {
    return this._cmd.opts() as any
  }

  /** Parse argv */
  parse(argv?: readonly string[], options?: { from?: "node" | "electron" | "user" }): this {
    this._cmd.parse(argv as any, options as any)
    return this
  }

  /** Parse argv async */
  async parseAsync(argv?: readonly string[], options?: { from?: "node" | "electron" | "user" }): Promise<this> {
    await this._cmd.parseAsync(argv as any, options as any)
    return this
  }

  /** Get help text */
  helpInformation(): string {
    return this._cmd.helpInformation()
  }

  /** Allow unknown options */
  allowUnknownOption(allow?: boolean): this {
    this._cmd.allowUnknownOption(allow)
    return this
  }

  /** Allow excess arguments */
  allowExcessArguments(allow?: boolean): this {
    this._cmd.allowExcessArguments(allow)
    return this
  }

  /** Pass through options after -- */
  passThroughOptions(passThrough?: boolean): this {
    this._cmd.passThroughOptions(passThrough)
    return this
  }

  /** Enable positional options */
  enablePositionalOptions(positional?: boolean): this {
    this._cmd.enablePositionalOptions(positional)
    return this
  }

  /** Hook into lifecycle events */
  hook(event: string, listener: (...args: any[]) => void | Promise<void>): this {
    ;(this._cmd as any).hook(event, listener)
    return this
  }

  /** Set custom name */
  name(str: string): this {
    this._cmd.name(str)
    return this
  }

  /** Add alias */
  alias(alias: string): this {
    this._cmd.alias(alias)
    return this
  }

  /** Add multiple aliases */
  aliases(aliases: readonly string[]): this {
    this._cmd.aliases(aliases as string[])
    return this
  }

  /** Configure help display */
  configureHelp(config: Record<string, unknown>): this {
    ;(this._cmd as any).configureHelp(config)
    return this
  }

  /** Configure output streams */
  configureOutput(config: Record<string, unknown>): this {
    ;(this._cmd as any).configureOutput(config)
    return this
  }

  /** Access underlying Commander Command for advanced use */
  get commands(): readonly BaseCommand[] {
    return this._cmd.commands
  }

  /** Show help */
  help(context?: { error?: boolean }): never {
    return (this._cmd as any).help(context) as never
  }

  /** Add help text */
  addHelpText(position: "before" | "after" | "beforeAll" | "afterAll", text: string): this {
    this._cmd.addHelpText(position, text)
    return this
  }

  /** Show help after error */
  showHelpAfterError(displayHelp?: boolean | string): this {
    this._cmd.showHelpAfterError(displayHelp)
    return this
  }

  /** Show suggestion after error */
  showSuggestionAfterError(displaySuggestion?: boolean): this {
    this._cmd.showSuggestionAfterError(displaySuggestion)
    return this
  }

  /** Set environment variable for the last added option (passthrough) */
  env(name: string): this {
    // Commander's .env() is on Option, not Command. We apply it to the last option.
    const opts = (this._cmd as any).options as any[]
    if (opts.length > 0) {
      opts[opts.length - 1].envVar = name
      opts[opts.length - 1].envVarRequired = false
    }
    return this
  }
}

/**
 * Create a typed, colorized CLI program.
 *
 * @example
 * ```ts
 * import { createCLI } from "@silvery/commander"
 *
 * const program = createCLI("myapp")
 *   .description("My tool")
 *   .version("1.0.0")
 *   .option("-v, --verbose", "Verbose output")
 *   .option("-p, --port <number>", "Port", parseInt)
 *
 * program.parse()
 * const { verbose, port } = program.opts()
 * //      ^boolean   ^number | undefined
 * ```
 */
export function createCLI(name?: string): TypedCommand<{}> {
  return new TypedCommand(name)
}
