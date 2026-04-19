/**
 * Enhanced Commander Command with auto-colorized help, Standard Schema support,
 * array-as-choices detection, and **type-safe option + argument inference**.
 *
 * Subclasses Commander's Command so `new Command("app")` just works --
 * it's Commander with auto-colorized help, automatic Standard Schema /
 * legacy Zod detection, and array choices in `.option()` and `.argument()`.
 *
 * Each `.option()` call narrows the return type so that `.action()`, `.opts()`,
 * and `.actionMerged()` know exactly which options exist and what types they have.
 * Each `.argument()` call appends to both a positional tuple (for `.action()`)
 * and a named record (for `.actionMerged()`).
 *
 * `.action(fn)` is Commander-native: positional args, then options, then command.
 * `.actionMerged(fn)` is an opt-in helper that merges args and options into a
 * single named object — nicer for commands with many positional arguments.
 *
 * @example
 * ```ts
 * import { Command, port, csv } from "@silvery/commander"
 *
 * // Commander-native: positional args, then options
 * new Command("deploy")
 *   .argument("<service>", "Service to deploy")
 *   .argument("[env]", "Environment", ["dev", "staging", "prod"])
 *   .option("-p, --port <n>", "Port", port)
 *   .option("--verbose", "Verbose output")
 *   .action((service, env, opts) => {
 *     service       // string
 *     env           // "dev" | "staging" | "prod" | undefined
 *     opts.port     // number | undefined
 *     opts.verbose  // boolean | undefined
 *   })
 *
 * // Merged form: flat named object with args and options merged
 * new Command("deploy")
 *   .argument("<service>")
 *   .argument("[env]", ["dev", "staging", "prod"] as const)
 *   .option("-p, --port <n>", "Port", port)
 *   .actionMerged(({ service, env, port }) => { ... })
 *
 * program.parse()
 * ```
 */

import { Command as BaseCommand, Help, Option } from "commander"
import { colorizeHelp, shouldColorize } from "./colorize.ts"
import type { CLIType, StandardSchemaV1 } from "./presets.ts"
import { tokenizeCmdline, isShellLine, type CmdlineToken } from "./tokenize.ts"

/**
 * Broad structural type for schema objects that have a `~standard` property.
 * Matches both our `StandardSchemaV1<T>`, Zod v4's async-capable Standard Schema,
 * and any other library implementing Standard Schema v1.
 *
 * Type extraction works via the `types` property (Standard Schema v1 convention).
 */
interface AnyStandardSchema {
  readonly "~standard": {
    readonly version: 1
    readonly vendor: string
    readonly validate: (value: unknown, ...args: any[]) => any
    readonly types?: { readonly output: unknown } | undefined
  }
}

/** Extract the output type from a Standard Schema v1 object. */
type SchemaOutput<S extends AnyStandardSchema> = NonNullable<S["~standard"]["types"]>["output"]

// ────────────────────────────────────────────────────────────────
// Type-level flag parsing utilities
// ────────────────────────────────────────────────────────────────

/**
 * Extract the long option name from a flags string.
 *
 * Examples:
 *   "-v, --verbose"        → "verbose"
 *   "--port <n>"           → "port"
 *   "--dry-run"            → "dry-run"
 *   "--no-color"           → "no-color"
 *   "-o, --output [path]"  → "output"
 */
type ExtractLongName<S extends string> = S extends `${string}--${infer Rest}`
  ? Rest extends `${infer Name} ${string}`
    ? Name
    : Rest
  : S extends `-${infer C}, ${infer Rest}`
    ? Rest extends `${infer Name} ${string}`
      ? Name
      : Rest
    : S extends `-${infer C}`
      ? C
      : never

/**
 * Convert kebab-case to camelCase (matching Commander's attributeName()).
 *
 * "dry-run"        → "dryRun"
 * "terminal-name"  → "terminalName"
 * "verbose"        → "verbose"
 */
type CamelCase<S extends string> = S extends `${infer A}-${infer B}${infer Rest}`
  ? `${A}${Uppercase<B>}${CamelCase<Rest>}`
  : S

// ────────────────────────────────────────────────────────────────
// Type-level argument parsing utilities
// ────────────────────────────────────────────────────────────────

/**
 * Extract the argument name from a flags string.
 *
 * Examples:
 *   "<service>"       → "service"
 *   "[env]"           → "env"
 *   "<files...>"      → "files"
 *   "<service-name>"  → "service-name"
 */
type ExtractArgName<S extends string> = S extends `<${infer Name}...>`
  ? Name
  : S extends `<${infer Name}>`
    ? Name
    : S extends `[${infer Name}...]`
      ? Name
      : S extends `[${infer Name}]`
        ? Name
        : never

/** Is the argument required (wrapped in `<...>`)? */
type IsArgRequired<S extends string> = S extends `<${string}>` ? true : false

