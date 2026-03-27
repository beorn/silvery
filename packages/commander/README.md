# @silvery/commander

Type-safe [Commander.js](https://github.com/tj/commander.js) with validated options, colorized help, and [Standard Schema](https://github.com/standard-schema/standard-schema) support. Drop-in replacement — `Command` extends Commander's `Command`. Install once, Commander is included.

```bash
npm install @silvery/commander
```

## Example

```typescript
import { Command, z } from "@silvery/commander"

const program = new Command("deploy")
  .description("Deploy to an environment")
  .version("1.0.0")
  .option("-e, --env <env>",     "Target environment", z.enum(["dev", "staging", "prod"]))
  .option("-p, --port <n>",      "Port number",        z.port)
  .option("-r, --retries <n>",   "Retry count",        z.int)
  .option("--tags <t>",          "Labels",             z.csv)
  .option("-f, --force",         "Skip confirmation")

program.parse()
const { env, port, retries, tags, force } = program.opts()
//      │      │     │         │      └─ boolean | undefined
//      │      │     │         └──────── string[]
//      │      │     └────────────────── number
//      │      └──────────────────────── number (1–65535)
//      └─────────────────────────────── "dev" | "staging" | "prod"
```

With plain Commander, `opts()` returns `Record<string, any>` — every value is untyped. With `@silvery/commander`, each option's type is inferred from its schema: `z.port` produces `number`, `z.enum(...)` produces a union, `z.csv` produces `string[]`. Invalid values are rejected at parse time with clear error messages — not silently passed through as strings.

[Zod](https://github.com/colinhacks/zod) is entirely optional — `z` is tree-shaken from your bundle if you don't import it. Without Zod, use the built-in types (`port`, `int`, `csv`) or plain Commander.

```ansi
$ deploy --help

[1mUsage:[0m [36mdeploy[0m [32m[options][0m

Deploy to an environment

[1mOptions:[0m
  [32m-V, --version[0m      [2moutput the version number[0m
  [32m-e, --env <env>[0m    [2mTarget environment[0m
  [32m-p, --port <n>[0m     [2mPort number[0m
  [32m-r, --retries <n>[0m  [2mRetry count[0m
  [32m--tags <t>[0m         [2mLabels[0m
  [32m-f, --force[0m        [2mSkip confirmation[0m
  [32m-h, --help[0m         [2mdisplay help for command[0m
```

Help is auto-colorized — bold headings, green flags, cyan commands, dim descriptions. Options with [Zod](https://github.com/colinhacks/zod) schemas or built-in types are validated at parse time with clear error messages.

## What's included

- **Colorized help** — automatic, with color level detection and [`NO_COLOR`](https://no-color.org)/`FORCE_COLOR` support via [`@silvery/ansi`](https://github.com/beorn/silvery/tree/main/packages/ansi) (optional)
- **Typed `.option()` parsing** — pass a type as the third argument:
  - 14 built-in types — `port`, `int`, `csv`, `url`, `email`, `date`, [more](https://silvery.dev/reference/commander)
  - Array choices — `["dev", "staging", "prod"]`
  - [Zod](https://github.com/colinhacks/zod) schemas — `z.port`, `z.int`, `z.csv`, or any custom `z.string()`, `z.number()`, etc.
  - Any [Standard Schema](https://github.com/standard-schema/standard-schema) library — [Valibot](https://github.com/fabian-hiller/valibot), [ArkType](https://github.com/arktypeio/arktype)
  - All types usable standalone via `.parse()`/`.safeParse()`

## Docs

Full reference, type table, and API details at **[silvery.dev/reference/commander](https://silvery.dev/reference/commander)**.

## Credits

- **[Commander.js](https://github.com/tj/commander.js)** by TJ Holowaychuk and contributors
- **[@commander-js/extra-typings](https://github.com/commander-js/extra-typings)** — inspired the type inference approach
- **[Standard Schema](https://github.com/standard-schema/standard-schema)** — universal schema interop protocol
- **[@silvery/ansi](https://github.com/beorn/silvery/tree/main/packages/ansi)** — terminal capability detection

## License

MIT
