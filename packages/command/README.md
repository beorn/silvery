# @silvery/command

Serializable command metadata shared by terminal, web, CLI, RPC, MCP, test,
and application runtimes.

```ts
import { command, createCommandRegistry, defineCommands } from "@silvery/command"

const open = command<{ branch: string }>({
  title: "Open bay",
  metadata: { access: "write", visibility: "public" },
})

const commands = defineCommands({ bay: { open } })
const registry = createCommandRegistry(commands)

registry.operation(open, { branch: "main" })
// { op: "bay.open", args: { branch: "main" } }
```

The tree contains JSON data only. Runtime behavior, validation schemas,
availability functions, keybindings, CLI parsing, and surface projection live
in adapters such as `@silvery/commands` and `@silvery/commander`.

> Install from npm; a git install resolves the TypeScript source and runs only under Bun.

## API

- `command()` defines immutable command metadata and its phantom argument type.
- `defineCommands()` preserves the inferred type of a nested command tree.
- `createCommandRegistry()` indexes stable dotted paths and creates operations.
- `flattenCommandTree()` returns ordered `{ op, path, command }` entries.
- `isCommand()` identifies command leaves without functions or symbol markers.
