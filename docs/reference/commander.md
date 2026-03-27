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

## Three Usage Patterns

```typescript
// 1. Enhanced Commander (auto-colorized help, Standard Schema, array choices)
import { Command, port, csv } from "@silvery/commander"

// 2. Standalone types (zero-dep, Standard Schema, no Commander)
import { port, csv, int } from "@silvery/commander/parse"

// 3. Zod + CLI types (batteries included)
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

Help output is automatically colorized using Commander's built-in `configureHelp()` style hooks -- headings bold, flags green, commands cyan, descriptions dim, arguments yellow.

## `colorizeHelp()`

Apply colorized help to a plain Commander `Command`:

```typescript
import { Command } from "commander"
import { colorizeHelp } from "@silvery/commander"

const program = new Command("myapp").description("My CLI tool")
colorizeHelp(program) // applies recursively to all subcommands
```

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

Schema libraries are optional peer dependencies -- detected at runtime via the Standard Schema `~standard` interface, never imported at the top level.

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

The `z` export is tree-shakeable -- if you don't import it, Zod won't be in your bundle.

Available `z` CLI types: `z.port`, `z.int`, `z.uint`, `z.float`, `z.csv`, `z.url`, `z.path`, `z.email`, `z.date`, `z.json`, `z.bool`, `z.intRange(min, max)`.

## Complete Type Reference

### Built-in types (zero dependencies)

Import from `@silvery/commander` or `@silvery/commander/parse`. Each implements [Standard Schema v1](https://github.com/standard-schema/standard-schema) with `.parse()` and `.safeParse()`.

| Type | Output | Validation | Example input |
|------|--------|------------|---------------|
| `int` | `number` | Integer (coerced from string) | `"42"` → `42` |
| `uint` | `number` | Unsigned integer (>= 0) | `"0"` → `0` |
| `float` | `number` | Any finite number (rejects NaN) | `"3.14"` → `3.14` |
| `port` | `number` | Integer 1–65535 | `"3000"` → `3000` |
| `url` | `string` | Valid URL | `"https://example.com"` |
| `path` | `string` | Non-empty string | `"./output"` |
| `csv` | `string[]` | Comma-separated, trimmed | `"a, b, c"` → `["a","b","c"]` |
| `json` | `unknown` | Parsed JSON | `'{"a":1}'` → `{a: 1}` |
| `bool` | `boolean` | true/false/yes/no/1/0 | `"yes"` → `true` |
| `date` | `Date` | Valid date string | `"2026-03-26"` → `Date` |
| `email` | `string` | Basic email format | `"a@b.com"` |
| `regex` | `RegExp` | Valid regex pattern | `"\\d+"` → `/\d+/` |
| `intRange(min, max)` | `number` | Integer within bounds | `intRange(1, 100)` |
| `["a", "b", "c"]` | `"a" \| "b" \| "c"` | Exact string match | Array passed to `.option()` |

### Zod types (requires `zod` peer dep)

Import `z` from `@silvery/commander` — it's [Zod](https://github.com/colinhacks/zod) extended with CLI-specific schemas. Tree-shakeable — Zod only loads if you import `z`.

| Type | Zod equivalent | Example |
|------|---------------|---------|
| `z.port` | `z.coerce.number().int().min(1).max(65535)` | Port number |
| `z.int` | `z.coerce.number().int()` | Integer |
| `z.uint` | `z.coerce.number().int().min(0)` | Unsigned integer |
| `z.float` | `z.coerce.number()` | Float |
| `z.csv` | `z.string().transform(v => v.split(","))` | Comma-separated |
| `z.url` | `z.string().url()` | URL |
| `z.path` | `z.string().min(1)` | File path |
| `z.email` | `z.string().email()` | Email |
| `z.date` | `z.coerce.date()` | Date |
| `z.json` | `z.string().transform(JSON.parse)` | JSON |
| `z.bool` | `z.enum([...]).transform(...)` | Boolean string |
| `z.intRange(min, max)` | `z.coerce.number().int().min(min).max(max)` | Bounded integer |

Plus the full Zod API — `z.string()`, `z.number()`, `z.enum()`, `z.object()`, `.refine()`, `.transform()`, `.pipe()`, etc.

### Standard Schema (any schema library)

Any [Standard Schema v1](https://github.com/standard-schema/standard-schema) object works as an option type — [Zod](https://github.com/colinhacks/zod) (>=3.24), [Valibot](https://github.com/fabian-hiller/valibot) (>=1.0), [ArkType](https://github.com/arktypeio/arktype) (>=2.0):

```typescript
// Valibot
import * as v from "valibot"
.option("-p, --port <n>", "Port", v.pipe(v.string(), v.transform(Number), v.minValue(1)))

// ArkType
import { type } from "arktype"
.option("-p, --port <n>", "Port", type("1 <= integer <= 65535"))
```

### Function parsers (Commander built-in)

[Commander's](https://github.com/tj/commander.js) standard parser function pattern:

```typescript
.option("-p, --port <n>", "Port", parseInt)              // number
.option("--tags <t>", "Tags", v => v.split(","))          // string[]
.option("-p, --port <n>", "Port", parseInt, 8080)         // number with default
```

### Array Choices

Pass an array as the third argument to restrict an option to a fixed set of values:

```typescript
.option("-e, --env <e>", "Env", ["dev", "staging", "prod"])
```

Commander validates the choice at parse time and rejects invalid values.

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

- **Auto-colorized help** -- bold headings, green flags, cyan commands
- **Built-in validation** via [Standard Schema](https://github.com/standard-schema/standard-schema) -- works with [Zod](https://github.com/colinhacks/zod), [Valibot](https://github.com/fabian-hiller/valibot), [ArkType](https://github.com/arktypeio/arktype)
- **14 CLI types** -- `port`, `csv`, `int`, `url`, `email` and more, usable standalone via `.parse()`/`.safeParse()`
- **NO_COLOR support** via [`@silvery/ansi`](https://github.com/beorn/silvery/tree/main/packages/ansi) (optional)
- **Commander included** -- one install, no peer dep setup

If you're using `@commander-js/extra-typings` today, switching is a one-line import change.
