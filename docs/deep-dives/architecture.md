# hightea Architecture

> **The core innovation isn't "terminal rendering" — it's two-phase rendering with synchronous layout feedback.**

This document describes hightea's higher-level architecture and identifies where its patterns can add value beyond terminals.

## The Core Innovation

hightea solves a universal problem across React renderers: **components can't know their size during render**.

| Problem                                | React DOM               | React Native      | hightea         |
| -------------------------------------- | ----------------------- | ----------------- | --------------- |
| Component knows its size during render | No                      | No                | **Yes**         |
| Layout-dependent content               | Effect + ResizeObserver | onLayout callback | **Synchronous** |
| Pluggable layout algorithm             | Browser only            | Yoga only         | **Any**         |

### Prior Art

This pattern has precedent:

- **WPF (Windows Presentation Foundation)**: Two-pass Measure/Arrange system since 2006
- **CSS Container Queries**: Browsers added containment APIs (2022+) to enable this pattern declaratively
- **Facebook's Litho/ComponentKit**: Off-main-thread layout calculation for mobile (~35% scroll improvement)

The existence of these solutions validates the need. hightea brings this pattern to React with a pluggable architecture.

## Layer Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         @hightea/core                                 │
│  ├── React reconciler (HighteaNode tree)                             │
│  ├── Layout engine interface (pluggable: Yoga, Flexture, custom)     │
│  ├── Two-phase pipeline (measure → layout → render)               │
│  ├── Hooks: useContentRect(), useScreenRect()                     │
│  └── Style system (merging, layering, category-based)             │
└────────────────────────────────────────────────────────────────────┘
                                ↓
                       RenderAdapter interface
                                ↓
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   @hightea/term    │  │  @hightea/canvas   │  │  @hightea/native   │
│   (current)     │  │   (future)      │  │   (future)      │
│                 │  │                 │  │                 │
│   Terminal      │  │   Canvas 2D     │  │   React Native  │
│   character     │  │   or WebGL      │  │   native views  │
│   grid          │  │   pixel buffer  │  │                 │
│                 │  │                 │  │                 │
│   ANSI output   │  │   Draw calls    │  │   Bridge calls  │
└─────────────────┴──┴─────────────────┴──┴─────────────────┘
```

### What's Portable (~60% of current codebase)

**@hightea/core** contains everything that doesn't depend on the render target:

1. **React Reconciler** - Custom host config that builds HighteaNode tree
2. **Layout Engine Abstraction** - Interface supporting Yoga, Flexture, or custom engines
3. **Two-Phase Pipeline Orchestration** - Measure → Layout → Content render sequence
4. **Layout Hooks** - `useContentRect()`, `useScreenRect()` implementation
5. **Style System** - Category-based merging (container, text, decorations, emphasis)

### What's Target-Specific

Each render adapter handles:

1. **Text Measurement** - How to measure text dimensions
2. **Buffer Management** - Creating and managing output buffers
3. **Content Writing** - Writing styled content to buffers
4. **Output Flushing** - Sending buffer to output (terminal, canvas, native view)
5. **Input Events** - Translating platform events to hightea events

## RenderAdapter Interface

**File:** `src/render-adapter.ts`

The abstraction boundary between core and targets:

```typescript
interface RenderAdapter {
  /** Adapter name for debugging */
  name: string

  /** Text measurement for this adapter */
  measurer: TextMeasurer

  /** Create a buffer for rendering */
  createBuffer(width: number, height: number): RenderBuffer

  /** Flush the buffer to output (returns ANSI string for terminal, void for canvas) */
  flush(buffer: RenderBuffer, prevBuffer: RenderBuffer | null): string | void

  /** Get border characters for the given style */
  getBorderChars(style: string): BorderChars
}

interface TextMeasurer {
  /** Measure text dimensions (cells for terminal, pixels for canvas) */
  measureText(text: string, style?: TextMeasureStyle): { width: number; height: number }

  /** Get line height for the given style */
  getLineHeight(style?: TextMeasureStyle): number
}

interface RenderBuffer {
  readonly width: number
  readonly height: number

