/**
 * Type-safe Commander.js wrapper — replaces @commander-js/extra-typings.
 *
 * Uses TypeScript 5.4+ const type parameters and template literal types
 * to infer option types from .option() calls. Inspired by
 * @commander-js/extra-typings, which achieves similar results with a
 * 1536-line .d.ts using recursive generic accumulation. This
 * implementation achieves the same inference in ~60 lines of type-level
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
 *   .option("-p, --port <number>", "Port to listen on")
 *   .option("-o, --output [path]", "Output path")
 *   .option("--no-color", "Disable color output")
 *
 * cli.parse()
 * const opts = cli.opts()
 * //    ^? { verbose: boolean, port: string, output: string | true, color: boolean }
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
type Prettify<T> = { [K in keyof T]: T[K] } & {}

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
type FlagValueType<S extends string> = IsNegated<S> extends true
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

// --- Typed Command ---

/**
 * A Commander Command with inferred option types.
 * Wraps Commander's Command and tracks option types at the type level.
 * Help is automatically colorized.
 */
export class TypedCommand<Opts = {}> {
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

  /** Add an option with type inference */
  option<const F extends string, D = undefined>(
    flags: F,
    description?: string,
    defaultValue?: D,
  ): TypedCommand<AddOption<Opts, F, D>> {
    ;(this._cmd as any).option(flags, description ?? "", defaultValue)
    return this as any
  }

  /** Add a required option */
  requiredOption<const F extends string>(
    flags: F,
    description?: string,
    defaultValue?: string,
  ): TypedCommand<Opts & { [K in ExtractLongName<F>]: FlagValueType<F> }> {
    ;(this._cmd as any).requiredOption(flags, description ?? "", defaultValue)
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

  /** Add an argument */
  argument(name: string, description?: string, defaultValue?: unknown): this {
    this._cmd.argument(name, description ?? "", defaultValue)
    return this
  }

  /** Set action handler */
  action(fn: (this: TypedCommand<Opts>, ...args: any[]) => void | Promise<void>): this {
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
 *   .option("-p, --port <number>", "Port")
 *
 * program.parse()
 * const { verbose, port } = program.opts()
 * //      ^boolean   ^string | undefined
 * ```
 */
export function createCLI(name?: string): TypedCommand<{}> {
  return new TypedCommand(name)
}
