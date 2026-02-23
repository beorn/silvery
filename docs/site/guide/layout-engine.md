# Layout Engine

inkx uses a pluggable layout engine architecture. It supports [Flexx](https://github.com/beorn/flexx) (pure JavaScript, recommended) and [Yoga](https://yogalayout.dev/) (Facebook's WASM-based flexbox implementation).

## Quick Start

For most apps, you don't need to configure anything. inkx auto-initializes the default layout engine when you call `render()`:

```tsx
import { render, Box, Text, createTerm } from "inkx"

// Layout engine is initialized automatically
using term = createTerm()
await render(<App />, term)
```

## Flexx (Recommended)

Flexx is a pure JavaScript layout engine with a Yoga-compatible API. It's the recommended choice because:

- **No WASM** - Works everywhere, no binary dependencies
- **Smaller bundle** - ~30KB vs ~170KB for Yoga
- **Synchronous initialization** - No async dance needed
- **Better for testing** - Deterministic, no platform-specific WASM behavior

### Explicit Flexx Setup

If you want to explicitly set up Flexx (not usually necessary):

```tsx
import { render, setLayoutEngine, createFlexxEngine, Box, Text } from "inkx"

// Initialize Flexx (synchronous - no await needed)
setLayoutEngine(createFlexxEngine())

// Now render uses Flexx for layout
using term = createTerm()
await render(<App />, term)
```

### Using renderSync with Flexx

Since Flexx doesn't require async initialization, you can use `renderSync()`:

```tsx
import { renderSync, setLayoutEngine, createFlexxEngine } from "inkx"

setLayoutEngine(createFlexxEngine())

// No await needed for renderSync
using term = createTerm()
const instance = renderSync(term, <App />)
```

## API Reference

### setLayoutEngine()

```ts
function setLayoutEngine(engine: LayoutEngine): void
```

Sets the global layout engine instance. Must be called before rendering if you want to use a non-default engine.

```tsx
import { setLayoutEngine, createFlexxEngine } from "inkx"

setLayoutEngine(createFlexxEngine())
```

### createYogaEngine()

```ts
function createYogaEngine(yoga: Yoga): YogaLayoutEngine
```

Creates a Yoga layout engine from an already-initialized Yoga instance. Use this when you've loaded Yoga yourself:

```tsx
import { setLayoutEngine, createYogaEngine } from "inkx"
import initYoga from "yoga-wasm-web"

const yoga = await initYoga()
setLayoutEngine(createYogaEngine(yoga))
```

### initYogaEngine()

```ts
function initYogaEngine(): Promise<YogaLayoutEngine>
```

Initializes Yoga using `yoga-wasm-web/auto` and returns a ready-to-use engine. This is what `render()` uses internally:

```tsx
import { setLayoutEngine, initYogaEngine } from "inkx"

const engine = await initYogaEngine()
setLayoutEngine(engine)
```

### createFlexxEngine()

```ts
function createFlexxEngine(): FlexxLayoutEngine
```

Creates a Flexx layout engine. Unlike Yoga, this is synchronous:

```tsx
import { setLayoutEngine, createFlexxEngine } from "inkx"

setLayoutEngine(createFlexxEngine())
```

### isLayoutEngineInitialized()

```ts
function isLayoutEngineInitialized(): boolean
```

Checks if a layout engine has been set:

```tsx
import { isLayoutEngineInitialized, setLayoutEngine, createFlexxEngine } from "inkx"

if (!isLayoutEngineInitialized()) {
  setLayoutEngine(createFlexxEngine())
}
```

## Engine Comparison

| Feature             | Yoga (WASM)              | Flexx (Pure JS)       |
| ------------------- | ------------------------ | --------------------- |
| Initialization      | Async (WASM loading)     | Sync                  |
| Performance         | Faster for large trees   | Good for small-medium |
| Bundle size         | ~170KB (WASM)            | ~30KB                 |
| Environment support | Needs WASM runtime       | Works everywhere      |
| Spec compliance     | Reference implementation | Yoga-compatible       |

### When to Use Yoga

- **Large layout trees** (100+ nodes) - WASM is faster for complex layouts
- **Precise flexbox behavior** - Yoga is the reference implementation
- **Production apps** - Battle-tested at Facebook scale

### When to Use Flexx

- **Quick prototypes** - No async initialization dance
- **Simple layouts** - Performance difference is negligible
- **WASM-restricted environments** - Some serverless/edge runtimes
- **Bundle size concerns** - Flexx is significantly smaller

## Performance Characteristics

### Layout Calculation

Both engines implement the same flexbox algorithm. The difference is in execution:

| Tree Size | Yoga   | Flexx  |
| --------- | ------ | ------ |
| 10 nodes  | ~0.1ms | ~0.2ms |
| 100 nodes | ~1ms   | ~3ms   |
| 500 nodes | ~5ms   | ~15ms  |

For typical TUI apps (10-50 nodes), both engines are effectively instant.

### Memory

- **Yoga**: Uses WASM linear memory, very efficient
- **Flexx**: Uses JavaScript objects, slightly higher GC pressure

## Custom Layout Engines

You can implement your own layout engine by satisfying the `LayoutEngine` interface:

```ts
interface LayoutEngine {
  /** Create a new layout node */
  createNode(): LayoutNode

  /** Layout constants for this engine */
  readonly constants: LayoutConstants

  /** Engine name for debugging */
  readonly name: string
}
```

### LayoutNode Interface

Each node must implement tree operations, property setters, and layout calculation:

```ts
interface LayoutNode {
  // Tree operations
  insertChild(child: LayoutNode, index: number): void
  removeChild(child: LayoutNode): void
  free(): void

  // Measure function for intrinsic sizing
  setMeasureFunc(measureFunc: MeasureFunc): void

  // Dimension setters
  setWidth(value: number): void
  setWidthPercent(value: number): void
  setWidthAuto(): void
  setHeight(value: number): void
  // ... (full interface has ~30 property setters)

  // Layout calculation
  calculateLayout(width: number, height: number, direction?: number): void

  // Layout results
  getComputedLeft(): number
  getComputedTop(): number
  getComputedWidth(): number
  getComputedHeight(): number
}
```

### LayoutConstants

Your engine must provide numeric constants for flexbox properties:

```ts
interface LayoutConstants {
  // Flex Direction
  FLEX_DIRECTION_COLUMN: number
  FLEX_DIRECTION_ROW: number
  // ... alignment, edges, display, etc.
}
```

See the [Flexx adapter source](https://github.com/beorn/inkx/blob/main/src/adapters/flexx-adapter.ts) for a complete example.

### Example: Minimal Custom Engine

```ts
import type { LayoutEngine, LayoutNode, LayoutConstants } from "inkx"

class SimpleNode implements LayoutNode {
  private width = 0
  private height = 0
  private children: SimpleNode[] = []

  insertChild(child: LayoutNode, index: number) {
    this.children.splice(index, 0, child as SimpleNode)
  }

  removeChild(child: LayoutNode) {
    const idx = this.children.indexOf(child as SimpleNode)
    if (idx !== -1) this.children.splice(idx, 1)
  }

  free() {
    this.children = []
  }

  setWidth(value: number) {
    this.width = value
  }

  // ... implement all required methods

  calculateLayout(width: number, height: number) {
    // Your layout algorithm here
  }

  getComputedWidth() {
    return this.width
  }

  // ... other getters
}

class SimpleEngine implements LayoutEngine {
  createNode(): LayoutNode {
    return new SimpleNode()
  }

  get constants(): LayoutConstants {
    return {
      FLEX_DIRECTION_COLUMN: 0,
      FLEX_DIRECTION_ROW: 1,
      // ... all required constants
    }
  }

  get name(): string {
    return "simple"
  }
}

// Use it
setLayoutEngine(new SimpleEngine())
```

## Troubleshooting

### "Layout engine not initialized"

This error means you called `renderSync()` without setting up an engine first:

```tsx
// Wrong - no engine set
using term = createTerm()
renderSync(term, <App />) // Error!

// Right - use async render (auto-initializes Yoga)
using term = createTerm()
await render(<App />, term)

// Right - manually set engine first
setLayoutEngine(createFlexxEngine())
using term = createTerm()
renderSync(term, <App />)
```

### WASM loading fails

If Yoga WASM fails to load, try Flexx as a fallback:

```tsx
import { render, setLayoutEngine, createFlexxEngine, isLayoutEngineInitialized } from "inkx"

using term = createTerm()

try {
  await render(<App />, term)
} catch (e) {
  if (!isLayoutEngineInitialized()) {
    console.warn("Falling back to Flexx engine")
    setLayoutEngine(createFlexxEngine())
    renderSync(term, <App />)
  } else {
    throw e
  }
}
```
