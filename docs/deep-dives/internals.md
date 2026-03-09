# silvery Internals: How the Reconciler Works

This document explains silvery's architecture for contributors. Read this if you want to understand how layout feedback actually works.

---

## The Core Problem (Why Ink Can't Do This)

Ink's render flow:

```
React.render(<App />)
  → React calls component functions
  → Components return JSX
  → Ink builds Yoga tree from JSX
  → Yoga.calculateLayout()
  → Ink writes to terminal
```

The problem: Components execute (return JSX) **before** Yoga calculates layout. By the time we know the dimensions, it's too late—the component already returned its content.

---

## silvery's Solution: Deferred Content Rendering

silvery separates **structure** from **content**:

```
React.render(<App />)
  → React calls component functions
  → Components return STRUCTURE (layout constraints)
  → silvery builds Yoga tree
  → Yoga.calculateLayout()
  → silvery calls CONTENT CALLBACKS with dimensions
  → silvery writes to terminal
```

The key insight: React components don't render terminal content directly. They declare layout constraints and register callbacks that render content later.

---

## The 5-Phase Pipeline

### Phase 0: Reconciliation

React's reconciler builds the component tree. Our custom reconciler creates `SilveryNode` objects:

```typescript
interface SilveryNode {
  type: "box" | "text" | "root"
  props: BoxProps | TextProps
  children: SilveryNode[]

  // Yoga integration
  yogaNode: Yoga.Node

  // Layout state
  computedLayout: ComputedLayout | null
  prevLayout: ComputedLayout | null
  layoutDirty: boolean
  contentDirty: boolean

  // Content rendering
  contentCallback: ((layout: ComputedLayout) => TerminalContent) | null

  // Subscriptions
  layoutSubscribers: Set<() => void>
}
```

The reconciler hooks:

```typescript
const hostConfig: HostConfig = {
  createInstance(type, props): SilveryNode {
    const yogaNode = Yoga.Node.create()
    applyFlexboxProps(yogaNode, props)

    return {
      type,
      props,
      children: [],
      yogaNode,
      computedLayout: null,
      prevLayout: null,
      layoutDirty: true,
      contentDirty: true,
      contentCallback: null,
      layoutSubscribers: new Set(),
    }
  },

  appendChild(parent, child) {
    parent.children.push(child)
    parent.yogaNode.insertChild(child.yogaNode, parent.children.length - 1)
    parent.layoutDirty = true
  },

  removeChild(parent, child) {
    const index = parent.children.indexOf(child)
    parent.children.splice(index, 1)
    parent.yogaNode.removeChild(child.yogaNode)
    child.yogaNode.free()
    parent.layoutDirty = true
  },

  commitUpdate(node, updatePayload, type, oldProps, newProps) {
    // Check if layout-affecting props changed
    if (layoutPropsChanged(oldProps, newProps)) {
      applyFlexboxProps(node.yogaNode, newProps)
      node.layoutDirty = true
    }

    // Check if content-affecting props changed
    if (contentPropsChanged(oldProps, newProps)) {
      node.contentDirty = true
    }

    node.props = newProps
  },

  prepareForCommit(containerInfo) {
    // This is where we trigger layout calculation
    // Called after React finishes reconciliation
    return null
  },

  resetAfterCommit(containerInfo) {
    // After React commits, run our pipeline
    runPipeline(containerInfo.rootNode)
  },
}
```

### Phase 1: Measure (for fit-content)

Some nodes need content measurement before layout:

```typescript
function measurePhase(root: SilveryNode) {
  traverseTree(root, (node) => {
    if (node.props.width === "fit-content" || node.props.height === "fit-content") {
      const intrinsicSize = measureIntrinsicSize(node)

      if (node.props.width === "fit-content") {
        node.yogaNode.setWidth(intrinsicSize.width)
      }
      if (node.props.height === "fit-content") {
        node.yogaNode.setHeight(intrinsicSize.height)
      }
    }
  })
}

function measureIntrinsicSize(node: SilveryNode): {
  width: number
  height: number
} {
  if (node.type === "text") {
    const text = getTextContent(node)
    return {
      width: stringWidth(text),
      height: text.split("\n").length,
    }
  }

  // For boxes, measure children
  let width = 0,
    height = 0
  for (const child of node.children) {
    const childSize = measureIntrinsicSize(child)
    if (node.props.flexDirection === "row") {
      width += childSize.width
      height = Math.max(height, childSize.height)
    } else {
      width = Math.max(width, childSize.width)
      height += childSize.height
    }
  }
  return { width, height }
}
```

### Phase 2: Layout

Calculate layout for the entire tree:

```typescript
function layoutPhase(root: SilveryNode, terminalWidth: number, terminalHeight: number) {
  // Only recalculate if something changed
  if (!hasLayoutDirtyNodes(root)) {
    return
  }

  // Calculate layout
  root.yogaNode.calculateLayout(terminalWidth, terminalHeight, Yoga.DIRECTION_LTR)

  // Propagate computed dimensions
  propagateLayout(root, 0, 0)

  // Notify subscribers
  notifyLayoutSubscribers(root)
}

function propagateLayout(node: SilveryNode, parentX: number, parentY: number) {
  const yoga = node.yogaNode

  node.prevLayout = node.computedLayout
  node.computedLayout = {
    x: parentX + yoga.getComputedLeft(),
    y: parentY + yoga.getComputedTop(),
    width: yoga.getComputedWidth(),
    height: yoga.getComputedHeight(),
  }

  node.layoutDirty = false

  // If dimensions changed, content needs re-render
  if (!layoutEqual(node.prevLayout, node.computedLayout)) {
    node.contentDirty = true
  }

  for (const child of node.children) {
    propagateLayout(child, node.computedLayout.x, node.computedLayout.y)
  }
}

function notifyLayoutSubscribers(node: SilveryNode) {
  if (!layoutEqual(node.prevLayout, node.computedLayout)) {
    for (const subscriber of node.layoutSubscribers) {
      subscriber() // Triggers React re-render
    }
  }

  for (const child of node.children) {
    notifyLayoutSubscribers(child)
  }
}
```

### Phase 3: Content Render

Render actual terminal content:

```typescript
function contentPhase(root: SilveryNode): TerminalBuffer {
  const buffer = createBuffer(root.computedLayout.width, root.computedLayout.height)

  renderNodeToBuffer(root, buffer)

  return buffer
}

function renderNodeToBuffer(node: SilveryNode, buffer: TerminalBuffer) {
  if (!node.contentDirty && !node.layoutDirty) {
    // Content unchanged, skip
    return
  }

  const { x, y, width, height } = node.computedLayout

  if (node.type === "text") {
    const content = renderTextContent(node, width)
    writeToBuffer(buffer, x, y, content)
  } else if (node.type === "box") {
    // Render border if present
    if (node.props.borderStyle) {
      renderBorder(buffer, x, y, width, height, node.props.borderStyle)
    }

    // Render background if present
    if (node.props.backgroundColor) {
      fillBackground(buffer, x, y, width, height, node.props.backgroundColor)
    }
  }

  // Render children
  for (const child of node.children) {
    renderNodeToBuffer(child, buffer)
  }

  node.contentDirty = false
}

function renderTextContent(node: SilveryNode, availableWidth: number): StyledString {
  const text = node.props.children

  // Auto-truncate by default
  if (node.props.wrap !== false) {
    return truncateAnsi(text, availableWidth)
  }

  return text
}
```

### Phase 4: Diff & Output

Compare buffers and emit minimal ANSI:

```typescript
function outputPhase(prevBuffer: TerminalBuffer | null, nextBuffer: TerminalBuffer): string {
  if (!prevBuffer) {
    // First render: output entire buffer
    return bufferToAnsi(nextBuffer)
  }

  // Diff and emit only changes
  const changes: CellChange[] = []

  for (let y = 0; y < nextBuffer.height; y++) {
    for (let x = 0; x < nextBuffer.width; x++) {
      const prevCell = prevBuffer.getCell(x, y)
      const nextCell = nextBuffer.getCell(x, y)

      if (!cellEqual(prevCell, nextCell)) {
        changes.push({ x, y, cell: nextCell })
      }
    }
  }

  return changesToAnsi(changes)
}

function changesToAnsi(changes: CellChange[]): string {
  // Sort by position for optimal cursor movement
  changes.sort((a, b) => a.y - b.y || a.x - b.x)

  let output = ""
  let cursorX = 0,
    cursorY = 0
  let currentStyle: Style | null = null

  for (const { x, y, cell } of changes) {
    // Move cursor (optimize for adjacent cells)
    if (y !== cursorY || x !== cursorX) {
      if (y === cursorY && x === cursorX + 1) {
        // Cursor advances automatically
      } else if (y === cursorY + 1 && x === 0) {
        output += "\n"
      } else {
        output += `\x1b[${y + 1};${x + 1}H`
      }
    }

    // Change style if needed
    if (!styleEqual(currentStyle, cell.style)) {
      output += styleToAnsi(cell.style)
      currentStyle = cell.style
    }

    // Write character
    output += cell.char
    cursorX = x + 1
    cursorY = y
  }

  // Reset style at end
  if (currentStyle) {
    output += "\x1b[0m"
  }

  return output
}
```

---

## How useContentRect() Works

The hook subscribes to layout completion:

```typescript
const NodeContext = createContext<SilveryNode | null>(null)

function useSilveryNode(): SilveryNode {
  const node = useContext(NodeContext)
  if (!node) throw new Error("useContentRect must be used within silvery")
  return node
}

function useContentRect(): ComputedLayout {
  const node = useSilveryNode()
  const [, forceUpdate] = useReducer((x) => x + 1, 0)

  useLayoutEffect(() => {
    // Subscribe to layout changes
    const handleLayoutComplete = () => {
      if (!layoutEqual(node.prevLayout, node.computedLayout)) {
        forceUpdate()
      }
    }

    node.layoutSubscribers.add(handleLayoutComplete)
    return () => node.layoutSubscribers.delete(handleLayoutComplete)
  }, [node])

  // Return current dimensions (may be zeros on first render)
  return node.computedLayout ?? { x: 0, y: 0, width: 0, height: 0 }
}
```

**Why it works**:

1. First render: `computedLayout` is null, returns zeros
2. After layout phase: `notifyLayoutSubscribers` calls `forceUpdate`
3. Second render: `computedLayout` has real dimensions

**Why it's efficient**:

- Only subscribes once per component
- Only re-renders if dimensions actually changed
- Uses `useLayoutEffect` so re-render happens before paint

---

## The Render Scheduler

Batches rapid updates:

```typescript
class RenderScheduler {
  private pending = false
  private root: SilveryNode
  private stdout: NodeJS.WriteStream
  private prevBuffer: TerminalBuffer | null = null

  scheduleRender() {
    if (this.pending) return
    this.pending = true

    // Batch synchronous updates
    setImmediate(() => {
      this.pending = false
      this.executeRender()
    })
  }

  executeRender() {
    const { columns, rows } = this.stdout

    // Run pipeline
    measurePhase(this.root)
    layoutPhase(this.root, columns, rows)
    const buffer = contentPhase(this.root)
    const output = outputPhase(this.prevBuffer, buffer)

    // Write to terminal
    this.stdout.write(output)

    // Save for next diff
    this.prevBuffer = buffer
  }
}
```

---

## Terminal Buffer Implementation

Efficient cell storage:

```typescript
class TerminalBuffer {
  private cells: Uint32Array // Packed cell data
  private chars: string[] // Character storage (for wide chars)

  readonly width: number
  readonly height: number

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.cells = new Uint32Array(width * height)
    this.chars = new Array(width * height).fill(" ")
  }

  getCell(x: number, y: number): Cell {
    const index = y * this.width + x
    const packed = this.cells[index]

    return {
      char: this.chars[index],
      fg: unpackFg(packed),
      bg: unpackBg(packed),
      attrs: unpackAttrs(packed),
      wide: (packed & WIDE_FLAG) !== 0,
      continuation: (packed & CONTINUATION_FLAG) !== 0,
    }
  }

  setCell(x: number, y: number, cell: Cell) {
    const index = y * this.width + x
    this.chars[index] = cell.char
    this.cells[index] = packCell(cell)
  }
}

// Pack cell metadata into 32 bits:
// [0-7]: foreground color index
// [8-15]: background color index
// [16-23]: attributes (bold, italic, etc.)
// [24-31]: flags (wide, continuation, etc.)
function packCell(cell: Cell): number {
  let packed = 0
  packed |= (cell.fg ?? 0) & 0xff
  packed |= ((cell.bg ?? 0) & 0xff) << 8
  packed |= (attrsToNumber(cell.attrs) & 0xff) << 16
  if (cell.wide) packed |= WIDE_FLAG
  if (cell.continuation) packed |= CONTINUATION_FLAG
  return packed
}
```

---

## Unicode Handling

Proper grapheme segmentation:

```typescript
import stringWidth from "string-width"

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })

function writeTextToBuffer(buffer: TerminalBuffer, x: number, y: number, text: string, style: Style) {
  const graphemes = [...segmenter.segment(text)].map((s) => s.segment)
  let col = x

  for (const grapheme of graphemes) {
    const width = stringWidth(grapheme)

    if (width === 0) {
      // Combining character: append to previous cell
      const prevChar = buffer.getCell(col - 1, y).char
      buffer.setCell(col - 1, y, { char: prevChar + grapheme, ...style })
    } else if (width === 1) {
      buffer.setCell(col, y, { char: grapheme, ...style })
      col++
    } else if (width === 2) {
      // Wide character takes 2 cells
      buffer.setCell(col, y, { char: grapheme, wide: true, ...style })
      buffer.setCell(col + 1, y, { char: "", continuation: true, ...style })
      col += 2
    }

    if (col >= buffer.width) break
  }
}
```

---

## Error Handling

Graceful degradation:

```typescript
function runPipeline(root: SilveryNode) {
  try {
    measurePhase(root)
    layoutPhase(root, process.stdout.columns, process.stdout.rows)
    const buffer = contentPhase(root)
    const output = outputPhase(prevBuffer, buffer)
    process.stdout.write(output)
    prevBuffer = buffer
  } catch (error) {
    // Don't crash the app on render errors
    console.error("silvery render error:", error)

    // Try to show error in terminal
    process.stdout.write("\x1b[0m\x1b[31mRender error (see console)\x1b[0m")
  }
}
```

---

## Testing Internals

Unit tests for each phase:

```typescript
// Phase 2: Layout
test("layout computes dimensions", () => {
  const root = createNode("box", { width: 100, height: 50 })
  const child = createNode("box", { width: "50%", height: "50%" })
  appendChild(root, child)

  layoutPhase(root, 100, 50)

  expect(child.computedLayout).toEqual({
    x: 0,
    y: 0,
    width: 50,
    height: 25,
  })
})

// Phase 3: Content
test("text truncates to available width", () => {
  const node = createNode("text", { children: "Hello World" })
  node.computedLayout = { x: 0, y: 0, width: 5, height: 1 }

  const content = renderTextContent(node, 5)

  expect(content).toBe("Hell…")
})

// Phase 4: Diff
test("diff emits minimal changes", () => {
  const prev = createBuffer(10, 1)
  const next = createBuffer(10, 1)

  prev.setCell(0, 0, { char: "A" })
  next.setCell(0, 0, { char: "B" })

  const output = outputPhase(prev, next)

  expect(output).toBe("\x1b[1;1HB") // Move to (0,0), write 'B'
})
```

---

## Suspense Support (hideInstance/unhideInstance)

React Suspense requires the renderer to hide and unhide subtrees when components suspend. silvery implements this via the `hideInstance` and `unhideInstance` host config methods.

### How Suspension Works

1. Component throws a promise (suspends)
2. React calls `hideInstance(instance)` on suspended nodes
3. Suspense boundary's fallback renders
4. When promise resolves, React calls `unhideInstance(instance)`
5. Original content becomes visible again

### Implementation

```typescript
const hostConfig: HostConfig = {
  // Called when a subtree suspends
  hideInstance(instance: SilveryNode) {
    instance.hidden = true
    instance.layoutDirty = true
    // Hidden nodes excluded from layout and rendering
  },

  // Called when suspension ends
  unhideInstance(instance: SilveryNode) {
    instance.hidden = false
    instance.layoutDirty = true
    instance.contentDirty = true
  },

  // Also need hideTextInstance/unhideTextInstance for Text nodes
  hideTextInstance(textInstance: SilveryTextNode) {
    textInstance.hidden = true
  },

  unhideTextInstance(textInstance: SilveryTextNode) {
    textInstance.hidden = false
  },
}
```

### Layout Phase Integration

The layout phase skips hidden nodes:

```typescript
function propagateLayout(node: SilveryNode, parentX: number, parentY: number) {
  // Skip hidden nodes - they don't participate in layout
  if (node.hidden) {
    return
  }

  // Normal layout calculation...
  node.computedLayout = {
    x: parentX + yoga.getComputedLeft(),
    y: parentY + yoga.getComputedTop(),
    width: yoga.getComputedWidth(),
    height: yoga.getComputedHeight(),
  }

  for (const child of node.children) {
    propagateLayout(child, node.computedLayout.x, node.computedLayout.y)
  }
}
```

### Render Phase Integration

The content phase skips hidden nodes:

```typescript
function renderNodeToBuffer(node: SilveryNode, buffer: TerminalBuffer) {
  // Don't render hidden nodes
  if (node.hidden) {
    return
  }

  // Normal rendering...
}
```

### Key Behavior

- **State preserved**: Hidden components aren't unmounted, so `useState`, `useRef`, etc. retain their values
- **Effects paused**: `useEffect` cleanup runs when hidden, effect runs again when unhidden
- **Layout excluded**: Hidden nodes don't contribute to parent dimensions
- **Children hidden**: Hiding a parent hides all descendants

### Testing Suspense

```typescript
test("Suspense shows fallback while loading", async () => {
  let resolve: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });

  function AsyncContent() {
    if (!resolved) throw promise;
    return <Text>Loaded!</Text>;
  }

  const app = render(
    <Suspense fallback={<Text>Loading...</Text>}>
      <AsyncContent />
    </Suspense>
  );

  // Fallback visible while suspended
  expect(app.text).toContain("Loading...");
  expect(app.text).not.toContain("Loaded!");

  // Resolve and verify content appears
  resolve!();
  await settled();

  expect(app.text).toContain("Loaded!");
  expect(app.text).not.toContain("Loading...");
});
```

---

## Contributing

1. **Read the tests first** - They document expected behavior
2. **Run benchmarks** - Performance matters for TUIs
3. **Test Unicode** - Use CJK, emoji, combining characters
4. **Test long-running** - Memory leaks are subtle

```bash
# Run tests
bun test

# Run benchmarks
bun run bench

# Check for memory leaks
bun run test:memory
```
