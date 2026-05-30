# `@silvery/config`

Generic config-tree + named-registry primitives with string ↔ object projection.

Three layers in one small package:

- **Config** — git-config-style deep-key get/set/unset/list/save with multi-source discovery (global + project), atomic writes, file watching, and reactive signals.
- **Registry<Kind>** — typed view over a sub-tree, with connection-string parsing, schema validation, and reserved-key handling.
- **Signals** — `alien-signals`-backed `ReadSignal` views over keys, registry entries, and the root, for reactive UI.

Designed for apps that maintain named presets (database connections, AI agent connections, MCP servers, theme bundles) and want one canonical way to read, write, and address them — both as objects in YAML and as `key=value&key=value` strings on the CLI.

## Install

```bash
bun add @silvery/config zod yaml
```

## Quick start

```ts
import { loadConfig, defineKind } from "@silvery/config"
import { z } from "zod"

// Multi-source: project (`.km/config.yaml` walk-up) overrides global
// (`~/.config/km/config.yaml` on Linux/macOS, `%APPDATA%\km\config.yaml` on Windows).
const config = await loadConfig({
  appName: "km",
  defaults: { ai: { acp: { default: null } } },
  watch: true, // optional: reload + fire signals on external edits
})

// Generic deep-key access (git-config style)
config.get("ai.acp.default")
config.set("ai.acp.default", "claude-work") // → global file
config.set("project.layout", "wide", "local") // → project file (lazy-creates)
config.unset("ai.acp.legacy-claude")
config.list({ pattern: "ai.acp.*" })
await config.save() // global by default
await config.save({ scope: "local" }) // project file

// Reactive signals (alien-signals-backed; only fire on real value changes)
const acpDefault = config.signal<string>("ai.acp.default")
acpDefault() // current value
const root = config.rootSignal() // whole tree

// Single-file mode for tests / one-off loads
const fixture = await loadConfig({ path: "/tmp/test.yaml" })
```

## Multi-source discovery

When loaded with `appName`, `loadConfig` resolves two files:

| Source                            | Linux / macOS                                     | Windows                               |
| --------------------------------- | ------------------------------------------------- | ------------------------------------- |
| **Global** (user-wide)            | `${XDG_CONFIG_HOME:-~/.config}/<app>/config.yaml` | `%APPDATA%\<app>\config.yaml`         |
| **Project** (cosmiconfig walk-up) | nearest `.<app>/config.yaml` from cwd             | nearest `.<app>/config.yaml` from cwd |

Reads merge both; **project overrides global**. Writes default to global; pass `scope: "local"` to target the project file (lazy-created on first write if absent).

`opts.path` switches to single-file mode (treated as global, no project walk-up) — handy for tests.

## Scoped writes

```ts
config.set("ui.theme", "dark") // global
config.set("ai.acp.default", "codex") // global
config.set("layout", "wide", "local") // project (.km/config.yaml)

await config.save() // saves global only
await config.save({ scope: "local" }) // saves project only
```

`config.globalPath`, `config.projectPath`, and `config.path` (project ?? global) expose the resolved file paths — useful for `--edit` or "where is this coming from?" diagnostics.

## Reactive signals