/** Is the argument variadic (ends with `...>` or `...]`)? */
type IsArgVariadic<S extends string> = S extends `${string}...${string}` ? true : false

/**
 * Derive the property key from an argument flags string.
 * Applies: extract name → camelCase.
 */
type ArgKey<S extends string> = CamelCase<ExtractArgName<S>>

/**
 * Parse positional arguments embedded in a command name string.
 *
 * Commander.js accepts argument syntax inline with command names:
 *   `"deploy <service>"`            → 1 required arg
 *   `"deploy <service> [env]"`      → 1 required + 1 optional
 *   `"deploy <files...>"`           → 1 required variadic
 *
 * `ParseCommandString<S>` returns `[Args tuple, ArgsRecord]` so the typed
 * `command<S>()` overload can produce a `Command<{}, Args, ArgsRecord>` with
 * the same type information you'd get from chaining `.argument()` calls.
 *
 * Limitations: only plain string types — `<svc>` is `string`, `[env]` is
 * `string | undefined`, `<files...>` is `string[]`. Parsers, schemas, and
 * choices still require `.argument()` because the inline string syntax can't
 * express them. Mixing inline args with `.argument()` calls is allowed:
 * the inline ones come first in the tuple, the `.argument()` ones append.
 */

/** Split a command name string at the first space. `"deploy <service>"` → `["deploy", "<service>"]` */
type SplitCommandHead<S extends string> = S extends `${infer Name} ${infer Rest}`
  ? [Name, Rest]
  : [S, ""]

/** Walk the tail tokens after the command name and build [Args tuple, ArgsRecord]. */
type ParseInlineArgs<S extends string, Tuple extends any[] = [], Rec = {}> = S extends ""
  ? [Tuple, Rec]
  : S extends `${infer Tok} ${infer Rest}`
    ? Tok extends `<${infer Name}...>`
      ? ParseInlineArgs<Rest, [...Tuple, string[]], Rec & Record<CamelCase<Name>, string[]>>
      : Tok extends `<${infer Name}>`
        ? ParseInlineArgs<Rest, [...Tuple, string], Rec & Record<CamelCase<Name>, string>>
        : Tok extends `[${infer Name}...]`
          ? ParseInlineArgs<Rest, [...Tuple, string[]], Rec & Record<CamelCase<Name>, string[]>>
          : Tok extends `[${infer Name}]`
            ? ParseInlineArgs<
                Rest,
                [...Tuple, string | undefined],
                Rec & Record<CamelCase<Name>, string | undefined>
              >
            : ParseInlineArgs<Rest, Tuple, Rec> // skip non-arg tokens
    : // Last token (no trailing space)
      S extends `<${infer Name}...>`
      ? [[...Tuple, string[]], Rec & Record<CamelCase<Name>, string[]>]
      : S extends `<${infer Name}>`
        ? [[...Tuple, string], Rec & Record<CamelCase<Name>, string>]
        : S extends `[${infer Name}...]`
          ? [[...Tuple, string[]], Rec & Record<CamelCase<Name>, string[]>]
          : S extends `[${infer Name}]`
            ? [[...Tuple, string | undefined], Rec & Record<CamelCase<Name>, string | undefined>]
            : [Tuple, Rec]

/** Top-level: parse a `command(name)` string into [Args tuple, ArgsRecord]. */
type ParseCommandString<S extends string> =
  SplitCommandHead<S> extends [infer _Name, infer Tail extends string]
    ? Tail extends ""
      ? [[], {}]
      : ParseInlineArgs<Tail>
    : [[], {}]

/**
 * Infer the value type for an argument based on its flags string and
 * the optional parser/choices/schema.
 *
 * Rules:
 *   <required>            → string
 *   [optional]            → string | undefined
 *   <variadic...>         → string[]
 *   [variadic...]         → string[]
 *   with parser fn        → ReturnType<parser> (+ | undefined if optional)
 *   with CLIType<T>       → T (+ | undefined if optional)
 *   with StandardSchema   → T (+ | undefined if optional)
 *   with choices[]        → choices[number] (+ | undefined if optional)
 */
type InferArgType<Flags extends string, ParseArg = undefined> =
  IsArgVariadic<Flags> extends true
    ? ParseArg extends readonly (infer C)[]
      ? C[]
      : ParseArg extends CLIType<infer T>
        ? T[]
        : ParseArg extends StandardSchemaV1<infer T>
          ? T[]
          : ParseArg extends (value: string, ...args: any[]) => infer R
            ? R[]
            : string[]
    : IsArgRequired<Flags> extends true
      ? ParseArg extends readonly (infer C)[]
        ? C
        : ParseArg extends CLIType<infer T>
          ? T
          : ParseArg extends StandardSchemaV1<infer T>
            ? T
            : ParseArg extends (value: string, ...args: any[]) => infer R
              ? R
              : string
      : ParseArg extends readonly (infer C)[]
        ? C | undefined
        : ParseArg extends CLIType<infer T>
          ? T | undefined
          : ParseArg extends StandardSchemaV1<infer T>
            ? T | undefined
            : ParseArg extends (value: string, ...args: any[]) => infer R
              ? R | undefined
              : string | undefined

