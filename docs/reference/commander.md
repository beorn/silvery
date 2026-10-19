# @silvery/commander

Enhanced [Commander.js](https://github.com/tj/commander.js) with type-safe options, auto-colorized help, [Standard Schema](https://github.com/standard-schema/standard-schema) validation, and built-in CLI types.

Drop-in replacement -- `Command` is a subclass of Commander's `Command` with full type inference for options, arguments, and parsed values. Install once, Commander is included.

## Installation

::: code-group

```bash [npm]
npm install @silvery/commander
```

```bash [bun]
bun add @silvery/commander
```

```bash [pnpm]
pnpm add @silvery/commander
```

```bash [yarn]
yarn add @silvery/commander
```

:::

## Four Usage Patterns

```typescript
// 1. Enhanced Commander (auto-colorized help, Standard Schema, array choices)
import { Command, port, csv } from "@silvery/commander"

// 2. Plain Commander (Standard Schema, no auto-colorization, no @silvery/ansi)
import { Command, port, csv } from "@silvery/commander/plain"

// 3. Standalone types (zero-dep, Standard Schema, no Commander)
import { port, csv, int } from "@silvery/commander/parse"

// 4. Zod + CLI types (batteries included)
import { Command, z } from "@silvery/commander"
```

## Usage

```typescript
import { Command, port, csv } from "@silvery/commander"

const program = new Command("deploy")
  .description("Deploy the application")
  .version("1.0.0")
  .option("-p, --port <n>", "Port", port) // number (1-65535)
  .option("--tags <t>", "Tags", csv) // string[]
  .option("-e, --env <e>", "Env", ["dev", "staging", "prod"]) // choices

program.parse()
const opts = program.opts()
```

Help output is automatically colorized using semantic design tokens -- bold program description, bold headings, primary commands, secondary flags, accent arguments, unstyled descriptions. With a theme, tokens resolve to theme colors; without a theme, they fall back to yellow/cyan/magenta.

## Typed positional arguments

Two ways to declare positional arguments — both are fully typed and produce equivalent `Command<Opts, Args, ArgsRecord>`:

```typescript
// Inline form — Commander.js native shorthand
const sub = program.command("deploy <service> [env]").action((service, env, opts) => {
  service // string
  env // string | undefined
})

// Explicit form — chained .argument() calls
const sub2 = program
  .command("deploy")
  .argument("<service>", "Service to deploy")
  .argument("[env]", "Environment", ["dev", "staging", "prod"] as const)
  .action((service, env, opts) => {
    service // string
    env // "dev" | "staging" | "prod" | undefined
  })
```

**Use the inline form** for plain string args. It's terse and matches Commander.js docs/tutorials.

**Use `.argument()`** when you need:

- A description for `--help` output
- A parser, schema, or `choices` array (the inline string syntax can't express these)
- A default value

The two forms compose: inline args come first in the positional tuple, and any `.argument()` calls append.

`<required>`, `[optional]`, `<variadic...>`, and `[variadic...]` are all supported in both forms. Argument names with kebab-case (`<service-name>`) are camelCased on the merged form (`params.serviceName`).

## Action handler forms

`.action()` is Commander.js native — it receives positional arguments first, then the options object, then the command instance:

```typescript
program
  .command("deploy <service>")
  .option("-p, --port <n>", "Port", port)
  .action((service, opts, cmd) => {
    // service: string
    // opts.port: number | undefined
    // cmd: Command instance
  })
```

`.actionMerged()` is an opt-in convenience that merges all positional arguments and options into a single named-object parameter, plus the command as a second arg:

```typescript
program
  .command("deploy <service> [env]")
  .option("-p, --port <n>", "Port", port)
  .option("--verbose", "Verbose")
  .actionMerged((params, cmd) => {
    // params.service: string
    // params.env: string | undefined
    // params.port: number | undefined
    // params.verbose: boolean | undefined
  })
```

**Picking between them:**

- `.action()` — better for commands with zero or one positional argument, or when you want access to the command instance as a trailing argument. Matches Commander.js muscle memory and works with any other Commander-typed library.
- `.actionMerged()` — better for commands with 2+ positional arguments, where a flat destructured object is nicer than nested positional parameters.

Both forms are fully typed end-to-end. `.actionMerged()` exists because the merged form was the original API in this package; both are now first-class.

## `addHelpSection()`

Add styled help sections that integrate with Commander's built-in formatting — same column alignment, same color scheme, proper description wrapping.

```typescript
// Rows with aligned descriptions (default position: "after")
program.addHelpSection("Getting Started:", [
  ["myapp init", "Initialize a new project"],
  ["myapp serve", "Start the dev server"],
])

// Free-form text section
program.addHelpSection("Note:", "Requires Node.js 23+")

// Explicit position (before/after/beforeAll/afterAll)
program.addHelpSection("before", "Prerequisites:", [
  ["node >= 23", "Required runtime"],
  ["-p, --port", "Must be available"], // option-like terms auto-styled
])
```

### Auto-styling rules

- Terms starting with `-` (`-v, --verbose`) → option styling (secondary color)
- Terms starting with a shell prompt (`$ `, `# `, `> `, `❯ `) → console-block styling: dim prompt, primary program name, primary subcommand, secondary flags, accent brackets, dim quoted strings
- Other terms → command styling (primary color)
- Descriptions → muted (dim) styling
- Section headings → bold (matching Commander's built-in `Options:`/`Commands:` headings)

Console-block detection works in **any** section, not just `Examples:`. A row like `["$ myapp init", "Initialize"]` in a `"Getting Started:"` section gets the same shell-aware styling.

### Multi-line terms with top-aligned descriptions

A term containing `\n` is treated as a multi-line block. Each line is rendered separately, the description appears only on the first line, and column padding is computed from the longest line:

```typescript
program.addHelpSection("Quick Start:", [
  ["$ myapp init\n$ myapp build\n$ myapp serve", "Set up and run the app"],
  ["$ myapp deploy --production", "Deploy when ready"],
])
```

Renders as:

```
Quick Start:
  $ myapp init                  Set up and run the app
  $ myapp build
  $ myapp serve
  $ myapp deploy --production   Deploy when ready
```

Useful when several commands share one description (setup sequences, build steps, multi-step recipes).

### Positions

Positions mirror Commander's `addHelpText`:

- `"before"` — before Options/Commands (inside `formatHelp`)
- `"after"` — after Commands (inside `formatHelp`) — **default**
- `"beforeAll"` — before everything, propagates to subcommands
- `"afterAll"` — after everything, propagates to subcommands

## `colorizeHelp()`

Apply colorized help to a plain Commander `Command`:

```typescript
import { Command } from "commander"
import { colorizeHelp } from "@silvery/commander"

const program = new Command("myapp").description("My CLI tool")
colorizeHelp(program) // applies recursively to all subcommands
```

`colorizeHelp()` preserves unrelated help configuration while its semantic style hooks win. On the enhanced `Command`, later `configureHelp({...})` calls also shallow-merge with the current configuration, with supplied keys taking precedence. Importing `Command` from `@silvery/commander/plain` retains Commander's replacement semantics instead.

## `silentAlias()`

Use a silent alias for a compatibility spelling that should be accepted by the parser but omitted from help, usage, and typo suggestions:

```typescript
program.command("queue").alias("q").silentAlias("queues")
```

Normal `.alias()` and `.aliases()` spellings remain visible. Command names, visible aliases, and silent aliases share one collision namespace.

## Standard Schema Validation

Pass any [Standard Schema v1](https://github.com/standard-schema/standard-schema) compatible schema as the third argument to `.option()`. Works with the built-in types, Zod (>=3.24), Valibot (>=1.0), ArkType (>=2.0), and any other library implementing the standard:

```typescript
import { Command } from "@silvery/commander"
import { z } from "zod"

const program = new Command("deploy")
  .option("-p, --port <n>", "Port", z.coerce.number().min(1).max(65535))
  .option("-e, --env <env>", "Env", z.enum(["dev", "staging", "prod"]))
  .option(
    "--tags <t>",
    "Tags",
    z.string().transform((v) => v.split(",")),
  )
```

Zod is a required peer dependency (`^4.0.0`): the `z` export comes from `@silvery/commander` itself, so the schemas you build and the ones this package builds must be one copy. Valibot and ArkType need nothing -- any Standard Schema implementation works through the `~standard` interface, detected at runtime and never imported.

## Zod CLI Types

Import `z` from `@silvery/commander` for an extended Zod object with CLI-specific schemas:

```typescript
import { Command, z } from "@silvery/commander"

const program = new Command("deploy")
  .option("-p, --port <n>", "Port", z.port) // z.coerce.number().int().min(1).max(65535)
  .option("--tags <t>", "Tags", z.csv) // z.string().transform(...)
  .option("-r, --retries <n>", "Retries", z.int) // z.coerce.number().int()
  .option("-e, --env <e>", "Env", ["dev", "staging", "prod"])
```

The `z` export is tree-shakeable by a bundler: this module is loaded with the main entry, so zod must be installed, but a bundler can drop it when you never use `z`.

Available `z` CLI types: `z.port`, `z.int`, `z.uint`, `z.float`, `z.csv`, `z.url`, `z.path`, `z.email`, `z.date`, `z.json`, `z.bool`, `z.intRange(min, max)`.

## Complete Type Reference

Every type listed below works as the third argument to `.option()`. Each validates at parse time and provides clear error messages for invalid input.

| Type                 | Output       | Validation              |      Built-in      |      Zod (`z.`)      |
| -------------------- | ------------ | ----------------------- | :----------------: | :------------------: |
| `int`                | `number`     | Integer                 |       `int`        |       `z.int`        |
| `uint`               | `number`     | Unsigned integer (>= 0) |       `uint`       |       `z.uint`       |
| `float`              | `number`     | Finite number           |      `float`       |      `z.float`       |
| `port`               | `number`     | Integer 1–65535         |       `port`       |       `z.port`       |
| `url`                | `string`     | Valid URL               |       `url`        |       `z.url`        |
| `path`               | `string`     | Non-empty string        |       `path`       |       `z.path`       |
| `csv`                | `string[]`   | Comma-separated         |       `csv`        |       `z.csv`        |
| `json`               | `unknown`    | Parsed JSON             |       `json`       |       `z.json`       |
| `bool`               | `boolean`    | true/false/yes/no/1/0   |       `bool`       |       `z.bool`       |
| `date`               | `Date`       | Valid date string       |       `date`       |       `z.date`       |
| `email`              | `string`     | Email format            |      `email`       |      `z.email`       |
| `regex`              | `RegExp`     | Valid regex pattern     |      `regex`       |          —           |
| `intRange(min, max)` | `number`     | Bounded integer         | `intRange(1, 100)` | `z.intRange(1, 100)` |
| `["a", "b"]`         | `"a" \| "b"` | Exact match             |   array literal    | `z.enum(["a", "b"])` |

**Built-in types** have zero dependencies — import from `@silvery/commander` or `@silvery/commander/parse`. Each implements [Standard Schema v1](https://github.com/standard-schema/standard-schema) with `.parse()` and `.safeParse()` for standalone use.

**Zod types** (`z.port`, `z.int`, etc.) are the same validations built on [Zod](https://zod.dev) schemas. Import `z` from `@silvery/commander` — it's the full [Zod API](https://zod.dev/?id=primitives) extended with CLI types. Tree-shakeable — Zod only loads if you import `z`. Use Zod when you need `.refine()`, `.transform()`, `.pipe()`, or other [Zod features](https://zod.dev/?id=strings).

### Other schema libraries

Any [Standard Schema v1](https://github.com/standard-schema/standard-schema) object works — [Zod](https://zod.dev) (>=3.24), [Valibot](https://valibot.dev) (>=1.0), [ArkType](https://arktype.io) (>=2.0):

```typescript
// Valibot
import * as v from "valibot"
.option("-p, --port <n>", "Port", v.pipe(v.string(), v.transform(Number), v.minValue(1)))

// ArkType
import { type } from "arktype"
.option("-p, --port <n>", "Port", type("1 <= integer <= 65535"))
```

### Function parsers

[Commander's](https://github.com/tj/commander.js) standard parser function pattern also works:

```typescript
.option("-p, --port <n>", "Port", parseInt)              // number
.option("--tags <t>", "Tags", v => v.split(","))          // string[]
.option("-p, --port <n>", "Port", parseInt, 8080)         // number with default
```

### Standalone Usage

Types also work outside Commander for validating env vars, config files, etc. Import from `@silvery/commander/parse` for tree-shaking:

```typescript
import { port, csv } from "@silvery/commander/parse"

// .parse() -- returns value or throws
const dbPort = port.parse(process.env.DB_PORT ?? "5432")

// .safeParse() -- returns result object, never throws
const result = port.safeParse("abc")
// { success: false, issues: [{ message: 'Expected port (1-65535), got "abc"' }] }

// Standard Schema ~standard.validate() also available
const validated = port["~standard"].validate("8080")
// { value: 8080 }
```

## Parser Type Inference

When `.option()` is called with a parser function as the third argument, Commander infers the return type:

```typescript
const program = new Command("deploy")
  .option("-p, --port <n>", "Port", parseInt) // port: number
  .option("-t, --timeout <ms>", "Timeout", Number) // timeout: number
  .option("--tags <items>", "Tags", (v) => v.split(",")) // tags: string[]
```

Default values can be passed as the fourth argument:

```typescript
.option("-p, --port <n>", "Port", parseInt, 8080)  // port: number (defaults to 8080)
```

## Beyond extra-typings

Built on the shoulders of [@commander-js/extra-typings](https://github.com/commander-js/extra-typings). We add:

- **Auto-colorized help** -- semantic design tokens (primary commands, secondary flags, accent arguments)
- **Built-in validation** via [Standard Schema](https://github.com/standard-schema/standard-schema) -- works with [Zod](https://github.com/colinhacks/zod), [Valibot](https://github.com/fabian-hiller/valibot), [ArkType](https://github.com/arktypeio/arktype)
- **14 CLI types** -- `port`, `csv`, `int`, `url`, `email` and more, usable standalone via `.parse()`/`.safeParse()`
- **NO_COLOR support** via [`@silvery/ansi`](https://github.com/beorn/silvery/tree/main/packages/ansi) (optional)
- **Commander included** -- no separate install or peer setup for commander.js itself; zod is a required peer for the `z` types

If you're using `@commander-js/extra-typings` today, switching is a one-line import change.
