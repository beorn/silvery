# DOM-like Render API Design

Design proposal for a simplified, DOM-inspired render API with nested mounting.

## Current Pain Points

### 1. Verbose setup for interactive apps (old Layer 0)

The `render.tsx` API requires manual Term creation and teardown:

```tsx
import { render, createTerm } from "inkx"

using term = createTerm()
const instance = await render(<App />, term, {
  exitOnCtrlC: true,
  mode: "fullscreen",
  alternateScreen: true,
})
await instance.waitUntilExit()
```

Three steps (create term, render, wait) for the most common case. The `using` keyword is required to ensure cleanup on exceptions, but it adds ceremony and only works with explicit block scoping.

### 2. Two divergent render APIs

inkx has two separate render implementations:

- **`render.tsx`** (old): `render(element, term?, options?)` -- async, returns `Instance` with `rerender/unmount/waitUntilExit`. Used by `storybook.tsx` and legacy apps.
- **`renderer.ts`** (new): `render(element, options?)` -- sync, returns `App` with locators, `press()`, `text`, `ansi`. Used by testing and the headless pipeline.

These have different return types (`Instance` vs `App`), different capabilities (only `App` has locators, only `Instance` has `pause/resume/flush`), and different initialization patterns (async with layout engine init vs sync requiring pre-initialized engine).

The runtime layers (`run()`, `createApp()`) add a third path that bypasses both render implementations, creating their own reconciler roots and render pipelines directly.

### 3. No nested mounting

There is no way to render independent sub-applications into regions of a parent layout. The bead proposal envisions:

```tsx
const layout = await render(term, <Layout />)
const header = await render(layout.locator('#header'), <StatusBar />)
const content = await render(layout.locator('#content'), <Board />)
```

Currently, composition only happens via React component nesting -- you cannot mount independent React trees into separate screen regions with their own lifecycle.

### 4. Inconsistent option passing

Options are spread across multiple layers:
- `createTerm()`: color detection, stdout/stdin
- `render()`: mode, alternateScreen, exitOnCtrlC, nonTTYMode, layoutEngine
- `createApp()`: cols, rows, alternateScreen, signal, plus arbitrary provider injection

There is no single place to configure an app's terminal environment.

## Proposed API

### Core: `inkx.render()` as universal entry point

Inspired by `ReactDOM.createRoot(container).render(<App />)`, but adapted for terminal UI where the "container" is an abstract render target (terminal, test buffer, or parent region).

```typescript
// === Types ===

interface InkxRoot {
  /** Re-render with a new element */
  render(element: ReactElement): void
  /** Unmount and clean up */
  unmount(): void
  /** Dispose (alias for unmount) -- enables `using` */
  [Symbol.dispose](): void
  /** Wait until the app exits */
  waitUntilExit(): Promise<void>

  // === App capabilities (unified from App + Instance) ===

  /** Full rendered text (no ANSI codes) */
  readonly text: string
  /** Full rendered text with ANSI styling */
  readonly ansi: string
  /** Get locator by testID attribute */
  getByTestId(id: string): AutoLocator
  /** Get locator by text content */
  getByText(text: string | RegExp): AutoLocator
  /** CSS-style selector */
  locator(selector: string): AutoLocator
  /** Send a key press */
  press(key: string): Promise<this>
  /** Render current buffer to PNG */
  screenshot(outputPath?: string): Promise<Buffer>

  // === Nested mounting ===

  /** Create a child root that renders into a region of this root */
  createRoot(locator: AutoLocator): InkxRoot
}

interface RootOptions {
  /** Terminal dimensions. Default: auto-detect from stdout */
  cols?: number
  rows?: number
  /** Render mode. Default: 'fullscreen' */
  mode?: "fullscreen" | "inline"
  /** Use alternate screen buffer. Default: true for fullscreen */
  alternateScreen?: boolean
  /** Enable exit on Ctrl+C. Default: true */
  exitOnCtrlC?: boolean
  /** Layout engine. Default: 'flexx' */
  layoutEngine?: "flexx" | "yoga"
  /** Abort signal for external cleanup */
  signal?: AbortSignal
}
```

### Usage patterns

#### Pattern 1: Simple interactive app

```tsx
import inkx from "inkx"

// Auto-creates term, enters alternate screen, handles cleanup
using root = await inkx.createRoot()
root.render(<App />)
await root.waitUntilExit()
```

Or the one-liner:

```tsx
await inkx.run(<App />)
```

#### Pattern 2: Static/headless render