/**
 * Strip "no-" prefix from negated flags.
 * "--no-color" → long name "no-color" → stripped to "color"
 */
type StripNo<S extends string> = S extends `no-${infer Rest}` ? Rest : S

/**
 * Derive the property key from a flags string.
 * Applies: extract long name → strip "no-" → camelCase.
 */
type FlagKey<S extends string> = CamelCase<StripNo<ExtractLongName<S>>>

/**
 * Does the flags string contain a required value argument `<...>`?
 */
type HasRequiredArg<S extends string> = S extends `${string}<${string}>${string}` ? true : false

/**
 * Does the flags string contain an optional value argument `[...]`?
 */
type HasOptionalArg<S extends string> = S extends `${string}[${string}]${string}` ? true : false

/**
 * Does the flags string start with `--no-`?
 */
type IsNegated<S extends string> = ExtractLongName<S> extends `no-${string}` ? true : false

/**
 * Infer the value type for a flag based on the flags string and the
 * optional third argument (parser function, Standard Schema, choices array).
 *
 * Rules (mirroring Commander runtime behavior):
 *   --flag                    → boolean | undefined
 *   --no-flag                 → boolean
 *   --flag <value>            → string | undefined  (or parser return type)
 *   --flag [value]            → string | boolean | undefined (or parser return type | boolean)
 *   --flag <value>, parser fn → ReturnType<parser> | undefined
 *   --flag <value>, CLIType<T> / StandardSchemaV1<T> → T | undefined
 *   --flag <value>, choices[] → choices[number] | undefined
 */
type InferOptionType<Flags extends string, ParseArg = undefined> =
  IsNegated<Flags> extends true
    ? boolean
    : HasRequiredArg<Flags> extends true
      ? ParseArg extends readonly (infer C)[]
        ? C | undefined
        : ParseArg extends CLIType<infer T>
          ? T | undefined
          : ParseArg extends StandardSchemaV1<infer T>
            ? T | undefined
            : ParseArg extends (value: string, ...args: any[]) => infer R
              ? R | undefined
              : string | undefined
      : HasOptionalArg<Flags> extends true
        ? ParseArg extends readonly (infer C)[]
          ? C | boolean | undefined
          : ParseArg extends CLIType<infer T>
            ? T | boolean | undefined
            : ParseArg extends StandardSchemaV1<infer T>
              ? T | boolean | undefined
              : ParseArg extends (value: string, ...args: any[]) => infer R
                ? R | boolean | undefined
                : string | boolean | undefined
        : boolean | undefined

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

interface ZodLike<T = any> {
  parse(value: unknown): T
  _def: unknown
}

function isLegacyZodSchema(value: unknown): value is ZodLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as any).parse === "function" &&
    "_def" in (value as any) &&
    !("~standard" in (value as any))
  )
}

function legacyZodParser<T>(schema: ZodLike<T>): (value: string) => T {
  return (value: string) => {
    try {
      return schema.parse(value)
    } catch (err: any) {
      if (err?.issues) {
        const messages = err.issues.map((i: any) => i.message).join(", ")
        throw new Error(messages)
      }
      throw err
    }
  }
}

// --- Help Section Types ---

/** Position for help sections — mirrors Commander's addHelpText positions. */
export type HelpSectionPosition = "beforeAll" | "before" | "after" | "afterAll"

/** Content for a help section: rows of [term, description] pairs, or free-form text. */
export type HelpSectionContent = [string, string][] | string

// Internal storage
interface StoredSection {
  position: HelpSectionPosition
  title: string
  content: HelpSectionContent
}

/**
 * Style a SINGLE-LINE section term using Commander's style hooks.
 *
 * Three modes:
 * - Shell command line (`$ termless play demo.tape`): tokenize via tokenizeCmdline()
 *   and style each token by kind (dim prompt, primary program/subcommand,
 *   secondary flags, accent brackets, dim quoted strings, plain values)
 * - Option-like (`-f, --flag`): entire term styled as option
 * - Plain text: command words + argument brackets
 *
 * For multi-line terms, callers split on \n and call this per line — see
 * _renderSections().
 */
function styleSectionTerm(term: string, helper: any): string {
  // Shell command terms (start with "$ ", "# ", "> ", "❯ ")
  if (isShellLine(term)) {
    return styleCmdlineTokens(tokenizeCmdline(term), helper)
  }

  // Option-like terms: entire term styled as option
  if (/^\s*-/.test(term)) return helper.styleOptionText(term)

  // Command-like terms: style command words with primary, <brackets> with accent
  // Split into bracket groups and non-bracket parts
  const parts = term.split(/(<[^>]+>|\[[^\]]+\])/g)
  if (parts.length === 1) {
    // No brackets — style entire term as command
    return helper.styleCommandText(term)
  }
  // Mix of command text and brackets
  return parts
    .map((part) => {
      if (/^[<[]/.test(part)) return helper.styleArgumentText(part)
      if (part) return helper.styleCommandText(part)
      return part
    })
    .join("")
}

