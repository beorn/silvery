/**
 * Commander wiring for `<app> config ...` — generic key access + per-kind
 * list/show/add/rm/default in a single subcommand tree.
 *
 * Optional peer-dep on `commander` / `@silvery/commander`. Apps that don't use
 * commander can wire their own CLI directly against the Config + Registry APIs.
 */
import type { ZodSchema } from "zod"
import type { Config, Kind } from "./types.ts"

// Minimal Commander.Command surface we rely on. We import a type-only stub so
// this file is usable without taking a runtime dep on commander when the host
// app supplies its own.
export interface CommanderLike {
  command(spec: string): CommanderLike
  description(d: string): CommanderLike
  option(flags: string, description: string, defaultValue?: unknown): CommanderLike
  argument(name: string, description?: string): CommanderLike
  action(fn: (...args: unknown[]) => void | Promise<void>): CommanderLike
  alias(a: string): CommanderLike
}

export interface KindMount<S extends ZodSchema = ZodSchema> {
  kind: Kind<S>
  /** How to render an entry's one-line summary in `list` output. */
  describe?: (entry: ReturnType<S["parse"]> extends infer T ? T : unknown) => string
  /** Where in the config tree this kind's entries live. Default: `${section}.${name}` from `mountConfigCommand` opts. */
  prefix?: string
}

export interface MountConfigOpts {
  /** Top-level YAML section that registry kinds live under. Default: undefined (kinds use their own absolute prefix). */
  section?: string
  /** Map of kind-name → mount spec. Each kind gets a `config <name> ...` subcommand tree. */
  registries?: Record<string, KindMount>
  /** Allow `config <key>=<value>` writes. Default true. */
  allowRawWrite?: boolean
  /** Allow `config <kind> add|rm|default ...`. Default true. */
  allowRegistryMutation?: boolean
}

/**
 * Mount the unified `config` subcommand on a Commander program.
 *
 * Dispatch rules for `<app> config <token1> [<token2>...]`:
 *
 * - `config` (no token) → list all leaves
 * - `config <kind>` → alias for `config <kind> list` (when token1 matches a registered kind)
 * - `config <kind> <verb> ...` → run the kind verb (list, show, add, rm, default)
 * - `config <key>` → get value at key
 * - `config <key>=<value>` → set value
 * - `config --unset <key>` / `--list` / `--get-regexp <pat>` / `--edit` → flag verbs
 */
/**
 * Accept either a Config directly OR a factory that resolves one lazily.
 *
 * The factory form is essential for apps where the config depends on per-
 * invocation state (e.g. `km`'s `--repo <path>` or cwd-based discovery): the
 * Config must be loaded INSIDE the action callback, not at registration time.
 * Apps with a single global config (silvercode) can keep passing the Config
 * directly.
 */
export type ConfigOrFactory = Config | (() => Config | Promise<Config>)

export function mountConfigCommand(
  program: CommanderLike,
  configOrFactory: ConfigOrFactory,
  opts: MountConfigOpts = {},
): void {
  const allowRawWrite = opts.allowRawWrite ?? true
  const allowMutation = opts.allowRegistryMutation ?? true
  const registries = opts.registries ?? {}

  async function getConfig(): Promise<Config> {
    return typeof configOrFactory === "function" ? await configOrFactory() : configOrFactory
  }

  const cmd = program.command("config [args...]").description("get/set config values and manage named entries")

  cmd.option("--unset <key>", "Remove the leaf at <key>")
  cmd.option("--list", "List all leaves (default with no args)")
  cmd.option("--get-regexp <pattern>", "Filter --list by regex on the key")
  cmd.option("--edit", "Open the config file in $EDITOR")

  cmd.action(async (...actionArgs: unknown[]) => {
    const rawArgs = (actionArgs[0] ?? []) as string[]
    const options = (actionArgs[1] ?? {}) as Record<string, unknown>
    const args = rawArgs
    const config = await getConfig()

    if (options.edit) {
      await runEditor(config)
      return
    }
    if (typeof options.unset === "string") {
      config.unset(options.unset)
      await config.save()
      return
    }
    if (options.list || (args.length === 0)) {
      const pattern = typeof options["getRegexp"] === "string" ? (options["getRegexp"] as string) : undefined
      const list = pattern
        ? config.list().filter((e) => new RegExp(pattern).test(e.key))
        : config.list()
      for (const { key, value } of list) {
        process.stdout.write(`${key}=${formatLeafValue(value)}\n`)
      }
      return
    }

    // First positional may be a registered kind name → dispatch to kind handler.
    const [first, ...rest] = args
    if (first && first in registries) {
      const mount = registries[first]
      if (!mount) return
      await dispatchKindVerb({
        config,
        section: opts.section,
        kindName: first,
        mount,
        verb: rest[0] ?? "list",
        verbArgs: rest.slice(1),
        allowMutation,
      })
      return
    }

    // Otherwise treat as raw key get/set.
    if (!first) {
      // Already handled above; defensive.
      return
    }
    const eqIdx = first.indexOf("=")
    if (eqIdx >= 0) {
      if (!allowRawWrite) throw new Error("config: raw writes disabled")
      const key = first.slice(0, eqIdx)
      const value = first.slice(eqIdx + 1)
      config.set(key, parseScalarValue(value))
      await config.save()
      return
    }
    const v = config.get(first)
    if (v === undefined) {
      process.exitCode = 1
      return
    }
    process.stdout.write(`${formatLeafValue(v)}\n`)
  })
}