```tsx
const root = inkx.createRoot({ cols: 80, rows: 24 })
root.render(<Summary stats={stats} />)
console.log(root.text)
root.unmount()
```

#### Pattern 3: Nested mounting

```tsx
using root = await inkx.createRoot()
root.render(<Layout />)

// Mount independent sub-trees into layout regions
const headerRoot = root.createRoot(root.locator("[data-slot='header']"))
headerRoot.render(<StatusBar />)

const contentRoot = root.createRoot(root.locator("[data-slot='content']"))
contentRoot.render(<Board />)

// Each root has independent lifecycle
headerRoot.unmount()
headerRoot.render(<DifferentStatusBar />)
```

#### Pattern 4: Testing (unchanged)

```tsx
import { createRenderer } from "inkx/testing"

const render = createRenderer({ cols: 80, rows: 24 })
const app = render(<Counter />)
expect(app.text).toContain("Count: 0")
await app.press("j")
```

The test renderer already has the right ergonomics. No changes needed -- it returns `App` which has locators, `press()`, `text`, etc.

### Comparison with DOM API

| DOM (React 18)                            | inkx (proposed)                          |
| ----------------------------------------- | ---------------------------------------- |
| `const root = createRoot(container)`       | `const root = await inkx.createRoot()`   |
| `root.render(<App />)`                    | `root.render(<App />)`                   |
| `root.unmount()`                          | `root.unmount()`                         |
| `createRoot(childDiv).render(<Sub />)`    | `root.createRoot(locator).render(<Sub />)` |
| `createPortal(children, container)`       | (nested root is the equivalent)          |

Key difference: DOM has a physical `container` (HTMLElement). inkx has an abstract render target -- either a terminal (the "document") or a region identified by an `AutoLocator`. The locator's `boundingBox()` defines the nested root's dimensions and position.

### Relation to existing layers

This proposal does **not** replace the runtime layers. Instead, it provides a better foundation for them:

| Layer | Current                             | Proposed                                  |
| ----- | ----------------------------------- | ----------------------------------------- |
| 0     | `render()` in `render.tsx` (old)    | `inkx.createRoot()` + `root.render()`     |
| 0     | `render()` in `renderer.ts` (test)  | unchanged -- already good ergonomics      |
| 1     | `createRuntime()`                   | unchanged -- low-level, max control       |
| 2     | `run()` (hooks)                     | `inkx.run()` wrapping `createRoot()`      |
| 3     | `createApp()` (Zustand)             | unchanged -- uses `createRoot()` internally |

The key insight is that `inkx.createRoot()` unifies the old `render.tsx` and `renderer.ts` behind a single interface (`InkxRoot`), while the runtime layers continue to provide their ergonomic patterns on top.

## Nested Mounting: How It Works

### Render region reservation

A parent component reserves space for a child root using a placeholder element:

```tsx
function Layout() {
  return (
    <Box flexDirection="column" height="100%">
      <Box testID="header" height={3} data-slot="header" />
      <Box testID="content" flexGrow={1} data-slot="content" />
    </Box>
  )
}
```

The placeholder Box participates in the parent's layout. Its `boundingBox()` defines the child root's render region.

### Independent reconciler roots

Each `createRoot(locator)` call creates:

1. A new React reconciler root (separate fiber tree)
2. A buffer region bounded by the locator's `boundingBox()`
3. Independent input routing (the child root captures events within its region)

The parent root's render pipeline composites child root buffers into the final output.

### Lifecycle

- Child roots are unmounted when the parent region changes (locator no longer resolves)
- Parent resize triggers child root resize (new `boundingBox()` dimensions)
- Each root has its own `waitUntilExit()` promise

### When to use nested mounting vs component composition

| Use Case                          | Approach              | Why                                        |
| --------------------------------- | --------------------- | ------------------------------------------ |
| UI sections of one app            | Component composition | Shared state, single reconciler, simpler   |
| Independent sub-applications      | Nested mounting       | Independent lifecycle, isolation, hot-swap  |
| Plugin/extension rendering        | Nested mounting       | Sandboxed React tree, crash isolation       |
| Dashboard with unrelated widgets  | Nested mounting       | Each widget manages own state independently |

## Migration Path

### Phase 1: Unified InkxRoot interface (non-breaking)

Add `inkx.createRoot()` as a new entry point alongside existing APIs. It wraps the existing `InkxInstance` internally but returns the unified `InkxRoot` interface. No existing code needs to change.