/**
 * Apply style hooks to a stream of CmdlineTokens.
 *
 * Each token kind maps to one of Commander's style hooks (or a manual ANSI
 * dim escape for prompts/quoted strings, since Commander's style hook set
 * doesn't have a "dim" entry).
 */
function styleCmdlineTokens(tokens: CmdlineToken[], helper: any): string {
  const dim = (text: string) => (shouldColorize() ? `\x1b[2m${text}\x1b[22m` : text)
  return tokens
    .map((t) => {
      switch (t.kind) {
        case "prompt":
          return dim(t.text)
        case "program":
        case "subcommand":
          return helper.styleCommandText(t.text)
        case "flag":
          return helper.styleOptionText(t.text)
        case "arg-bracket":
          return helper.styleArgumentText(t.text)
        case "quoted":
          return dim(t.text)
        case "value":
        case "whitespace":
          return t.text
      }
    })
    .join("")
}

/**
 * Compute the longest visual width of any line within a (possibly multi-line) term.
 * Used for column alignment when terms span multiple lines.
 */
function maxLineWidth(term: string): number {
  let max = 0
  for (const line of term.split("\n")) {
    if (line.length > max) max = line.length
  }
  return max
}

// ────────────────────────────────────────────────────────────────
// Command class — runtime implementation (non-generic)
//
// The class itself is NOT generic. Type-safe option inference is
// layered on via interface merging below (see `TypedOptionOverloads`).
// This keeps the class fully compatible with Commander's base Command
// (no `noImplicitOverride` or structural assignability issues).
// ────────────────────────────────────────────────────────────────

class _CommandBase extends BaseCommand {
  private _helpSectionList: StoredSection[] = []
  private _helpSectionsInstalled = false

  /** Argument names registered via typed .argument() — used by .action() to merge into opts. */
  _typedArgNames: string[] = []

  constructor(name?: string) {
    super(name)
    colorizeHelp(this as any)
    this._capitalizeBuiltinDescriptions()
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
  override option(
    flags: string,
    description?: string,
    parseArgOrDefault?: any,
    defaultValue?: any,
  ): this {
    if (Array.isArray(parseArgOrDefault)) {
      const opt = new Option(flags, description ?? "").choices(parseArgOrDefault as string[])
      this.addOption(opt)
      return this
    }
    if (isStandardSchema(parseArgOrDefault)) {
      return super.option(
        flags,
        description ?? "",
        standardSchemaParser(parseArgOrDefault),
        defaultValue,
      )
    }
    if (isLegacyZodSchema(parseArgOrDefault)) {
      return super.option(
        flags,
        description ?? "",
        legacyZodParser(parseArgOrDefault),
        defaultValue,
      )
    }
    if (typeof parseArgOrDefault === "function") {
      return super.option(flags, description ?? "", parseArgOrDefault, defaultValue)
    }
    return super.option(flags, description ?? "", parseArgOrDefault)
  }

  /**
   * Add an argument with smart third-argument detection.
   *
   * Same detection as `.option()`: array → choices, Standard Schema → parser,
   * legacy Zod → parser, function → parser, anything else → default value.
   * Tracks argument names for `.action()` merging.
   */
  override argument(
    flags: string,
    description?: string,
    parseArgOrDefault?: any,
    defaultValue?: any,
  ): this {
    // Extract the camelCase name from the flags string for action() merging
    const rawName = flags.replace(/[<\[\]>.]/g, "").trim()
    const camelName = rawName.replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase())
    this._typedArgNames.push(camelName)

    if (Array.isArray(parseArgOrDefault)) {
      const arg = this.createArgument(flags, description ?? "")
      arg.choices(parseArgOrDefault as string[])
      this.addArgument(arg)
      return this
    }
    if (isStandardSchema(parseArgOrDefault)) {
      return super.argument(
        flags,
        description ?? "",
        standardSchemaParser(parseArgOrDefault),
        defaultValue,
      )
    }
    if (isLegacyZodSchema(parseArgOrDefault)) {
      return super.argument(
        flags,
        description ?? "",
        legacyZodParser(parseArgOrDefault),
        defaultValue,
      )
    }
    if (typeof parseArgOrDefault === "function") {
      return super.argument(flags, description ?? "", parseArgOrDefault, defaultValue)
    }
    return super.argument(flags, description ?? "", parseArgOrDefault)
  }

