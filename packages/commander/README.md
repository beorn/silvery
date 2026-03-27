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
```

```
$ deploy --help

Usage: deploy [options]

Deploy to an environment

Options:
  -V, --version      output the version number
  -e, --env <env>    Target environment (choices: "dev", "staging", "prod")
  -p, --port <n>     Port number
  -r, --retries <n>  Retry count
  --tags <t>         Labels
  -f, --force        Skip confirmation
  -h, --help         display help for command
```

Help is auto-colorized — bold headings, green flags, cyan commands, dim descriptions. Every option with a [Zod](https://github.com/colinhacks/zod) schema or built-in type is validated at parse time with clear error messages.

## What's included

- **Colorized help** — automatic, no config needed
- **Typed `.option()` parsing** — 14 built-in types (`port`, `int`, `csv`, `url`, `email`, `date`, [more](https://silvery.dev/reference/commander)), array choices (`["dev", "staging", "prod"]`), [Zod](https://github.com/colinhacks/zod) schemas (`z.port`, `z.int`, `z.csv`), or any [Standard Schema](https://github.com/standard-schema/standard-schema) library
- **Standalone validators** — `import { port } from "@silvery/commander/parse"` with `.parse()`/`.safeParse()`
- **NO_COLOR support** via [`@silvery/ansi`](https://github.com/beorn/silvery/tree/main/packages/ansi) (optional)

## Docs

Full reference, type table, and API details at **[silvery.dev/reference/commander](https://silvery.dev/reference/commander)**.

## Credits

- **[Commander.js](https://github.com/tj/commander.js)** by TJ Holowaychuk and contributors
- **[@commander-js/extra-typings](https://github.com/commander-js/extra-typings)** — inspired the type inference approach
- **[Standard Schema](https://github.com/standard-schema/standard-schema)** — universal schema interop protocol
- **[@silvery/ansi](https://github.com/beorn/silvery/tree/main/packages/ansi)** — terminal capability detection

## License

MIT