```typescript
// New entry point (src/inkx.ts)
export const inkx = {
  async createRoot(options?: RootOptions): Promise<InkxRoot> {
    // Internally: ensureLayoutEngine() + createTerm() + new InkxInstance()
    // Returns InkxRoot wrapping the instance + App capabilities
  },
  async run(element: ReactElement, options?: RootOptions): Promise<void> {
    using root = await inkx.createRoot(options)
    root.render(element)
    await root.waitUntilExit()
  },
}
```

### Phase 2: Merge App and Instance capabilities

The `InkxRoot` interface combines:
- From `Instance`: `rerender`, `unmount`, `waitUntilExit`, `clear`, `flush`, `pause`, `resume`
- From `App`: `text`, `ansi`, `press()`, `getByTestId()`, `locator()`, `screenshot()`

This eliminates the current split where production code gets `Instance` (no locators) and test code gets `App` (no pause/resume).

Implementation: `InkxRoot` wraps `InkxInstance` and delegates to a `buildApp()` internally for locator/text/screenshot functionality.

### Phase 3: Nested mounting

Add `createRoot(locator)` to `InkxRoot`. This requires:
- Buffer compositing: parent buffer reserves regions, child buffers render into them
- Input routing: parent dispatches input events to the child whose region contains the cursor
- Resize propagation: `boundingBox()` changes trigger child root resize

This is the most complex phase and can be deferred until the unified root is stable.

### Phase 4: Deprecate old render API

Once `inkx.createRoot()` is stable and the runtime layers use it internally:
- Deprecate `render()` from `render.tsx` (keep working, emit deprecation warning)
- `renderer.ts` render stays as-is (it is the headless/test path)
- Update CLAUDE.md and docs to show `inkx.createRoot()` as the primary API

## Implementation Notes

### InkxRoot internal structure

```typescript
class InkxRootImpl implements InkxRoot {
  private instance: InkxInstance      // Terminal management, lifecycle
  private app: App                     // Locators, text, buffer access
  private children: Map<string, InkxRootImpl>  // Nested roots by locator selector

  render(element: ReactElement): void {
    this.instance.render(element)
    // After render, update App's container/buffer references
  }

  createRoot(locator: AutoLocator): InkxRoot {
    const bbox = locator.boundingBox()
    if (!bbox) throw new Error("Locator does not resolve to a visible element")
    // Create child instance with bounded dimensions
    const child = new InkxRootImpl({
      cols: bbox.width,
      rows: bbox.height,
      // No terminal -- renders into parent's buffer
      parentBuffer: this.app.term.buffer,
      parentOffset: { x: bbox.x, y: bbox.y },
    })
    this.children.set(locator.toString(), child)
    return child
  }
}
```

### Buffer compositing for nested roots

The parent's render pipeline needs a compositing step after its own output phase:

1. Parent renders its tree (including placeholder boxes)
2. For each child root, get its buffer
3. Blit child buffer into parent buffer at the locator's bounding box offset
4. Run the diff/output phase on the composited buffer

This is analogous to how windowing systems composite child windows into a parent frame buffer.

### Input routing for nested roots

When input arrives at the parent root:
1. Check if the "cursor" (or input focus) is within a child root's region
2. If yes, dispatch to the child root's input system
3. If no, handle normally in the parent

For keyboard-driven TUIs (no mouse), input routing is simpler: the focused child root gets all keyboard input until focus returns to the parent.

### Synchronization

Child roots render independently but composite synchronously with the parent. The parent's render scheduler:
1. Detects when any child root's buffer has changed (dirty flag)
2. Re-composites and outputs the combined frame
3. Uses synchronized rendering (DCS/SYNC sequences) to avoid tearing

## Open Questions

1. **Should nested roots share contexts?** The DOM model says no (separate React trees). But sharing `TermContext` makes sense since all roots share one terminal. Proposal: share `TermContext` and `InputLayerProvider`, isolate `AppContext` and `StoreContext`.

2. **How does focus transfer between nested roots?** Options: (a) explicit API (`parentRoot.focus(childRoot)`), (b) automatic based on Tab/Shift-Tab cycling, (c) delegated to application code via keybindings. Recommendation: (a) with (c) as the common pattern.

3. **Should `inkx.createRoot()` be sync or async?** It needs to init the layout engine (async). Options: (a) always async, (b) sync if engine already initialized, throw otherwise, (c) separate `await inkx.init()` then sync `createRoot()`. Recommendation: (a) for simplicity -- the one-time engine init cost is negligible.

4. **How to handle child root overflow?** If a child root's content exceeds its bounding box: (a) clip at boundary (like CSS `overflow: hidden`), (b) scroll within region, (c) error. Recommendation: (a) clip by default, (b) opt-in scroll via props.