// ---------------------------------------------------------------------------
// Kind dispatch

interface DispatchOpts {
  config: Config
  section: string | undefined
  kindName: string
  mount: KindMount
  verb: string
  verbArgs: string[]
  allowMutation: boolean
}

async function dispatchKindVerb(d: DispatchOpts): Promise<void> {
  const prefix = d.mount.prefix ?? (d.section ? `${d.section}.${d.kindName}` : d.kindName)
  // Use the Config's own registry() method — it threads the internal version signal.
  const reg = d.config.registry(prefix, d.mount.kind)

  switch (d.verb) {
    case "list": {
      for (const { name, value } of reg.entries()) {
        const isDefault = reg.default() === name ? " *" : "  "
        const summary = d.mount.describe ? d.mount.describe(value) : ""
        process.stdout.write(`${isDefault} ${name}\t${summary}\n`)
      }
      return
    }
    case "show": {
      const name = d.verbArgs[0]
      if (!name) throw new Error(`config ${d.kindName} show: <name> required`)
      const v = reg.get(name)
      if (v === undefined) {
        process.exitCode = 1
        return
      }
      process.stdout.write(`${JSON.stringify(v, null, 2)}\n\nstring: ${reg.format(name)}\n`)
      return
    }
    case "add": {
      if (!d.allowMutation) throw new Error("config: registry mutation disabled")
      const arg = d.verbArgs[0]
      if (!arg) throw new Error(`config ${d.kindName} add: <name>=<value> required`)
      const eq = arg.indexOf("=")
      if (eq < 0) throw new Error(`config ${d.kindName} add: expected <name>=<value>, got "${arg}"`)
      const name = arg.slice(0, eq)
      const value = arg.slice(eq + 1)
      reg.add(name, value)
      await d.config.save()
      return
    }
    case "rm": {
      if (!d.allowMutation) throw new Error("config: registry mutation disabled")
      const name = d.verbArgs[0]
      if (!name) throw new Error(`config ${d.kindName} rm: <name> required`)
      reg.rm(name)
      await d.config.save()
      return
    }
    case "default": {
      if (!d.allowMutation) throw new Error("config: registry mutation disabled")
      const name = d.verbArgs[0]
      if (!name) {
        const cur = reg.default()
        if (cur) process.stdout.write(`${cur}\n`)
        else process.exitCode = 1
        return
      }
      reg.setDefault(name)
      await d.config.save()
      return
    }
    default:
      throw new Error(`config ${d.kindName}: unknown verb "${d.verb}". Known: list, show, add, rm, default.`)
  }
}

// ---------------------------------------------------------------------------
// Scalars and editor

function parseScalarValue(s: string): unknown {
  if (s === "true") return true
  if (s === "false") return false
  if (s === "null") return null
  if (s === "") return ""
  // Numbers: only if the entire string parses cleanly. Avoid mangling strings
  // like "1.0.0" or "4.6" model ids — treat ambiguous as strings unless the
  // user wrapped explicitly. Conservative: integers only.
  if (/^-?\d+$/.test(s)) return Number(s)
  return s
}

function formatLeafValue(v: unknown): string {
  if (v === null) return "null"
  if (typeof v === "string") return v
  return JSON.stringify(v)
}

async function runEditor(config: Config): Promise<void> {
  const { spawn } = await import("node:child_process")
  const editor = process.env["EDITOR"] || process.env["VISUAL"] || "vi"
  // Save first to ensure the file exists before $EDITOR opens it.
  await config.save()
  const target = config.path
  if (!target) throw new Error("config: editor mode requires at least one config file path")
  await new Promise<void>((resolveDone, rejectDone) => {
    const child = spawn(editor, [target], { stdio: "inherit" })
    child.on("exit", (code: number | null) =>
      code === 0 ? resolveDone() : rejectDone(new Error(`editor exited with ${code}`)),
    )
    child.on("error", (err: Error) => rejectDone(err))
  })
  await config.reload()
}