  /**
   * Register an action callback with a named-parameter object instead of positional args.
   *
   * The handler receives a single object containing all positional arguments
   * (merged by name) and all options, plus the Command instance as a second arg.
   * Argument names come from the typed `.argument()` calls, camelCased.
   *
   * This is a convenience wrapper over `.action()` — `.action()` itself remains
   * Commander-native `(...args, opts, command) => ...`. Prefer `.action()` for
   * single-arg commands (where positional is more ergonomic) and `.actionMerged()`
   * for multi-arg commands (where a flat named object is nicer).
   *
   * @example
   * ```ts
   * new Command("deploy")
   *   .argument("<service>")
   *   .argument("[env]")
   *   .option("-p, --port <n>", port)
   *   .actionMerged(({ service, env, port }, cmd) => {
   *     // service, env, port are all typed
   *     // cmd is the Command instance
   *   })
   * ```
   */
  actionMerged(fn: (params: any, cmd: any) => any): this {
    const argNames = this._typedArgNames
    return super.action((...args: any[]) => {
      // Commander passes: (arg1, arg2, ..., opts, command)
      const cmd = args[args.length - 1]
      const opts = args[args.length - 2] ?? {}
      const merged: Record<string, unknown> = { ...opts }
      for (let i = 0; i < argNames.length; i++) {
        merged[argNames[i]!] = args[i]
      }
      return fn(merged, cmd)
    })
  }

  /**
   * Add a styled help section — like Commander's `addHelpText` but with
   * structured content that participates in global column alignment.
   *
   * @example
   * ```ts
   * // Rows with aligned descriptions (default position: "after")
   * program.addHelpSection("Getting Started:", [
   *   ["myapp init", "Initialize a new project"],
   *   ["myapp serve", "Start the dev server"],
   * ])
   *
   * // Free-form text
   * program.addHelpSection("Note:", "Requires Node.js 23+")
   *
   * // Explicit position
   * program.addHelpSection("before", "Prerequisites:", [
   *   ["node >= 23", "Required runtime"],
   * ])
   * ```
   */
  addHelpSection(title: string, content: HelpSectionContent): this
  addHelpSection(position: HelpSectionPosition, title: string, content: HelpSectionContent): this
  addHelpSection(
    positionOrTitle: HelpSectionPosition | string,
    titleOrContent: string | HelpSectionContent,
    content?: HelpSectionContent,
  ): this {
    let position: HelpSectionPosition
    let title: string
    let body: HelpSectionContent

    if (content !== undefined) {
      // 3-arg: addHelpSection(position, title, content)
      position = positionOrTitle as HelpSectionPosition
      title = titleOrContent as string
      body = content
    } else {
      // 2-arg: addHelpSection(title, content) — defaults to "after"
      position = "after"
      title = positionOrTitle
      body = titleOrContent as HelpSectionContent
    }

    this._helpSectionList.push({ position, title, content: body })
    this._installHelpSectionHooks()
    return this
  }

  // Subcommands also get colorized help, Standard Schema, and array choices
  override createCommand(name?: string): _CommandBase {
    return new _CommandBase(name)
  }

