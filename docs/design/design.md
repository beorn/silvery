# silvery: Next-Generation Terminal UI Renderer

> **Historical Document** — This was the original design RFC for silvery (early 2025).
> Many details (naming, layout engine, hook names) have changed since implementation.
> For current architecture, see [architecture.md](../deep-dives/architecture.md).
> For current API, use `useContentRect()` (not `useLayout()`).

> **Note**: For high-level architecture and future targets (Canvas, React Native), see [architecture.md](../deep-dives/architecture.md) and [roadmap.md](../roadmap.md). This document focuses on terminal-specific implementation details.

## Executive Summary

Ink's single-pass rendering architecture prevents components from knowing their computed size, forcing pervasive width-prop threading in every application. This document designs **silvery** - a terminal UI renderer that maintains Ink/Chalk API compatibility while solving the layout feedback problem through a two-phase render architecture.

**Key insight**: The fix isn't complex algorithms - it's exposing what Yoga already computes back to React components.

---

## 1. Problem Statement

### The Bug That Isn't a Bug

Ink Issue [#5](https://github.com/vadimdemedes/ink/issues/5) (opened 2016, still open):

> "Is there a way to know the width/height of a Box?"

This isn't a missing feature - it's a **fundamental architecture limitation**. Ink's render flow:

```
React render() → Build Yoga tree → Yoga computes layout → Write to terminal
                                         ↓
                              (dimensions computed here)
                                         ↓
                              (but never exposed to React)
```

### Concrete Impact on km

Our TUI has **147 lines** of constraint-threading code:

- `ConstraintContext` (30 lines)
- `useConstraint` hook usage (50+ instances)
- Manual `width` prop passing (100+ occurrences)

With proper layout feedback, this reduces to **zero**.

### Why Ink Cannot Fix This

Ink's `render` function is synchronous:

```typescript
// ink/src/render.ts (simplified)
function render(element) {
  const yogaNode = buildYogaTree(element)
  yogaNode.calculateLayout() // Dimensions computed here
  const output = renderToString(element) // But element already rendered!
  stdout.write(output)
}
```

The element renders _before_ layout is computed. Fixing this requires:

1. Render to collect constraints (not content)
2. Compute layout
3. Re-render with dimensions

This is a breaking API change. Ink's maintainer has shown no interest in major architecture changes.

---

## 2. Design Goals

### Must Have

1. **Ink API compatibility** - `<Box>`, `<Text>`, `render()`, `useInput()` work unchanged
2. **Chalk compatibility** - ANSI strings from Chalk just work
3. **Layout feedback** - Components can access their computed dimensions
4. **Auto-truncation** - Text truncates to available width by default

### Should Have

5. **Native scrolling** - `<Scroll>` component with overflow handling
6. **Content-aware sizing** - `width="fit-content"` for shrink-to-fit
7. **Better performance** - Incremental layout, smarter diffing

### Nice to Have

8. **Modern terminal features** - OSC 8 links, true color detection
9. **Mouse support** - Click handlers, hover states
10. **Image protocols** - Sixel, Kitty graphics

---

## 3. Architecture

### High-Level Flow (5 Phases)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Phase 0: RECONCILIATION                                             │
│                                                                      │
│  React reconciliation builds component tree                          │
│  Components register content callbacks (not rendered content)        │
│                                                                      │
│  Output: Tree of SilveryNodes with Yoga nodes + callbacks               │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Phase 1: MEASURE (for fit-content nodes)                            │
│                                                                      │
│  Traverse nodes with width="fit-content"                             │
│  Call measureContent() to get intrinsic size                         │
│  Set Yoga constraints based on measurement                           │
│                                                                      │
│  Output: Yoga tree with all constraints set                          │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Phase 2: LAYOUT                                                     │
│                                                                      │
│  yoga.calculateLayout(rootWidth, rootHeight)                         │
│  Propagate computed dimensions to all nodes                          │
│  Notify useLayout() subscribers (triggers selective re-render)       │
│                                                                      │
│  Output: All nodes have computed { x, y, width, height }             │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Phase 3: CONTENT RENDER                                             │
│                                                                      │
│  For each node with contentCallback:                                 │
│    - Provide computed dimensions via LayoutContext                   │
│    - Execute callback to produce terminal content                    │
│  Handle text truncation, scrolling, styling                          │
│                                                                      │
│  Output: Character buffer (2D array of styled cells)                 │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Phase 4: DIFF & OUTPUT                                              │
│                                                                      │
│  Compare buffer against previous frame                               │
│  Emit minimal ANSI sequences for changed cells                       │
│  Optimize cursor movement                                            │
│                                                                      │
│  Output: Terminal escape sequences                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Insight: Deferred Content Rendering

Unlike Ink (which renders content during React reconciliation), silvery separates:

- **Structure** (React reconciliation) - builds the layout tree
- **Content** (Phase 3) - renders text/graphics with known dimensions

This is why `useLayout()` works - dimensions are available BEFORE content renders.

### Key Innovation: Split Render

Components have two render modes:

```typescript
interface LayoutSpec {
  // Constraints (Phase 1)
  width?: number | string | "auto" | "fit-content"
  height?: number | string | "auto" | "fit-content"
  flex?: number
  flexDirection?: "row" | "column"
  // ... other flexbox props

  // Content renderer (Phase 3)
  render: (computed: ComputedLayout) => TerminalContent
}

interface ComputedLayout {
  width: number
  height: number
  x: number // Position relative to parent
  y: number
}
```

### Implementation: Custom React Renderer

```typescript
import Reconciler from 'react-reconciler';

interface SilveryNode {
  type: string;
  props: Record<string, unknown>;
  children: SilveryNode[];
  yogaNode: yoga.Node;
  computedLayout?: ComputedLayout;
}

const hostConfig: HostConfig<...> = {
  createInstance(type, props): SilveryNode {
    const yogaNode = yoga.Node.create();
    applyFlexboxProps(yogaNode, props);
    return { type, props, children: [], yogaNode };
  },

  appendChild(parent, child) {
    parent.children.push(child);
    parent.yogaNode.insertChild(child.yogaNode, parent.children.length - 1);
  },

  prepareForCommit(rootNode) {
    // Phase 2: Compute layout for entire tree
    rootNode.yogaNode.calculateLayout();
    propagateComputedLayout(rootNode);
  },

  commitMount(node) {
    // Phase 3: Now node.computedLayout is available
    // Render content into character buffer
  },
};

function propagateComputedLayout(node: SilveryNode, parentX = 0, parentY = 0) {
  const layout = node.yogaNode.getComputedLayout();
  node.computedLayout = {
    width: layout.width,
    height: layout.height,
    x: parentX + layout.left,
    y: parentY + layout.top,
  };
  for (const child of node.children) {
    propagateComputedLayout(child, node.computedLayout.x, node.computedLayout.y);
  }
}
```

### The useLayout Hook

**Important**: `useLayout()` works differently than you might expect:

1. On **first render** (before layout): returns `{ width: 0, height: 0, x: 0, y: 0 }`
2. After **layout completes**: automatically triggers re-render with actual dimensions
3. On **subsequent renders**: returns cached dimensions (no re-render unless dimensions change)

```typescript
const LayoutContext = createContext<ComputedLayout | null>(null);

function useLayout(): ComputedLayout {
  const node = useSilveryNode();
  const [, forceUpdate] = useReducer(x => x + 1, 0);

  // Subscribe to layout completion
  useLayoutEffect(() => {
    const unsubscribe = node.onLayoutComplete(() => {
      // Only re-render if dimensions actually changed
      if (dimensionsChanged(node.prevLayout, node.computedLayout)) {
        forceUpdate();
      }
    });
    return unsubscribe;
  }, [node]);

  // Return current dimensions (may be zeros on first render)
  return node.computedLayout ?? { width: 0, height: 0, x: 0, y: 0 };
}

// Usage - component handles the initial zero state gracefully
function Header() {
  const { width } = useLayout();
  // On first render, width=0, so this renders empty string
  // After layout, re-renders with actual width
  return <Text>{'='.repeat(width)}</Text>;
}
```

This is the key difference from Ink's `measureElement()`:

- Ink: You call `measureElement()`, get dimensions, manually trigger re-render
- silvery: `useLayout()` automatically re-renders when dimensions are ready

---

## 4. API Surface

### Fully Compatible (unchanged from Ink)

```typescript
// Components
<Box flexDirection="row" padding={1} borderStyle="single">
<Text color="green" bold>
<Newline />
<Spacer />

// Render
render(<App />);
render(<App />, { stdout, stdin });

// Hooks
useInput((input, key) => { ... });
useStdout();
useStdin();
useApp();  // { exit }
useFocusable();
useFocusWithin();
useFocusManager();
```

### Enhanced (backwards compatible additions)

```typescript
// Box gains onLayout callback (optional)
<Box onLayout={({ width, height }) => console.log(width, height)}>

// Text auto-truncates (opt out with wrap={false})
<Text>This long text truncates automatically...</Text>
<Text wrap={false}>This overflows if too long</Text>

// New width values
<Box width="fit-content">  // Shrink to content
<Box width="50%">          // Already supported
<Box width={30}>           // Already supported
```

### New Components

```typescript
// Scrollable container - see Section 8 for full details
// Just use overflow="scroll" on Box - no separate component needed
<Box overflow="scroll" scrollTo={selectedIdx}>
  {items.map(item => <Row key={item.id} item={item} />)}
</Box>

// Auto-sizing table
<Table
  columns={[
    { header: 'Name', key: 'name' },
    { header: 'Value', key: 'value', width: 20 },
  ]}
  data={rows}
/>
```

### New Hooks

```typescript
// The key addition
const { width, height, x, y } = useLayout()

// Terminal capabilities
const caps = useTerminalCapabilities()
// { trueColor: boolean, unicode: boolean, sixel: boolean, ... }

// Derived from useLayout
const { width } = useWidth() // Just the width
const { height } = useHeight() // Just the height
```

---

## 5. Chalk Compatibility

Chalk produces ANSI-escaped strings. Our renderer must:

1. **Preserve ANSI in text measurement** - Use `string-width` or similar
2. **Preserve ANSI in truncation** - Use `slice-ansi` for safe cutting
3. **Stack styles correctly** - Multiple nested `<Text>` with different styles

```typescript
import chalk from 'chalk';

// This must work exactly as in Ink
<Text>
  {chalk.red('Red ')}
  {chalk.blue.bold('Blue Bold')}
</Text>

// Truncation preserves styles
<Text>{chalk.red('This is a very long red text that will truncate...')}</Text>
// Output: "\x1b[31mThis is a very long red text that...\x1b[0m"
//         (ANSI codes preserved, text truncated)
```

---

## 6. Terminal Output Layer

### Cell-Based Buffer

```typescript
interface Cell {
  char: string // Single grapheme
  fg: Color | null // Foreground color
  bg: Color | null // Background color
  attrs: Set<Attr> // bold, italic, underline, etc.
}

type TerminalBuffer = Cell[][] // [y][x]

function diff(prev: TerminalBuffer, next: TerminalBuffer): string {
  let output = ""
  for (let y = 0; y < next.length; y++) {
    for (let x = 0; x < next[y].length; x++) {
      if (!cellEqual(prev[y]?.[x], next[y][x])) {
        output += moveCursor(x, y)
        output += renderCell(next[y][x])
      }
    }
  }
  return output
}
```

### Cursor Optimization

Naive diffing emits `\x1b[{y};{x}H` for every changed cell. Optimize:

```typescript
function optimizeCursorMoves(changes: CellChange[]): string {
  // Sort by position
  changes.sort((a, b) => a.y - b.y || a.x - b.x)

  let output = ""
  let cursorX = 0,
    cursorY = 0

  for (const { x, y, cell } of changes) {
    if (y === cursorY && x === cursorX) {
      // Already at position, just write
    } else if (y === cursorY && x === cursorX + 1) {
      // Adjacent, no move needed (cursor advances after write)
    } else if (y === cursorY + 1 && x === 0) {
      output += "\n" // Newline cheaper than absolute move
    } else {
      output += moveCursor(x, y)
    }
    output += renderCell(cell)
    cursorX = x + 1
    cursorY = y
  }

  return output
}
```

### Unicode Handling

Terminal cells have complex Unicode requirements:

```typescript
interface Cell {
  char: string;          // Single grapheme cluster
  fg: Color | null;
  bg: Color | null;
  attrs: Set<Attr>;
  wide: boolean;         // Is this a wide character (CJK)?
  continuation: boolean; // Is this the 2nd cell of a wide char?
}

// Use Intl.Segmenter for proper Unicode segmentation
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function textToCells(text: string): Cell[] {
  const graphemes = [...segmenter.segment(text)].map(s => s.segment);
  const cells: Cell[] = [];

  for (const grapheme of graphemes) {
    const width = getCharWidth(grapheme); // 1 or 2
    cells.push({ char: grapheme, wide: width === 2, continuation: false, ... });
    if (width === 2) {
      cells.push({ char: '', wide: false, continuation: true, ... });
    }
  }
  return cells;
}
```

### Performance Optimizations

**Dirty Tracking**: Not every state change needs full re-layout.

```typescript
interface SilveryNode {
  layoutDirty: boolean // Structure changed, needs re-layout
  contentDirty: boolean // Content changed, layout unchanged
}

// On state change:
// - If only content changed: skip Phases 0-2, go straight to Phase 3
// - If layout changed: full pipeline
```

**Frame Coalescing**: Batch rapid updates.

```typescript
class RenderScheduler {
  private pending = false

  scheduleRender() {
    if (this.pending) return
    this.pending = true

    // Use setImmediate to batch synchronous state changes
    setImmediate(() => {
      this.pending = false
      this.executeRender()
    })
  }
}
```

**Synchronized Update Mode (DEC 2026)**: All TTY output is wrapped with `CSI ? 2026 h` / `CSI ? 2026 l` sequences. This tells the terminal to buffer output and paint atomically, preventing visual tearing. Enabled by default; disable with `SILVERY_SYNC_UPDATE=0`.

**Layout Caching**: Reuse Yoga tree structure.

```typescript
// Don't recreate Yoga nodes on every render
// Only update changed props and recalculate
function updateYogaNode(node: SilveryNode, prevProps: Props, nextProps: Props) {
  if (prevProps.width !== nextProps.width) {
    node.yogaNode.setWidth(nextProps.width)
    node.layoutDirty = true
  }
  // ... only update what changed
}
```

---

## 7. Scrolling and Long Lists

### The Goal

Developers should just render their content. No height estimation. No virtualization math. No thinking about what fits.

```tsx
// This should just work
<Box overflow="scroll" scrollTo={selectedIdx}>
  {items.map((item) => (
    <Card key={item.id} item={item} />
  ))}
</Box>
```

### How It Works

silvery uses a **measure-then-render** approach:

```
Phase 1: React creates all child elements
Phase 2: Yoga measures all children (fast - just layout math)
Phase 3: Calculate scroll position from scrollTo prop
Phase 4: Render content ONLY for visible children
Phase 5: Paint visible content to terminal
```

**Key insight**: Yoga layout is cheap (~1ms for 500 nodes). The expensive part is building terminal strings for off-screen content. silvery skips that for non-visible children.

### API

```tsx
// Scrollable container with automatic scroll management
<Box
  flexDirection="column"
  overflow="scroll" // Enable scrolling
  scrollTo={selectedIdx} // Keep this child index visible (centered)
>
  {items.map((item, i) => (
    <Card key={item.id} item={item} isSelected={i === selectedIdx} />
  ))}
</Box>
```

Props:

- `overflow="scroll"` - enables scroll behavior
- `overflow="hidden"` - clips without scroll indicators
- `scrollTo={number}` - child index to keep visible (optional, defaults to 0)

silvery handles:

- Measuring all children via Yoga
- Calculating scroll position to center `scrollTo` child
- Determining which children intersect the viewport
- Only rendering content for visible children
- Showing overflow indicators ("▲ 5 more", "▼ 12 more")
- Clipping partial children at viewport edges

### Implementation Details

Internally, silvery does:

```typescript
// After Yoga layout completes
function calculateVisibleWindow(
  childHeights: number[],
  containerHeight: number,
  scrollToIndex: number,
): { scrollTop: number; firstVisible: number; lastVisible: number } {
  // Compute cumulative offsets
  const offsets = cumulativeSum(childHeights)
  const totalHeight = offsets[offsets.length - 1] ?? 0

  // Center the scrollTo child
  const targetOffset = offsets[scrollToIndex] ?? 0
  const targetHeight = childHeights[scrollToIndex] ?? 0
  let scrollTop = targetOffset - (containerHeight - targetHeight) / 2
  scrollTop = clamp(scrollTop, 0, Math.max(0, totalHeight - containerHeight))

  // Find visible range
  const firstVisible = findFirstVisible(offsets, scrollTop)
  const lastVisible = findLastVisible(offsets, scrollTop + containerHeight)

  return { scrollTop, firstVisible, lastVisible }
}
```

### Performance

| List Size  | Yoga Layout | Visible Content Render | Total |
| ---------- | ----------- | ---------------------- | ----- |
| 100 items  | <1ms        | ~1ms (20 visible)      | ~2ms  |
| 500 items  | ~1ms        | ~1ms (20 visible)      | ~2ms  |
| 1000 items | ~2ms        | ~1ms (20 visible)      | ~3ms  |

Yoga layout scales linearly but is extremely fast. Content rendering is constant (only visible items). This approach works well for any realistic list size.

### When NOT to Use This

For truly massive lists (10,000+ items), even Yoga layout becomes noticeable. At that scale:

- Consider pagination instead of scrolling
- Filter/search to reduce the list
- This is a UX problem, not a rendering problem

### Example: Task List

```tsx
function TaskList({ tasks, selectedIndex, onSelect }) {
  return (
    <Box flexDirection="column" overflow="scroll" scrollTo={selectedIndex}>
      {tasks.map((task, i) => (
        <TaskRow key={task.id} task={task} isSelected={i === selectedIndex} onSelect={() => onSelect(i)} />
      ))}
    </Box>
  )
}

function TaskRow({ task, isSelected }) {
  // Variable height - has subtasks, long titles, etc.
  // silvery measures this automatically
  return (
    <Box flexDirection="column" backgroundColor={isSelected ? "blue" : undefined}>
      <Text>
        {task.done ? "✓" : "○"} {task.title}
      </Text>
      {task.subtasks?.map((st) => (
        <Text key={st.id} dimColor>
          {" "}
          • {st.title}
        </Text>
      ))}
    </Box>
  )
}
```

No height estimation. No virtualization configuration. It just works.

---

## 8. Proof of Concept

Before committing to full implementation, validate with minimal PoC:

```typescript
// poc.tsx - Prove the architecture works
import { createRenderer } from './renderer';
import { Box, Text, useLayout } from './components';

function App() {
  return (
    <Box flexDirection="column" width="100%">
      <Header />
      <Content />
    </Box>
  );
}

function Header() {
  const { width } = useLayout();  // THIS IS THE TEST
  return <Text>{'='.repeat(width)}</Text>;
}

function Content() {
  const { width, height } = useLayout();
  return <Text>{`Content area: ${width}x${height}`}</Text>;
}

createRenderer().render(<App />);
```

**Success criteria**: `useLayout()` returns correct dimensions without manual prop threading.

---

## 9. Compatibility Tiers

Explicit expectations for what works and what doesn't:

### Tier 1 - Must Work (blocks MVP)

- `<Box>` with all flexbox props (direction, justify, align, wrap, grow, shrink)
- `<Text>` with color, backgroundColor, bold, italic, underline, strikethrough
- `render()` with stdout/stdin options
- `useInput()` for keyboard handling
- `useApp()` for exit control
- Chalk integration (ANSI strings preserved)

### Tier 2 - Should Work (blocks 1.0)

- `<Spacer>`, `<Newline>`
- `<Static>` for persistent output above dynamic content
- `useFocusable()`, `useFocusWithin()`, `useFocusManager()`
- Border styles (single, double, round, etc.)
- `measureElement()` for backward compatibility

### Tier 3 - Nice to Have (post 1.0)

- `<Transform>` for output transformation
- Screen reader support
- Full focus traversal parity with Ink

### Tier 4 - Explicitly Not Supported

- Ink's internal/private APIs
- Undocumented Ink behaviors
- Bug-compatibility (if Ink has bugs apps rely on)

---

## 10. Risk Analysis

| Risk                                    | Likelihood | Impact | Mitigation                                                    |
| --------------------------------------- | ---------- | ------ | ------------------------------------------------------------- |
| Yoga doesn't expose what we need        | Low        | High   | Yoga API is sufficient; verified in research                  |
| React reconciler complexity             | Medium     | Medium | Start with Ink's reconciler as reference                      |
| Performance regression from multi-phase | Medium     | Medium | Benchmark early; layout is fast, render is the slow part      |
| Two-phase render causes visual flicker  | Medium     | High   | First render shows zeros gracefully; add loading states       |
| Edge cases in Ink compatibility         | High       | Low    | Comprehensive test suite; accept minor documented differences |
| Scope creep (images, mouse, etc.)       | High       | Medium | Strict phase gates; v1 = layout feedback only                 |
| Yoga WASM bundle too large              | Low        | Medium | yoga-wasm-web is ~200KB; can lazy-load if needed              |
| React 19 breaks reconciler              | Medium     | High   | Pin to React 18; add React version integration tests          |
| Memory leaks from callbacks             | Medium     | Medium | Use WeakMap; test with long-running apps                      |
| Unicode edge cases                      | High       | Low    | Use Intl.Segmenter; comprehensive Unicode test fixtures       |
| **CJK/IME input issues**                | High       | High   | Test thoroughly; DEC 2026 sync update now enabled by default  |
| **Terminal multiplexer rendering**      | Medium     | High   | DEC 2026 sync update prevents tearing in tmux/Zellij          |
| **Keyboard protocol limitations**       | Medium     | Medium | Document limitations; plan Kitty protocol support             |

_Note: CJK/IME and terminal multiplexer risks added based on analysis of Ink's real-world issues (January 2026). These are Ink's top pain points and likely to affect silvery users too._

---

## 11. Alternatives Considered

### A. Patch Ink Directly

Fork Ink and modify the reconciler. Rejected because:

- Ink's codebase is tightly coupled
- Would need to maintain fork indefinitely
- Architecture change is invasive

### B. Build on Terminal-Kit

Terminal-kit provides low-level primitives. Rejected because:

- No React - would need to build component model
- Different paradigm (imperative vs declarative)

### C. Port Textual to JavaScript

Textual (Python) has the right architecture. Rejected because:

- Significant porting effort
- Different language idioms
- Would lose Ink ecosystem compatibility

### D. Use Taffy (Rust) via WASM

Taffy is a better flexbox than Yoga. Considered but deferred:

- Additional complexity (WASM bundling)
- Yoga is sufficient for MVP
- Can switch layout engine later if needed

---

## 12. Open Questions

1. **Naming**: "silvery" is a placeholder. Options: ink-next, termink, rink (taken), terminus
2. **Monorepo or separate packages**: `silvery` vs `@silvery/core`, `@silvery/testing`, etc.
3. **Ink version compatibility**: Target Ink 3.x API? Include Ink 4.x features?
4. **License**: MIT (like Ink)? Something else?

---

## 13. Conclusion

silvery is feasible and would eliminate the biggest pain point in Ink development. The core innovation - exposing Yoga's computed layout to React components - is straightforward to implement. The challenge is maintaining API compatibility while making this architectural change.

**Recommendation**: Build the PoC (1 week). If `useLayout()` works as designed, proceed with full implementation. If unforeseen blockers emerge, document and re-evaluate.

---

## Appendix: References

See also [README.md](../README.md) for a comprehensive "Related Work" section with prior art comparison.

### Core Dependencies

- [Ink source code](https://github.com/vadimdemedes/ink) - API compatibility target
- [react-reconciler docs](https://github.com/facebook/react/tree/main/packages/react-reconciler) - Custom renderer API
- [Yoga layout](https://yogalayout.dev/) - Flexbox implementation (Facebook)
- [Chalk](https://github.com/chalk/chalk) - ANSI styling

### Related GitHub Issues

**Layout feedback (core problem silvery solves)**:

- [Ink #5](https://github.com/vadimdemedes/ink/issues/5) (2016) - Original "is there a way to know width/height?" issue
- [Ink #387](https://github.com/vadimdemedes/ink/issues/387) (2020) - Discussion of layout feedback limitations

**Long-standing issues silvery can address**:

- [Ink #222](https://github.com/vadimdemedes/ink/issues/222) (2019) - Scrolling request (5.5+ years open)
- [Ink #251](https://github.com/vadimdemedes/ink/issues/251) (2019) - Cursor support (6+ years open)
- [Ink #765](https://github.com/vadimdemedes/ink/issues/765) - Scrolling primitives (repeatedly reopened)

**Current pain points to learn from**:

- [Ink #759](https://github.com/vadimdemedes/ink/issues/759) - CJK/IME input issues (Ink's #1 pain point)
- [Ink #824](https://github.com/vadimdemedes/ink/issues/824) - Kitty keyboard protocol
- [Ink #796](https://github.com/vadimdemedes/ink/issues/796) - Process exit timing
- [Ink #701](https://github.com/vadimdemedes/ink/issues/701) - Memory leaks in useInput

See [silvery-vs-ink.md](../silvery-vs-ink.md) for comprehensive analysis of Ink's issues and PRs.

### Prior Art (TUI Frameworks with Layout Feedback)

- [Textual](https://textual.textualize.io/) - Python TUI, CSS-like styling, major inspiration
- [Ratatui](https://ratatui.rs/) - Rust immediate-mode TUI
- [Bubbletea](https://github.com/charmbracelet/bubbletea) - Go Elm-architecture TUI
- [Brick](https://github.com/jtdaugherty/brick) - Haskell declarative TUI
- [Cursive](https://github.com/gyscos/cursive) - Rust TUI

### Alternative Layout Engines

- [Taffy](https://github.com/DioxusLabs/taffy) - Rust flexbox, potential future option via WASM

### Further Reading

- [7 Things Building a TUI Framework](https://www.textualize.io/blog/7-things-ive-learned-building-a-modern-tui-framework/) - Lessons from Textual
