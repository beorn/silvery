# @silvery/commander

Type-safe, colorized [Commander.js](https://github.com/tj/commander.js) wrapper. Infers option types from `.option()` calls using TypeScript 5.4+ const type parameters and template literal types — no codegen, no separate type package.

## Usage

```typescript
import { createCLI } from "@silvery/commander"

const cli = createCLI("myapp")
  .description("My CLI tool")
  .version("1.0.0")
  .option("-v, --verbose", "Verbose output")
  .option("-p, --port <number>", "Port to listen on")
  .option("-o, --output [path]", "Output path")
  .option("--no-color", "Disable color output")

cli.parse()
const { verbose, port, output, color } = cli.opts()
//      ^boolean   ^string  ^string|true  ^boolean
```

Help output is automatically colorized using Commander's built-in `configureHelp()` style hooks (headings bold, flags green, commands cyan, descriptions dim, arguments yellow).

You can also use `colorizeHelp()` standalone with a plain Commander `Command`:

```typescript
import { Command } from "commander"
import { colorizeHelp } from "@silvery/commander"

const program = new Command("myapp").description("My CLI tool")
colorizeHelp(program) // applies recursively to all subcommands
```

## Improvements over @commander-js/extra-typings

| Feature | extra-typings | @silvery/commander |
|---|---|---|
| Type inference | 1536-line .d.ts with recursive generic accumulation | ~60 lines using TS 5.4+ const type params + template literals |
| Colorized help | Not included | Built-in via Commander's native style hooks |
| Package size | Types only (25 lines runtime) | Types + colorizer (~200 lines, zero deps) |
| Installation | Separate package alongside commander | Single package, re-exports Commander |
| React dependency | None | None |
| Negated flags (--no-X) | Partial | Key extraction + boolean type inference |
| Typed action handlers | Yes (full signature inference) | Not yet (planned) |
| Custom parser types | Yes (.option with parseFloat -> number) | Not yet (planned) |

## What's planned

- Custom parser function type inference (`.option("-p, --port <n>", "Port", parseInt)` -> `number`)
- Typed action handler signatures
- `.choices()` narrowing to union types

## Credits

- **Commander.js** by TJ Holowaychuk and contributors -- the underlying CLI framework
- **@commander-js/extra-typings** -- inspired the type inference approach; our implementation uses modern TypeScript features (const type parameters, template literal types) to achieve similar results in fewer lines
- Uses Commander's built-in `configureHelp()` style hooks (added in Commander 12) for colorization

## License

MIT