  /**
   * Override Commander's `command()` to mirror inline-arg names (from
   * `command("deploy <service>")`) into our `_typedArgNames`. This keeps
   * `.actionMerged()` working on subcommands declared with the inline form,
   * since the merged dispatch reads from `_typedArgNames` to know which
   * positional indices map to which key.
   *
   * Both forms now coexist:
   *   .command("deploy <service>")               // inline — names from string
   *   .command("deploy").argument("<service>")   // explicit — names from .argument()
   * Both produce equivalent runtime + type behavior.
   */
  override command(...args: any[]): any {
    // biome-ignore lint: variadic forwarding
    const result = (super.command as any).apply(this, args)
    // The newly-created subcommand is always the last entry in this.commands
    // (Commander appends after createCommand). Its _args field has been populated
    // by Commander's own parsing of the name string.
    const sub = this.commands[this.commands.length - 1] as _CommandBase | undefined
    if (sub && Array.isArray((sub as any)._args)) {
      for (const arg of (sub as any)._args as Array<{ name(): string }>) {
        const argName = arg.name()
        const camel = argName.replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase())
        if (!sub._typedArgNames.includes(camel)) {
          sub._typedArgNames.push(camel)
        }
      }
    }
    return result
  }

  /**
   * Auto-detect capitalization from user-provided descriptions and match it
   * for built-in options (-V/--version, -h/--help).
   */
  private _capitalizeBuiltinDescriptions(): void {
    const origHelp = this.helpInformation.bind(this)
    this.helpInformation = () => {
      const builtinFlags = new Set(["-V, --version", "-h, --help"])
      const userDescs = this.options
        .filter(
          (opt) =>
            !builtinFlags.has(opt.flags) && opt.description && /^[a-zA-Z]/.test(opt.description),
        )
        .map((opt) => opt.description!)
      for (const cmd of this.commands) {
        if (cmd.description() && /^[a-zA-Z]/.test(cmd.description())) {
          userDescs.push(cmd.description())
        }
      }
      if (userDescs.length > 0) {
        const capitalCount = userDescs.filter((d) => /^[A-Z]/.test(d)).length
        if (capitalCount > userDescs.length / 2) {
          for (const opt of this.options) {
            if (builtinFlags.has(opt.flags) && opt.description && /^[a-z]/.test(opt.description)) {
              opt.description = opt.description[0]!.toUpperCase() + opt.description.slice(1)
            }
          }
          const helpOpt = (this as any)._helpOption
          if (helpOpt?.description && /^[a-z]/.test(helpOpt.description)) {
            helpOpt.description =
              helpOpt.description[0]!.toUpperCase() + helpOpt.description.slice(1)
          }
        }
      }
      return origHelp()
    }
  }

  /**
   * Render sections for a given position using the help formatter.
   *
   * Handles multi-line term entries (terms containing `\n`) by emitting one
   * row per line. The description column is **top-aligned**: it appears only
   * on the first line of a multi-line term, with subsequent lines holding
   * just the styled term and an empty description column.
   */
  private _renderSections(position: HelpSectionPosition, helper: any, termWidth: number): string {
    const sections = this._helpSectionList.filter((s) => s.position === position)
    if (sections.length === 0) return ""

    const lines: string[] = []
    for (const section of sections) {
      lines.push("")
      lines.push(helper.styleTitle(section.title))
      if (typeof section.content === "string") {
        for (const line of section.content.split("\n")) {
          lines.push(`  ${line}`)
        }
      } else {
        for (const [term, desc] of section.content) {
          // Multi-line term support: split on \n, emit one row per line.
          // First line carries the description; subsequent lines have empty desc.
          const termLines = term.split("\n")
          for (let i = 0; i < termLines.length; i++) {
            const lineText = termLines[i]!
            const styledTerm = styleSectionTerm(lineText, helper)
            const lineDesc = i === 0 ? helper.styleDescriptionText(desc) : ""
            lines.push(helper.formatItem(styledTerm, termWidth, lineDesc, helper))
          }
        }
      }
    }
    lines.push("")
    return lines.join("\n")
  }

  /** Install hooks once — merges with existing configureHelp, adds addHelpText for before/afterAll. */
  private _installHelpSectionHooks(): void {
    if (this._helpSectionsInstalled) return
    this._helpSectionsInstalled = true

    const self = this
    const existing = (this as any)._helpConfiguration ?? {}
    const origPadWidth = existing.padWidth
    const origFormatHelp = existing.formatHelp
    const protoFormatHelp = Help.prototype.formatHelp

    this.configureHelp({
      ...existing,
      // Include section term widths in global column alignment
      padWidth(cmd: any, helper: any) {
        const base = origPadWidth
          ? origPadWidth(cmd, helper)
          : Math.max(
              helper.longestOptionTermLength(cmd, helper),
              helper.longestGlobalOptionTermLength?.(cmd, helper) ?? 0,
              helper.longestSubcommandTermLength(cmd, helper),
              helper.longestArgumentTermLength(cmd, helper),
            )
        if (cmd !== self) return base
        let sectionMax = 0
        for (const section of self._helpSectionList) {
          if (typeof section.content !== "string") {
            for (const [term] of section.content) {
              // For multi-line terms, use the LONGEST line, not the total length.
              const w = maxLineWidth(term)
              if (w > sectionMax) sectionMax = w
            }
          }
        }
        return Math.max(base, sectionMax)
      },
      // Render "before" and "after" sections inside formatHelp
      formatHelp(cmd: any, helper: any) {
        const baseHelp = origFormatHelp
          ? origFormatHelp(cmd, helper)
          : protoFormatHelp.call(helper, cmd, helper)
        // Only render THIS command's sections. configureHelp is inherited by
        // subcommands, so without this guard parent sections leak into subcommand help.
        // Subcommands with their own sections install their own hooks.
        if (cmd !== self) return baseHelp
        const termWidth = helper.padWidth(cmd, helper)
        const before = self._renderSections("before", helper, termWidth)
        const after = self._renderSections("after", helper, termWidth)

        // "before" goes after the Usage+Description but before Options.
        // Since we can't inject mid-formatHelp easily, prepend before baseHelp.
        // "after" appends at the end.
        return (before ? before + "\n" : "") + baseHelp + after
      },
    })

    // "beforeAll" and "afterAll" use Commander's addHelpText (propagates to subcommands)
    this.addHelpText("beforeAll", () => {
      const helper = this.createHelp()
      const termWidth = helper.padWidth(this, helper)
      return this._renderSections("beforeAll", helper, termWidth)
    })
    this.addHelpText("afterAll", () => {
      const helper = this.createHelp()
      const termWidth = helper.padWidth(this, helper)
      return this._renderSections("afterAll", helper, termWidth)
    })
  }
}