Built on [`alien-signals`](https://www.npmjs.com/package/alien-signals). Dependents only re-fire when the value at the key actually changes (`computed` applies a value-equality check).

```ts
import { effect } from "alien-signals"

const themeSignal = config.signal<string>("ui.theme")
const stop = effect(() => {
  console.log("theme is", themeSignal())
})

config.set("ui.theme", "dark")
await config.save() // → effect fires
config.set("ui.theme", "dark")
await config.save() // → effect does NOT fire (same value)

stop()
```

Registries expose the same shape:

```ts
const acp = config.registry("ai.acp", AcpKind)

acp.signalEntries() // ReadSignal<RegistryEntry[]>
acp.signalDefault() // ReadSignal<Connection | undefined>
acp.signalGet("claude-work") // ReadSignal<Connection | undefined>
```

## File watching

Pass `watch: true` to enable `fs.watch` on global + project files:

```ts
const config = await loadConfig({ appName: "km", watch: true, watchDebounceMs: 100 })

// External edit (someone else writes the file) → reload + fire signals.
// Self-writes via config.save() are filtered out (200 ms grace window) to
// avoid feedback loops.

config.unwatch() // stop watching
```

`fs.watch` may fail on some filesystems (NFS, Docker bind mounts); the watcher silently degrades to no-op in that case.

## Connection-string grammar

```
[<scheme>://]<path>[?<key>=<value>&<key>=<value>...]
```

- **scheme** — optional. Sets `transport` field if present.
- **path** — sugar for the kind's `pathField`. `claude-code?...` ≡ `?agent=claude-code&...` when `pathField: "agent"`.
- **query** — `&`-separated `key=value` pairs.

Coercion rules:

- `key` (bare, no `=`) → `true`
- `!key` → `false`
- `key=1` / `key=true` → `true` (when `coerce: "boolean"`)
- `key=0` / `key=false` → `false`
- `key=0.7` → `0.7` (when `coerce: "number"`)
- `tools=read,edit` → `["read", "edit"]` (when `coerce: "array"`)
- `tools[]=read&tools[]=edit` → `["read", "edit"]` (always, regardless of hint)
- `mcp.km.cwd=/path` → `{ mcp: { km: { cwd: "/path" } } }` (dot-paths nest)

Examples:

```
claude-code
claude-code?model=opus-4.7
claude-code?account=bjorn@stabell.org&bare
codex
gemini?model=2.5-pro&temp=0.7
spawn://claude-code?bare           # explicit transport (rare)
```

Use query params for anything with `@` in the value (emails, etc.). Userinfo (`bjorn@host`) is reserved for credentials in URI semantics — don't use it for profile names.

## Typed registries

```ts
const AcpKind = defineKind({
  name: "acp",
  schema: z.object({
    agent: z.string(),
    account: z.string().optional(),
    model: z.string().optional(),
    bare: z.boolean().optional(),
  }),
  pathField: "agent",
  reservedKeys: ["default"],
  coerce: { bare: "boolean" },
})

const acp = config.registry("ai.acp", AcpKind)

acp.entries()
acp.get("claude-work")
acp.resolve("claude-work") // by name
acp.resolve("codex?model=gpt-5-mini") // by connection string (auto-detected)
acp.format("claude-work") // → connection string (lossy if metadata)
acp.default()
acp.setDefault("codex")
acp.add("quick", "codex?model=gpt-5-mini")
acp.rm("legacy-claude")
```

## YAML schema

Each registry entry is `oneOf: [string, object]`:

```yaml
ai:
  acp:
    default: claude-work # reserved key — entries can't be named "default"

    # String form — terse
    claude-work: "claude-code?account=bjorn@stabell.org&model=opus-4.7&bare"
    codex: "codex"

    # Object form — when label/color/extra fields matter
    claude-personal:
      agent: claude-code
      account: bjorn-personal
      model: sonnet-4.6
      label: Claude · personal
      color: "#a0d8a0"

    # Hybrid — string for connection bits, object for metadata
    claude-yolo:
      base: "claude-code?account=personal&bare"
      label: Claude · yolo
      mcp_servers: [km, tribe, github]
```

The `base:` field on object form parses as a connection string; sibling fields override.

## Commander wiring

Mount a unified `<app> config ...` subcommand that handles both generic key access and per-kind list/show/add/rm/default:

```ts
import { mountConfigCommand } from "@silvery/config/commander"

mountConfigCommand(program, config, {
  registries: {
    acp: { kind: AcpKind, describe: (e) => e.label ?? e.agent },
    mcp: { kind: McpKind, describe: (e) => e.command },
  },
})
```

That mounts:

```
app config                        # list all keys
app config <key>                  # get
app config <key>=<value>          # set
app config --unset <key>          # remove
app config --edit                 # open $EDITOR
app config --get-regexp <pat>     # filter
app config --local <key>=<value>  # write to project file

app config acp                    # list ACP entries (parsed)
app config acp list               # same
app config acp show <name>        # struct + connection-string projection
app config acp add <name>=<value> # add or replace
app config acp rm <name>          # remove
app config acp default <name>     # set default
```

## Persistence

- **Atomic writes**: serialize → write to `<path>.tmp.<random>` → `rename`. No partial-write corruption.
- **Mode 0o600** — configs may carry sensitive paths.
- **Comment + key-order preservation** across `load → mutate → save`.
- **YAML format**: `yaml` package (Eemeli Aro's; standards-compliant).

## License

MIT