  /** Fill a rectangle with a style */
  fillRect(x: number, y: number, width: number, height: number, style: RenderStyle): void

  /** Draw text at a position */
  drawText(x: number, y: number, text: string, style: RenderStyle): void

  /** Draw a single character at a position */
  drawChar(x: number, y: number, char: string, style: RenderStyle): void

  /** Check if coordinates are within bounds */
  inBounds(x: number, y: number): boolean
}
```

### Terminal Adapter

**File:** `src/adapters/terminal-adapter.ts`

```typescript
const terminalAdapter: RenderAdapter = {
  name: "terminal",
  measurer: {
    measureText: (text) => ({
      width: displayWidth(text), // Unicode-aware cell width
      height: 1, // Terminal: always 1 line per text segment
    }),
    getLineHeight: () => 1, // Terminal: 1 row = 1 line
  },

  createBuffer: (w, h) => new TerminalBuffer(w, h),

  flush: (buf, prev) => diffToAnsi(prev, buf),

  getBorderChars: (style) => BORDER_CHARS[style] ?? BORDER_CHARS.single,
}
```

### Canvas Adapter ✅ Implemented

**File:** `src/adapters/canvas-adapter.ts`

```typescript
import { createCanvasAdapter, renderToCanvas } from '@hightea/term/canvas';

// Create adapter with configuration
const adapter = createCanvasAdapter({
  fontSize: 14,
  fontFamily: 'monospace',
  lineHeight: 1.2,
});

// Or use the high-level API
const canvas = document.getElementById('canvas');
const instance = renderToCanvas(<App />, canvas, { fontSize: 14 });

// Update later
instance.rerender(<App newProps />);
instance.unmount();
```

### DOM Adapter ✅ Implemented

**File:** `src/adapters/dom-adapter.ts`

Advantages over Canvas:

- Native text selection and copying
- Screen reader accessibility
- Browser font rendering (subpixel antialiasing)
- CSS integration and DevTools inspection

```typescript
import { createDOMAdapter, renderToDOM } from '@hightea/term/dom';

// Line-based DOM rendering (following xterm.js pattern)
const container = document.getElementById('app');
const instance = renderToDOM(<App />, container, { fontSize: 14 });
```

### WebGL Adapter (Future)

Based on xterm.js research, WebGL provides ~900% performance improvement over Canvas.
Would follow the same `RenderAdapter` interface when implemented.

## The Two-Phase Pipeline

hightea's core innovation is separating **structure** from **content**:

```
Phase 0: RECONCILIATION
├── React reconciliation builds component tree
├── Components register content callbacks (not rendered content)
└── Output: Tree of HighteaNodes with layout nodes + callbacks

Phase 1: MEASURE (for fit-content nodes)
├── Traverse nodes with width="fit-content"
├── Call measureContent() to get intrinsic size
└── Output: Layout tree with all constraints set

Phase 2: LAYOUT
├── layoutEngine.calculateLayout(root, width, height)
├── Propagate computed dimensions to all nodes
├── Notify useContentRect() subscribers
└── Output: All nodes have computed { x, y, width, height }

Phase 3: CONTENT RENDER
├── For each node with contentCallback:
│   ├── Provide computed dimensions via context
│   └── Execute callback to produce content
├── Handle text truncation, scrolling, styling
└── Output: Platform-specific buffer (cells, pixels, etc.)

Phase 4: DIFF & OUTPUT
├── Compare buffer against previous frame
├── Emit minimal update (ANSI sequences, draw calls, etc.)
└── Output: Platform output
```

### Why This Works

The key insight is that **layout calculation is fast** (~1-2ms for 500+ nodes), while **content rendering is the expensive part**. By computing layout first, components can:

1. **Know their size** - `useContentRect()` returns actual dimensions
2. **Render efficiently** - Only visible content is rendered (scroll optimization)
3. **Avoid prop threading** - No manual width passing through component trees

## Infinite Loop Prevention

A critical design constraint: components that adjust their size based on `contentRect` could oscillate infinitely.

### The Problem

```tsx
// DANGER: This could loop forever
function BadComponent() {
  const { width } = useContentRect()
  const style = width > 50 ? { width: 40 } : { width: 60 }
  return (
    <Box {...style}>
      <Text>Content</Text>
    </Box>
  )
}
```

### Solution: Containment Rules

hightea follows similar principles to CSS Container Queries:

1. **Layout dimensions are read-only during render** - Components observe dimensions, they don't reactively resize based on them
2. **Content adapts to size, not vice versa** - Truncation, scrolling, responsive content selection
3. **Explicit breakpoints** - If responsive sizing is needed, use explicit breakpoints not continuous feedback

**Allowed patterns:**

```tsx
// OK: Content adapts to size
function Card() {
  const { width } = useContentRect()
  return <Text>{truncate(title, width)}</Text>
}