// ────────────────────────────────────────────────────────────────
// Type-safe option inference layer
//
// The `Command` type wraps `_CommandBase` with three generic parameters:
//   - `Opts`       — accumulated options (from `.option()`)
//   - `Args`       — tuple of positional arg types (from `.argument()`)
//   - `ArgsRecord` — record mapping arg names to types (for merged form)
//
// Each `.option()` overload narrows `Opts`.
// Each `.argument()` overload appends to both `Args` and `ArgsRecord`.
// The runtime class is `_CommandBase` — `Command` is just a type alias
// with a constructor wrapper.
// ────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────
// Public type: Command<Opts, Args, ArgsRecord>
//
// Interface merging adds typed `.option()`, `.argument()`, `.opts()`,
// and `.action()` overloads on top of `_CommandBase`. The `@ts-expect-error`
// suppresses the `opts()` return type conflict (we intentionally narrow it
// from Commander's generic `<T>() => T` to a concrete `() => Opts`).
// ────────────────────────────────────────────────────────────────

// @ts-expect-error — opts() intentionally narrows from base <T>() => T to () => Opts
export interface Command<
  Opts extends Record<string, unknown> = {},
  Args extends any[] = [],
  ArgsRecord extends Record<string, unknown> = {},
> extends _CommandBase {
  /** Return option values with full type inference. */
  opts(): Opts

  /** Accept any `Command<...>` variant as a subcommand. */
  addCommand(
    cmd: Command<any, any, any>,
    opts?: { isDefault?: boolean; hidden?: boolean; noHelp?: boolean },
  ): this

  /** Factory for subcommands — returns a fresh `Command<{}>`. */
  createCommand(name?: string): Command<{}, [], {}>

  // -- Chain-preserving overrides for inherited Commander methods --
  // Without these, calling .description(), .alias(), or .version() loses the
  // generic type parameters (falls back to base Commander's `this`).

  /** Set command description (preserves typed chain). */
  description(str: string): this
  /** Get command description. */
  description(): string

  /** Set command alias (preserves typed chain). */
  alias(alias: string): this
  /** Get command alias. */
  alias(): string

  /** Set command version (preserves typed chain). */
  version(str: string, flags?: string, description?: string): this

  // -- Typed option overloads --

  /** Add a choices option: `--env <e>`, `["dev", "staging", "prod"]` */
  option<F extends string, const C extends readonly string[]>(
    flags: F,
    description: string,
    choices: C,
  ): Command<Opts & Record<FlagKey<F>, C[number] | undefined>, Args, ArgsRecord>

  /** Add an option with a CLIType preset (port, csv, uint, etc.) */
  option<F extends string, T>(
    flags: F,
    description: string,
    schema: CLIType<T>,
    defaultValue?: T,
  ): Command<Opts & Record<FlagKey<F>, T | undefined>, Args, ArgsRecord>

  /** Add an option with a Standard Schema v1 validator (Zod, Valibot, ArkType) */
  option<F extends string, S extends AnyStandardSchema>(
    flags: F,
    description: string,
    schema: S,
    defaultValue?: SchemaOutput<S>,
  ): Command<Opts & Record<FlagKey<F>, SchemaOutput<S> | undefined>, Args, ArgsRecord>

  /** Add an option with a parser function */
  option<F extends string, T>(
    flags: F,
    description: string,
    parseArg: (value: string, previous: T) => T,
    defaultValue?: T,
  ): Command<Opts & Record<FlagKey<F>, T | undefined>, Args, ArgsRecord>

  /** Add a boolean flag or string-value option (no parser) */
  option<F extends string>(
    flags: F,
    description?: string,
    defaultValue?: string | boolean,
  ): Command<Opts & Record<FlagKey<F>, InferOptionType<F>>, Args, ArgsRecord>

  /**
   * Fallback: accepts any third argument (legacy Zod, unknown schemas, etc.)
   * that doesn't match the more specific overloads above.
   */
  option<F extends string>(
    flags: F,
    description: string,
    parseArgOrDefault: any,
    defaultValue?: any,
  ): Command<Opts, Args, ArgsRecord>

  // -- Typed argument overloads --
  // Arguments append to the Args tuple (for native .action()) AND to ArgsRecord
  // (for .actionMerged()). They do NOT merge into Opts — Opts is strictly options-only.

  /** Add a choices argument: `<env>`, `["dev", "staging", "prod"]` */
  argument<F extends string, const C extends readonly string[]>(
    flags: F,
    description: string,
    choices: C,
  ): Command<
    Opts,
    [
      ...Args,
      IsArgVariadic<F> extends true
        ? C[number][]
        : IsArgRequired<F> extends true
          ? C[number]
          : C[number] | undefined,
    ],
    ArgsRecord &
      Record<
        ArgKey<F>,
        IsArgVariadic<F> extends true
          ? C[number][]
          : IsArgRequired<F> extends true
            ? C[number]
            : C[number] | undefined
      >
  >

  /** Add an argument with a CLIType preset (port, csv, uint, etc.) */
  argument<F extends string, T>(
    flags: F,
    description: string,
    schema: CLIType<T>,
    defaultValue?: T,
  ): Command<
    Opts,
    [...Args, InferArgType<F, CLIType<T>>],
    ArgsRecord & Record<ArgKey<F>, InferArgType<F, CLIType<T>>>
  >

  /** Add an argument with a Standard Schema v1 validator (Zod, Valibot, ArkType) */
  argument<F extends string, S extends AnyStandardSchema>(
    flags: F,
    description: string,
    schema: S,
    defaultValue?: SchemaOutput<S>,
  ): Command<
    Opts,
    [...Args, InferArgType<F, StandardSchemaV1<SchemaOutput<S>>>],
    ArgsRecord & Record<ArgKey<F>, InferArgType<F, StandardSchemaV1<SchemaOutput<S>>>>
  >

  /** Add an argument with a parser function */
  argument<F extends string, T>(
    flags: F,
    description: string,
    parseArg: (value: string, previous: T) => T,
    defaultValue?: T,
  ): Command<
    Opts,
    [...Args, InferArgType<F, (value: string, previous: T) => T>],
    ArgsRecord & Record<ArgKey<F>, InferArgType<F, (value: string, previous: T) => T>>
  >

  /** Add a string argument (no parser) — required, optional, or variadic */
  argument<F extends string>(
    flags: F,
    description?: string,
    defaultValue?: string,
  ): Command<Opts, [...Args, InferArgType<F>], ArgsRecord & Record<ArgKey<F>, InferArgType<F>>>

  /** Fallback: accepts any third argument */
  argument<F extends string>(
    flags: F,
    description: string,
    parseArgOrDefault: any,
    defaultValue?: any,
  ): Command<Opts, Args, ArgsRecord>

  // -- Typed action overloads --

  /**
   * Register an action handler — Commander-native positional form.
   * Receives `(...positionalArgs, opts, command)`. The command instance is
   * appended last so it can be safely ignored by handlers that don't need it.
   */
  action(
    fn: (...args: [...Args, Opts, Command<Opts, Args, ArgsRecord>]) => void | Promise<void>,
  ): this

  /**
   * Register an action handler — merged named-object form.
   * Receives `(params, command)` where `params` is a flat object of
   * args merged with options, keyed by argument/option name.
   *
   * Use this when you prefer a single destructured object to multiple positional
   * parameters — especially for commands with 2+ arguments.
   */
  actionMerged(
    fn: (params: Opts & ArgsRecord, cmd: Command<Opts, Args, ArgsRecord>) => void | Promise<void>,
  ): this

  // -- Typed command overload --

  /**
   * Create a subcommand. Returns a fresh `Command<{}, ParsedArgs, ParsedArgsRecord>`.
   *
   * Positional arguments embedded in the command name string (`"deploy <service>"`)
   * are parsed at the type level and contribute to the returned `Args` tuple and
   * `ArgsRecord`. The same shape as if you'd chained `.argument("<service>")`.
   *
   * For typed parsers, schemas, or choices, use `.argument()` on the returned
   * command — the inline string syntax can only express plain string args.
   * Mixing both forms is allowed: inline args come first in the tuple, then
   * `.argument()` calls append.
   */
  command<S extends string>(
    nameAndArgs: S,
    opts?: { isDefault?: boolean; hidden?: boolean; noHelp?: boolean },
  ): ParseCommandString<S> extends [infer A extends any[], infer R extends Record<string, unknown>]
    ? Command<{}, A, R>
    : Command<{}, [], {}>

  /** Overload for command with description (attached-action subcommand, returns parent). */
  command<S extends string>(
    nameAndArgs: S,
    description: string,
    opts?: { isDefault?: boolean; hidden?: boolean; noHelp?: boolean; executableFile?: string },
  ): this
}

/**
 * Type-safe Commander Command with auto-colorized help, Standard Schema support,
 * array-as-choices detection, and inferred option types.
 *
 * Use `.action()` for Commander-native positional form — `(arg1, arg2, opts, cmd) => ...`.
 * Use `.actionMerged()` for a flat destructured form — `({ arg1, arg2, opt1 }, cmd) => ...`.
 *
 * @example
 * ```ts
 * new Command("deploy")
 *   .argument("<service>", "Service to deploy")
 *   .argument("[env]", "Environment", ["dev", "staging", "prod"] as const)
 *   .option("--verbose", "Verbose output")
 *   .action((service, env, opts) => { ... })
 *   // or: .actionMerged(({ service, env, verbose }) => { ... })
 * ```
 */
export const Command = _CommandBase as unknown as {
  new (name?: string): Command<{}, [], {}>
}
