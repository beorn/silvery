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

[Zod](https://github.com/colinhacks/zod) is entirely optional — `z` is tree-shaken from your bundle if you don't import it. Without Zod, use the built-in types (`port`, `int`, `csv`) or plain Commander.

<pre><code>$ deploy --help

<b>Usage:</b> <span style="color:#5bc0de">deploy</span> <span style="color:#5cb85c">[options]</span>

Deploy to an environment

<b>Options:</b>
  <span style="color:#5cb85c">-V, --version</span>      <span style="color:#999">output the version number</span>
  <span style="color:#5cb85c">-e, --env &lt;env&gt;</span>    <span style="color:#999">Target environment</span>
  <span style="color:#5cb85c">-p, --port &lt;n&gt;</span>     <span style="color:#999">Port number</span>
  <span style="color:#5cb85c">-r, --retries &lt;n&gt;</span>  <span style="color:#999">Retry count</span>
  <span style="color:#5cb85c">--tags &lt;t&gt;</span>         <span style="color:#999">Labels</span>
  <span style="color:#5cb85c">-f, --force</span>        <span style="color:#999">Skip confirmation</span>
  <span style="color:#5cb85c">-h, --help</span>         <span style="color:#999">display help for command</span>
</code></pre>

Help is auto-colorized — bold headings, green flags, cyan commands, dim descriptions. Options with [Zod](https://github.com/colinhacks/zod) schemas or built-in types are validated at parse time with clear error messages.

## What's included

- **Colorized help** — automatic, respects `NO_COLOR`/`FORCE_COLOR` with [`@silvery/ansi`](https://github.com/beorn/silvery/tree/main/packages/ansi) (optional)
- **Typed `.option()` parsing** — 14 built-in types (`port`, `int`, `csv`, `url`, `email`, `date`, [more](https://silvery.dev/reference/commander)), array choices, [Zod](https://github.com/colinhacks/zod) schemas (`z.port`, `z.int`, `z.csv`), or any [Standard Schema](https://github.com/standard-schema/standard-schema) library — all usable standalone via `.parse()`/`.safeParse()`

## Docs

Full reference, type table, and API details at **[silvery.dev/reference/commander](https://silvery.dev/reference/commander)**.

## Credits

- **[Commander.js](https://github.com/tj/commander.js)** by TJ Holowaychuk and contributors
- **[@commander-js/extra-typings](https://github.com/commander-js/extra-typings)** — inspired the type inference approach
- **[Standard Schema](https://github.com/standard-schema/standard-schema)** — universal schema interop protocol
- **[@silvery/ansi](https://github.com/beorn/silvery/tree/main/packages/ansi)** — terminal capability detection

## License

MIT
