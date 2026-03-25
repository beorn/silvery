# @silvery/commands

Command registry, keymaps, and invocation for silvery apps.

Provides the infrastructure for keyboard-driven UIs: named commands with availability guards, context-dependent keybindings, and composable plugins.

Part of the [Silvery](https://silvery.dev) ecosystem.

## Install

```bash
npm install @silvery/commands
```

## Quick Start

```ts
import { createCommandRegistry, withCommands, withKeybindings } from "@silvery/commands"

const registry = createCommandRegistry({
  "file.save": { title: "Save File", run: (ctx) => save(ctx) },
  "file.open": { title: "Open File", run: (ctx) => open(ctx) },
})

// Compose as app plugins
const app = pipe(
  createApp(),
  withCommands({ registry }),
  withKeybindings({
    bindings: { "ctrl+s": "file.save", "ctrl+o": "file.open" },
  }),
)
```

## API

### Core

- **`createCommandRegistry(defs)`** -- Create a registry from command definitions
- **`parseHotkey(str)`** -- Parse a hotkey string (e.g. `"ctrl+shift+s"`) into a key descriptor

### Plugins

- **`withCommands(opts)`** -- App plugin that adds command execution to your app
- **`withKeybindings(opts)`** -- App plugin that maps key sequences to commands

### Types

`CommandDef`, `CommandDefInput`, `CommandDefs`, `CommandRegistryLike`, `AppWithCommands`, `WithCommandsOptions`, `WithKeybindingsOptions`

## License

MIT
