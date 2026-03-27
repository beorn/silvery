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

/** A styled help section: title + rows of [term, description] pairs, or just text. */
export interface HelpSection {
  /** Section heading (e.g., "Getting Started:") */
  title: string
  /** Rows as [term, description] pairs — formatted like Commander's option/command lists */
  rows?: [string, string][]
  /** Free-form body text (used if rows is not provided) */
  body?: string
}

export class Command extends BaseCommand {
  private _helpSections: HelpSection[] = []
  private _sectionsRegistered = false

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
  override option(flags: string, description?: string, parseArgOrDefault?: any, defaultValue?: any): this {
    if (Array.isArray(parseArgOrDefault)) {
      const opt = new Option(flags, description ?? "").choices(parseArgOrDefault as string[])
      this.addOption(opt)
      return this
    }
    if (isStandardSchema(parseArgOrDefault)) {
      return super.option(flags, description ?? "", standardSchemaParser(parseArgOrDefault), defaultValue)
    }
    if (isLegacyZodSchema(parseArgOrDefault)) {
      return super.option(flags, description ?? "", legacyZodParser(parseArgOrDefault), defaultValue)
    }
    if (typeof parseArgOrDefault === "function") {
      return super.option(flags, description ?? "", parseArgOrDefault, defaultValue)
    }
    return super.option(flags, description ?? "", parseArgOrDefault)
  }

  /**
   * Add a styled help section that appears after the standard help output.
   * Sections are formatted with the same alignment as Commander's built-in lists.
   *
   * @example
   * ```ts
   * program.addSection({
   *   title: "Getting Started:",
   *   rows: [
   *     ["myapp init", "Initialize a new project"],
   *     ["myapp serve", "Start the dev server"],
   *   ],
   * })
   * ```
   */
  addSection(section: HelpSection): this {
    this._helpSections.push(section)
    this._installSectionHooks()
    return this
  }

  // Subcommands also get colorized help, Standard Schema, and array choices
  override createCommand(name?: string): Command {
    return new Command(name)
  }

  /**
   * Auto-detect capitalization from user-provided descriptions and match it
   * for built-in options (-V/--version, -h/--help).
   *
   * If most user descriptions start with uppercase, capitalize the built-in ones too.
   * If most start with lowercase, leave them as-is.
   */
  private _capitalizeBuiltinDescriptions(): void {
    const origHelp = this.helpInformation.bind(this)
    this.helpInformation = () => {
      // Check user-provided descriptions (skip built-in -V and -h)
      const builtinFlags = new Set(["-V, --version", "-h, --help"])
      const userDescs = this.options
        .filter((opt) => !builtinFlags.has(opt.flags) && opt.description && /^[a-zA-Z]/.test(opt.description))
        .map((opt) => opt.description!)
      // Also check subcommand descriptions
      for (const cmd of this.commands) {
        if (cmd.description() && /^[a-zA-Z]/.test(cmd.description())) {
          userDescs.push(cmd.description())
        }
      }
      if (userDescs.length > 0) {
        const capitalCount = userDescs.filter((d) => /^[A-Z]/.test(d)).length
        if (capitalCount > userDescs.length / 2) {
          // Majority capitalized — capitalize built-in descriptions too
          for (const opt of this.options) {
            if (builtinFlags.has(opt.flags) && opt.description && /^[a-z]/.test(opt.description)) {
              opt.description = opt.description[0]!.toUpperCase() + opt.description.slice(1)
            }
          }
          // Also capitalize the help option (stored separately by Commander)
          const helpOpt = (this as any)._helpOption
          if (helpOpt?.description && /^[a-z]/.test(helpOpt.description)) {
            helpOpt.description = helpOpt.description[0]!.toUpperCase() + helpOpt.description.slice(1)
          }
        }
      }
      return origHelp()
    }
  }

  /**
   * Hook into Commander's configureHelp to render sections as part of formatHelp,
   * participating in global padWidth alignment.
   */
  private _installSectionHooks(): void {
    if (this._sectionsRegistered) return
    this._sectionsRegistered = true

    const sections = this._helpSections
    // Merge with existing help config (don't replace — colorizeHelp already set style hooks)
    const existing = (this as any)._helpConfiguration ?? {}
    const origPadWidth = existing.padWidth
    const origFormatHelp = existing.formatHelp

    // Capture Help.prototype.formatHelp as the base fallback
    const { Help } = require("commander") as { Help: any }
    const protoFormatHelp = Help.prototype.formatHelp

    this.configureHelp({
      ...existing,
      padWidth: (cmd: any, helper: any) => {
        const base = origPadWidth ? origPadWidth(cmd, helper) : Math.max(
          helper.longestOptionTermLength(cmd, helper),
          helper.longestGlobalOptionTermLength?.(cmd, helper) ?? 0,
          helper.longestSubcommandTermLength(cmd, helper),
          helper.longestArgumentTermLength(cmd, helper),
        )
        let sectionMax = 0
        for (const section of sections) {
          if (section.rows) {
            for (const [term] of section.rows) {
              if (term.length > sectionMax) sectionMax = term.length
            }
          }
        }
        return Math.max(base, sectionMax)
      },
      formatHelp: (cmd: any, helper: any) => {
        const baseHelp = origFormatHelp
          ? origFormatHelp(cmd, helper)
          : protoFormatHelp.call(helper, cmd, helper)
        if (sections.length === 0) return baseHelp

        const termWidth = helper.padWidth(cmd, helper)
        const lines: string[] = []
        for (const section of sections) {
          lines.push("")
          lines.push(helper.styleTitle(section.title))
          if (section.rows) {
            for (const [term, desc] of section.rows) {
              lines.push(
                helper.formatItem(helper.styleCommandText(term), termWidth, helper.styleDescriptionText(desc), helper),
              )
            }
          } else if (section.body) {
            for (const line of section.body.split("\n")) {
              lines.push(`  ${line}`)
            }
          }
        }
        lines.push("")
        return baseHelp + lines.join("\n")
      },
    })
  }
}