// OK: Conditional rendering based on size
function Sidebar() {
  const { width } = useContentRect()
  return width > 30 ? <FullNav /> : <IconNav />
}

// OK: Scroll position based on size
function List() {
  const { height } = useContentRect()
  const visibleCount = Math.floor(height / itemHeight)
  return <Items visible={visibleCount} />
}
```

**Disallowed patterns:**

```tsx
// BAD: Size depends on size
function Oscillating() {
  const { width } = useContentRect()
  return <Box width={width > 50 ? 40 : 60}>...</Box>
}
```

## Layout Engine Abstraction

hightea supports pluggable layout engines through a common interface:

```typescript
interface LayoutEngine {
  // Node management
  createNode(): LayoutNode
  freeNode(node: LayoutNode): void

  // Tree structure
  appendChild(parent: LayoutNode, child: LayoutNode): void
  removeChild(parent: LayoutNode, child: LayoutNode): void

  // Style application
  setStyle(node: LayoutNode, style: LayoutStyle): void

  // Layout calculation
  calculateLayout(root: LayoutNode, width: number, height: number): void

  // Result extraction
  getComputedLayout(node: LayoutNode): ComputedLayout
}

interface ComputedLayout {
  x: number
  y: number
  width: number
  height: number
}
```

### Current Engines

| Engine                 | Bundle Size | Speed       | Notes                         |
| ---------------------- | ----------- | ----------- | ----------------------------- |
| **Flexture** (default) | 7 KB gzip   | 2.5x faster | Pure JS, synchronous init     |
| **Yoga**               | 38 KB gzip  | Baseline    | WASM, async init, RTL support |

## Package Decomposition (Future)

The architecture supports splitting into separate packages:

```
@hightea/core          (~60% of code)
├── React reconciler
├── Layout engine interface
├── Two-phase pipeline
├── Hooks (useContentRect, etc.)
└── Style system

@hightea/term          (current, production)
├── TerminalBuffer (character cells)
├── ANSI code generation
├── Unicode/cell width handling
└── stdin event parsing

@hightea/canvas        (future)
├── Canvas 2D / WebGL buffer
├── Pixel-based text measurement
├── DOM event → hightea event translation
└── requestAnimationFrame integration

@hightea/native        (future, high value)
├── Integration with React Native's Yoga
├── Native text measurement
├── Touch event handling
└── Virtualization replacement
```

## Technical Risks

### 1. Infinite Loops

- **Risk**: Components adjusting size based on contentRect could oscillate
- **Mitigation**: Containment rules, similar to CSS Container Queries

### 2. Platform Consistency

- **Risk**: Text measurement differs across targets (terminal cells vs pixels vs points)
- **Mitigation**: Units are target-specific; core deals with abstract dimensions

### 3. Performance Overhead

- **Risk**: Extra JS layer vs native layout engines
- **Mitigation**: Layout is fast (~1-2ms); optimize content rendering

### 4. Concurrent React

- **Risk**: Must not violate render purity with side effects
- **Mitigation**: Dimensions provided via context, not direct mutation

### 5. Adapter Maintenance

- **Risk**: Each platform has quirks requiring ongoing work
- **Mitigation**: Well-defined interface boundary; platform experts own adapters

## See Also

- [design.md](../design/design.md) - Terminal implementation details
- [internals.md](internals.md) - React reconciler internals
- [roadmap.md](../roadmap.md) - Maximum roadmap for future targets
- [performance.md](performance.md) - Performance characteristics and optimization
