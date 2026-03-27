# @silvery/commander

Enhanced [Commander.js](https://github.com/tj/commander.js) with auto-colorized help, Standard Schema validation, and CLI presets. Drop-in replacement -- `Command` is a subclass of Commander's `Command`.

## Three layers

```typescript
// Layer 1: Enhanced Commander (auto-colorized help, Standard Schema support)
import { Command, port, csv } from "@silvery/commander"

// Layer 2: Zero-dep presets (Standard Schema, standalone use)
import { port, csv, int } from "@silvery/commander/parse"

// Layer 3: Zod + CLI presets (batteries included)
import { Command, z } from "@silvery/commander"
```

## Usage

```typescript
import { Command, port, csv, oneOf } from "@silvery/commander"

const program = new Command("deploy")
  .description("Deploy the application")
  .version("1.0.0")
  .option("-p, --port <n>", "Port", port) // number (1-65535)
  .option("--tags <t>", "Tags", csv) // string[]
  .option("-e, --env <e>", "Env", oneOf(["dev", "staging", "prod"]))

program.parse()
const opts = program.opts()
```

Help output is automatically colorized using Commander's built-in `configureHelp()` style hooks (headings bold, flags green, commands cyan, descriptions dim, arguments yellow).

You can also use `colorizeHelp()` standalone with a plain Commander `Command`:

```typescript
import { Command } from "commander"
import { colorizeHelp } from "@silvery/commander"

const program = new Command("myapp").description("My CLI tool")
colorizeHelp(program) // applies recursively to all subcommands
```

## Standard Schema validation

Pass any [Standard Schema v1](https://github.com/standard-schema/standard-schema) compatible schema as the third argument to `.option()` for combined parsing, validation, and type inference. This works with the built-in presets, Zod (>=3.24), Valibot (>=1.0), ArkType (>=2.0), and any other library implementing the standard:

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

Schema libraries are optional peer dependencies -- detected at runtime via the Standard Schema `~standard` interface, never imported at the top level. A legacy fallback supports older Zod versions (pre-3.24) that don't implement Standard Schema yet.

## Zod CLI presets

Import `z` from `@silvery/commander` for an extended Zod object with CLI-specific schemas:

```typescript
import { Command, z } from "@silvery/commander"

const program = new Command("deploy")
  .option("-p, --port <n>", "Port", z.port) // z.coerce.number().int().min(1).max(65535)
  .option("--tags <t>", "Tags", z.csv) // z.string().transform(...)
  .option("-e, --env <e>", "Env", z.oneOf(["dev", "staging", "prod"]))
  .option("-r, --retries <n>", "Retries", z.int) // z.coerce.number().int()
```

The `z` export is tree-shakeable -- if you don't import it, Zod won't be in your bundle.

Available `z` CLI presets: `z.port`, `z.int`, `z.uint`, `z.float`, `z.csv`, `z.url`, `z.path`, `z.email`, `z.date`, `z.json`, `z.bool`, `z.intRange(min, max)`, `z.oneOf(values)`.

## Presets

Pre-built validators for common CLI argument patterns. Each preset implements [Standard Schema v1](https://github.com/standard-schema/standard-schema) and works with Commander's `.option()` or standalone.

```typescript
import { Command, port, csv, int, url, oneOf } from "@silvery/commander"

const program = new Command("deploy")
  .option("-p, --port <n>", "Port", port) // number (1-65535, validated)
  .option("-r, --retries <n>", "Retries", int) // number (integer)
  .option("--tags <t>", "Tags", csv) // string[]
  .option("--callback <url>", "Callback", url) // string (validated URL)
  .option("-e, --env <e>", "Env", oneOf(["dev", "staging", "prod"]))
```

### Standalone usage

Presets also work outside Commander for validating env vars, config files, etc. Import from the `@silvery/commander/parse` subpath for tree-shaking:

```typescript
import { port, csv, oneOf } from "@silvery/commander/parse"

// .parse() — returns value or throws
const dbPort = port.parse(process.env.DB_PORT ?? "5432") // 3000

// .safeParse() — returns result object, never throws
const result = port.safeParse("abc")
// { success: false, issues: [{ message: 'Expected port (1-65535), got "abc"' }] }

// Standard Schema ~standard.validate() also available
const validated = port["~standard"].validate("8080")
// { value: 8080 }
```

### Available presets

| Preset  | Type       | Validation                               |
| ------- | ---------- | ---------------------------------------- |
| `int`   | `number`   | Integer (coerced from string)            |
| `uint`  | `number`   | Unsigned integer (>= 0)                  |
| `float` | `number`   | Any finite number (rejects NaN)          |
| `port`  | `number`   | Integer 1-65535                          |
| `url`   | `string`   | Valid URL (via `URL` constructor)        |
| `path`  | `string`   | Non-empty string                         |
| `csv`   | `string[]` | Comma-separated, trimmed, empty filtered |
| `json`  | `unknown`  | Parsed JSON                              |
| `bool`  | `boolean`  | true/false/yes/no/1/0 (case-insensitive) |
| `date`  | `Date`     | Valid date string                        |
| `email` | `string`   | Basic email validation (has @ and .)     |
| `regex` | `RegExp`   | Valid regex pattern                      |

### Factory presets

```typescript
import { intRange, oneOf } from "@silvery/commander"

intRange(1, 100) // Preset<number> — integer within bounds
oneOf(["a", "b", "c"]) // Preset<"a" | "b" | "c"> — enum from values
```

## Custom parser type inference

When `.option()` is called with a parser function as the third argument, Commander infers the return type:

```typescript
const program = new Command("deploy")
  .option("-p, --port <n>", "Port", parseInt) // port: number
  .option("-t, --timeout <ms>", "Timeout", Number) // timeout: number
  .option("--tags <items>", "Tags", (v) => v.split(",")) // tags: string[]
```

Default values can be passed as the fourth argument:

```typescript
.option("-p, --port <n>", "Port", parseInt, 8080) // port: number (defaults to 8080)
```

## Credits

- [Commander.js](https://github.com/tj/commander.js) by TJ Holowaychuk and contributors -- the underlying CLI framework
- [Standard Schema](https://github.com/standard-schema/standard-schema) -- universal schema interop protocol for type-safe validation
- [@silvery/ansi](https://github.com/beorn/silvery/tree/main/packages/ansi) -- optional ANSI color detection for respecting NO_COLOR/FORCE_COLOR/terminal capabilities
- Uses Commander's built-in `configureHelp()` style hooks (added in Commander 12) for colorization

## License

MIT
