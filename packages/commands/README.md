# @silvery/commands

Command trees, keymaps, and invocation for silvery apps.

Provides the infrastructure for keyboard-driven UIs and future multi-surface command projection: typed command trees, named commands with availability guards, context-dependent keybindings, and composable plugins.

Part of the [Silvery](https://silvery.dev) ecosystem.

## Install

```bash
npm install @silvery/commands
```

## Quick Start

```ts
import { command, defineCommands, flattenCommandTree } from "@silvery/commands"

const commands = defineCommands({
  file: {
    save: command({
      title: "Save File",
      run: (ctx: AppContext) => save(ctx),
      metadata: { effects: "write", idempotent: true },
    }),
    open: command({
      title: "Open File",
      run: (ctx: AppContext, params: { path: string }) => open(ctx, params.path),
    }),
  },
})

// Stable ids for adapters: ["file.save", "file.open"]
const flat = flattenCommandTree(commands)
```

The tree is the domain model. Runtime apps can bind keybindings and command
palettes to the same command objects; CLI / MCP adapters can flatten the tree and
project the same identity to other surfaces.

The legacy flat registry API remains supported for existing callers:

```ts
import { createCommandRegistry } from "@silvery/commands"

const registry = createCommandRegistry({
  "file.save": { name: "Save File", execute: (ctx) => save(ctx) },
})
```

## API

### Core

- **`createCommandRegistry(defs)`** -- Create a registry from command definitions
- **`command(def)`** -- Mark a command node inside a command tree
- **`defineCommands(tree)`** -- Define a typed command tree
- **`flattenCommandTree(tree)`** -- Flatten a tree to dotted command ids for adapters
- **`resolveInvocation(command, ctx, params)`** -- Shared availability / params resolver
- **`parseHotkey(str)`** -- Parse a hotkey string (e.g. `"ctrl+shift+s"`) into a key descriptor

### Plugins

- **`withCommands(opts)`** -- App plugin that adds command execution to your app
- **`withKeybindings(opts)`** -- App plugin that maps key sequences to commands

### Types

`CommandNode`, `CommandTree`, `CommandMetadata`, `Invocation`, `ParamSchema`, `CommandDef`, `CommandDefInput`, `CommandDefs`, `CommandRegistryLike`, `AppWithCommands`, `WithCommandsOptions`, `WithKeybindingsOptions`

## License

MIT
