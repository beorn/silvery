# @silvery/model

Optional dependency injection model factories for silvery apps.

Define named models with typed dependencies, register them in a registry, and let the registry handle instantiation and deduplication.

Part of the [Silvery](https://silvery.dev) ecosystem.

## Install

```bash
npm install @silvery/model
```

## Quick Start

```ts
import { defineModel, createModelRegistry } from "@silvery/model"

const todoModel = defineModel({
  name: "todo",
  create: () => ({
    items: [] as string[],
    add(text: string) {
      this.items.push(text)
    },
  }),
})

const registry = createModelRegistry()
const todos = registry.register(todoModel)
todos.add("Buy milk")
```

## API

### Factory

- **`defineModel(def)`** -- Define a model with a name, optional dependency list, and factory function
- **`createModelRegistry()`** -- Create a registry that instantiates and caches models

### ModelRegistry

- **`registry.register(def, deps?)`** -- Instantiate a model (returns cached instance if already registered)
- **`registry.get(name)`** -- Retrieve a registered model by name
- **`registry.has(name)`** -- Check if a model is registered
- **`registry.models`** -- The underlying `Map<string, unknown>`

### Types

`ModelDef<T, TDeps>`, `ModelRegistry`

## License

MIT
