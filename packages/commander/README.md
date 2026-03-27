# @silvery/commander

Type-safe, colorized [Commander.js](https://github.com/tj/commander.js) wrapper. Infers option types from `.option()` calls using TypeScript 5.4+ const type parameters and template literal types -- no codegen, no separate type package.

## Usage

```typescript
import { createCLI } from "@silvery/commander"

const cli = createCLI("myapp")
  .description("My CLI tool")
  .version("1.0.0")
  .option("-v, --verbose", "Verbose output")
  .option("-p, --port <number>", "Port to listen on", parseInt)
  .option("-o, --output [path]", "Output path")
  .option("--no-color", "Disable color output")

cli.parse()
const { verbose, port, output, color } = cli.opts()
//      ^boolean   ^number  ^string|true  ^boolean
```

Help output is automatically colorized using Commander's built-in `configureHelp()` style hooks (headings bold, flags green, commands cyan, descriptions dim, arguments yellow).

You can also use `colorizeHelp()` standalone with a plain Commander `Command`:

```typescript
import { Command } from "commander"
import { colorizeHelp } from "@silvery/commander"

const program = new Command("myapp").description("My CLI tool")
colorizeHelp(program) // applies recursively to all subcommands
```

## Presets

Pre-built validators for common CLI argument patterns. Each preset implements [Standard Schema v1](https://github.com/standard-schema/standard-schema) and works with Commander's `.option()` or standalone.

```typescript
import { createCLI, port, csv, int, url, oneOf } from "@silvery/commander"

const cli = createCLI("deploy")
  .option("-p, --port <n>", "Port", port)           // number (1-65535, validated)
  .option("-r, --retries <n>", "Retries", int)      // number (integer)
  .option("--tags <t>", "Tags", csv)                // string[]
  .option("--callback <url>", "Callback", url)      // string (validated URL)
  .option("-e, --env <e>", "Env", oneOf(["dev", "staging", "prod"]))  // "dev" | "staging" | "prod"
```

### Standalone usage

Presets also work outside Commander for validating env vars, config files, etc. Import from the `@silvery/commander/parse` subpath for tree-shaking:

```typescript
import { port, csv, oneOf } from "@silvery/commander/parse"

// .parse() — returns value or throws
const dbPort = port.parse(process.env.DB_PORT ?? "5432")  // 3000

// .safeParse() — returns result object, never throws
const result = port.safeParse("abc")
// { success: false, issues: [{ message: 'Expected port (1-65535), got "abc"' }] }

// Standard Schema ~standard.validate() also available
const validated = port["~standard"].validate("8080")
// { value: 8080 }
```

### Available presets

| Preset | Type | Validation |
| ------ | ---- | ---------- |
| `int` | `number` | Integer (coerced from string) |
| `uint` | `number` | Unsigned integer (>= 0) |
| `float` | `number` | Any finite number (rejects NaN) |
| `port` | `number` | Integer 1-65535 |
| `url` | `string` | Valid URL (via `URL` constructor) |
| `path` | `string` | Non-empty string |
| `csv` | `string[]` | Comma-separated, trimmed, empty filtered |
| `json` | `unknown` | Parsed JSON |
| `bool` | `boolean` | true/false/yes/no/1/0 (case-insensitive) |
| `date` | `Date` | Valid date string |
| `email` | `string` | Basic email validation (has @ and .) |
| `regex` | `RegExp` | Valid regex pattern |

### Factory presets

```typescript
import { intRange, oneOf } from "@silvery/commander"

intRange(1, 100)       // Preset<number> — integer within bounds
oneOf(["a", "b", "c"]) // Preset<"a" | "b" | "c"> — enum from values
```

## Custom parser type inference

When `.option()` is called with a parser function as the third argument, the return type is inferred:

```typescript
const cli = createCLI("deploy")
  .option("-p, --port <n>", "Port", parseInt) // → port: number
  .option("-t, --timeout <ms>", "Timeout", Number) // → timeout: number
  .option("--tags <items>", "Tags", (v) => v.split(",")) // → tags: string[]
```

Default values can be passed as the fourth argument:

```typescript
.option("-p, --port <n>", "Port", parseInt, 8080) // → port: number (defaults to 8080)
```

## Standard Schema validation

Pass any [Standard Schema v1](https://github.com/standard-schema/standard-schema) compatible schema as the third argument for combined parsing, validation, and type inference. This works with Zod (>=3.24), Valibot (>=1.0), ArkType (>=2.0), and any other library implementing the standard:

```typescript
import { z } from "zod"

const cli = createCLI("deploy")
  .option("-p, --port <n>", "Port", z.coerce.number().min(1).max(65535))
  // → port: number (validated at parse time)

  .option("-e, --env <env>", "Environment", z.enum(["dev", "staging", "prod"]))
  // → env: "dev" | "staging" | "prod" (union type)

  .option(
    "--tags <t>",
    "Tags",
    z.string().transform((v) => v.split(",")),
  )
// → tags: string[] (transformed)
```

Schema libraries are optional peer dependencies -- detected at runtime via the Standard Schema `~standard` interface, never imported at the top level. A legacy fallback supports older Zod versions (pre-3.24) that don't implement Standard Schema yet.

## Typed action handlers

Action callbacks receive typed arguments and options:

```typescript
const cli = createCLI("deploy")
  .argument("<env>", "Target environment")
  .argument("[tag]", "Optional deploy tag")
  .option("-f, --force", "Force deploy")
  .action((env, tag, opts) => {
    // env: string, tag: string | undefined, opts: { force: boolean | undefined }
  })
```

Required arguments (`<name>`) are `string`, optional arguments (`[name]`) are `string | undefined`.

## Choices narrowing

Use `.optionWithChoices()` to restrict an option to a fixed set of values with union type inference:

```typescript
const cli = createCLI("deploy").optionWithChoices("-e, --env <env>", "Environment", ["dev", "staging", "prod"] as const)
// → env: "dev" | "staging" | "prod" | undefined

cli.parse()
const { env } = cli.opts() // env: "dev" | "staging" | "prod" | undefined
```

Commander validates the choice at parse time and rejects invalid values.

## Environment variable support

Chain `.env()` to set an environment variable fallback for the last-added option:

```typescript
.option("-p, --port <n>", "Port").env("PORT")
```

## Improvements over @commander-js/extra-typings

| Feature                | extra-typings                                       | @silvery/commander                                              |
| ---------------------- | --------------------------------------------------- | --------------------------------------------------------------- |
| Type inference         | 1536-line .d.ts with recursive generic accumulation | ~120 lines using TS 5.4+ const type params + template literals  |
| Custom parser types    | Yes (.option with parseFloat -> number)             | Yes (parser return type inference)                              |
| Standard Schema        | No                                                  | Yes (Zod, Valibot, ArkType, or any Standard Schema v1 library) |
| Built-in presets       | No                                                  | Yes (port, int, csv, url, oneOf, etc.)                          |
| Typed action handlers  | Yes (full signature inference)                      | Yes (arguments + options)                                       |
| Choices narrowing      | Via .addOption()                                    | Via .optionWithChoices()                                        |
| Colorized help         | Not included                                        | Built-in via Commander's native style hooks                     |
| Package size           | Types only (25 lines runtime)                       | Types + colorizer + schemas (~500 lines, zero required deps)    |
| Installation           | Separate package alongside commander                | Single package, re-exports Commander                            |
| Negated flags (--no-X) | Partial                                             | Key extraction + boolean type inference                         |

## Credits

- [Commander.js](https://github.com/tj/commander.js) by TJ Holowaychuk and contributors -- the underlying CLI framework
- [@commander-js/extra-typings](https://github.com/commander-js/extra-typings) -- inspired the type inference approach; our implementation uses modern TypeScript features (const type parameters, template literal types) to achieve similar results in fewer lines
- [Standard Schema](https://github.com/standard-schema/standard-schema) -- universal schema interop protocol for type-safe validation
- [@silvery/ansi](https://github.com/beorn/silvery/tree/main/packages/ansi) -- optional ANSI color detection for respecting NO_COLOR/FORCE_COLOR/terminal capabilities
- Uses Commander's built-in `configureHelp()` style hooks (added in Commander 12) for colorization

## License

MIT
