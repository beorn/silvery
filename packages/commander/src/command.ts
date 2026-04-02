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

import { Command as BaseCommand, Help, Option } from "commander"
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
 * Style a section term using Commander's style hooks.
 * Splits the term into segments: option-like (-f), argument brackets (<arg>, [opt]),
 * and command words — each styled with the appropriate hook.
 */
function styleSectionTerm(term: string, helper: any): string {
  // Option-like terms: entire term styled as option
  if (/^\s*-/.test(term)) return helper.styleOptionText(term)

  // Mixed terms: style <arg>/[opt] as arguments, "quoted" as literal values, rest as commands
  return term.replace(
    /(<[^>]+>|\[[^\]]+\])|("[^"]*")|([^<["[\]]+)/g,
    (_match, bracket: string, quoted: string, text: string) => {
      if (bracket) return helper.styleArgumentText(bracket)
      if (quoted) return quoted // literal values — default foreground (quotes distinguish them)
      if (text) return helper.styleCommandText(text)
      return ""
    },
  )
}

export class Command extends BaseCommand {
  private _helpSectionList: StoredSection[] = []
  private _helpSectionsInstalled = false

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
  override createCommand(name?: string): Command {
    return new Command(name)
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
        .filter((opt) => !builtinFlags.has(opt.flags) && opt.description && /^[a-zA-Z]/.test(opt.description))
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
            helpOpt.description = helpOpt.description[0]!.toUpperCase() + helpOpt.description.slice(1)
          }
        }
      }
      return origHelp()
    }
  }

  /** Render sections for a given position using the help formatter. */
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
          const styleTerm = styleSectionTerm(term, helper)
          lines.push(helper.formatItem(styleTerm, termWidth, helper.styleDescriptionText(desc), helper))
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
              if (term.length > sectionMax) sectionMax = term.length
            }
          }
        }
        return Math.max(base, sectionMax)
      },
      // Render "before" and "after" sections inside formatHelp
      formatHelp(cmd: any, helper: any) {
        const baseHelp = origFormatHelp ? origFormatHelp(cmd, helper) : protoFormatHelp.call(helper, cmd, helper)
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
