# hightea Maximum Roadmap

This document outlines the maximum vision for hightea — not a commitment, but an exploration of where the two-phase rendering pattern could add value.

## Value Analysis Summary

| Platform     | Value Level       | Status         | Why                                                          |
| ------------ | ----------------- | -------------- | ------------------------------------------------------------ |
| Terminal     | **High** (proven) | ✅ Complete    | Original use case, working in production                     |
| Canvas 2D    | **High**          | ✅ Implemented | No existing React layout solution for canvas                 |
| DOM          | **Medium**        | ✅ Implemented | Accessibility, text selection (xterm.js pattern)             |
| WebGL        | **High**          | 🔮 Future      | 900% faster than canvas (per xterm.js)                       |
| React Native | **High**          | 🔮 Future      | FlatList pain is real, Litho/ComponentKit prove the approach |
| PDF/Email    | **Medium**        | 🔮 Future      | Niche but useful for reports                                 |

## Tier 1: Terminal (Current - Complete)

The foundation. Everything here is production-ready.

| Feature                              | Status      |
| ------------------------------------ | ----------- |
| Terminal buffer (character cells)    | ✅ Complete |
| ANSI output with diffing             | ✅ Complete |
| Keyboard input (stdin)               | ✅ Complete |
| Yoga layout engine                   | ✅ Complete |
| Flexture layout engine (2.5x faster) | ✅ Complete |
| `overflow="scroll"`                  | ✅ Complete |
| Unicode/emoji/CJK handling           | ✅ Complete |
| Style layering (preserve underlines) | ✅ Complete |

## Tier 2: Enhanced Terminal (Near-term)

Improvements to the terminal target based on real-world usage.

| Feature                       | Value  | Effort | Notes                                                                                                 |
| ----------------------------- | ------ | ------ | ----------------------------------------------------------------------------------------------------- |
| React DevTools                | High   | Medium | ✅ Implemented — `connectDevTools()`, auto via `DEBUG_DEVTOOLS=1`                                     |
| Cursor API (`useCursor()`)    | High   | Medium | Text editing, input fields ([Ink #251](https://github.com/vadimdemedes/ink/issues/251) open 6+ years) |
| Kitty keyboard protocol       | Medium | Low    | Better modifier key detection                                                                         |
| Mouse support                 | Medium | Medium | Click/hover handlers                                                                                  |
| Image protocols (Sixel/Kitty) | Low    | High   | Inline images                                                                                         |

### Cursor API Design

```tsx
function TextInput() {
  const { cursor, setCursor } = useCursor()
  const { width } = useContentRect()

  useInput((input, key) => {
    if (key.leftArrow) setCursor(Math.max(0, cursor - 1))
    if (key.rightArrow) setCursor(Math.min(value.length, cursor + 1))
  })

  return (
    <Box>
      <Text>{value.slice(0, cursor)}</Text>
      <Text inverse>{value[cursor] ?? " "}</Text>
      <Text>{value.slice(cursor + 1)}</Text>
    </Box>
  )
}
```

## Tier 3: Canvas/WebGL/DOM (Web Targets)

**Canvas and DOM adapters are now implemented**, validating the multi-target architecture.

### Implementation Status

| Adapter   | Status      | Entry Point      | Demo                        |
| --------- | ----------- | ---------------- | --------------------------- |
| Canvas 2D | ✅ Complete | `hightea/canvas` | `examples/canvas-test.html` |
| DOM       | ✅ Complete | `hightea/dom`    | `examples/dom-test.html`    |
| WebGL     | 🔮 Future   | -                | -                           |

### Quick Start

```tsx
// Canvas rendering (pixel-based)
import { renderToCanvas, Box, Text } from "@hightea/term/canvas"
const canvas = document.getElementById("canvas")
renderToCanvas(<App />, canvas, { fontSize: 14 })

// DOM rendering (accessible, text-selectable)
import { renderToDOM, Box, Text } from "@hightea/term/dom"
const container = document.getElementById("app")
renderToDOM(<App />, container, { fontSize: 14 })
```

### Architecture

Based on research into [xterm.js renderer architecture](https://github.com/xtermjs/xterm.js/issues/3271):

| Renderer | Performance        | Text Selection | Accessibility |
| -------- | ------------------ | -------------- | ------------- |
| WebGL    | Best (900% faster) | ❌             | ❌            |
| Canvas   | Good               | ❌             | ❌            |
| DOM      | Slowest            | ✅             | ✅            |

### Why Canvas First?

1. **Simpler than React Native** - No native bridge, just DOM APIs
2. **Validates decomposition** - Proves the adapter interface works
3. **Real use cases** - Games, data viz, design tools, dashboards
4. **No CSS dependency** - hightea layout replaces browser layout entirely

### Use Cases

| Application        | Why hightea Helps                         |
| ------------------ | ----------------------------------------- |
| Canvas games       | Layout feedback during render, not after  |
| Data visualization | Complex responsive layouts without CSS    |
| Design tools       | Custom constraint-based layout algorithms |
| Dashboards         | Predictable frame timing for animations   |

### What Web Developers Do Today

```tsx
// The "ResizeObserver dance" - every React canvas app does this
function CanvasComponent() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref}>
      {/* First render: size is 0! */}
      {size.width > 0 && <Canvas width={size.width} height={size.height} />}
    </div>
  )
}
```

### What hightea-for-Canvas Would Look Like

```tsx
import { render, Box, Canvas, useContentRect } from "@hightea/canvas"

function App() {
  return (
    <Box flexDirection="row">
      <Sidebar />
      <CanvasPanel />
    </Box>
  )
}

function CanvasPanel() {
  const { width, height } = useContentRect()
  // width and height are known during render!
  return <Canvas draw={(ctx) => drawVisualization(ctx, width, height)} />
}

render(<App />, document.getElementById("root"))
```

### Implementation Scope

| Component        | Reusable from @hightea/core | Canvas-Specific      |
| ---------------- | --------------------------- | -------------------- |
| Reconciler       | ✅ 100%                     | -                    |
| Layout engine    | ✅ 100%                     | -                    |
| useContentRect   | ✅ 100%                     | -                    |
| Style system     | ⚠️ Partial (no underlines)  | Color mapping        |
| Buffer           | -                           | OffscreenCanvas      |
| Text measurement | -                           | ctx.measureText()    |
| Output           | -                           | Canvas draw calls    |
| Events           | -                           | DOM events → hightea |

**Estimate**: ~30% of hightea codebase is directly reusable.

## Tier 4: React Native (High Value)

The **highest-impact** potential target, but also the most complex.

### The FlatList Pain Point

React Native's biggest pain point is virtualized lists:

```tsx
// RN Today: The FlatList struggle
<FlatList
  data={items}
  // MUST estimate heights - but items vary!
  getItemLayout={(data, index) => ({
    length: 50, // GUESS! What if items have subtasks?
    offset: 50 * index,
    index,
  })}
  // Or don't provide getItemLayout and accept scroll jank
/>
```

**Current solutions and their limitations:**

| Solution              | Approach               | Limitation                   |
| --------------------- | ---------------------- | ---------------------------- |
| FlatList (stock)      | Estimate heights       | Jank with variable heights   |
| FlashList (Shopify)   | Recycling + estimation | Still needs height estimates |
| Manual virtualization | DIY measurement        | Significant complexity       |

### How hightea Could Help

```tsx
// hightea approach: Know heights before render
function List({ items }) {
  return (
    <Box overflow="scroll" scrollTo={selectedIdx}>
      {items.map((item) => (
        <Card key={item.id} item={item} />
      ))}
    </Box>
  )
}

function Card({ item }) {
  const { height } = useContentRect()
  // Height is KNOWN - no estimation!
  return (
    <Box>
      <Text>{item.title}</Text>
      {item.subtasks?.map((st) => (
        <Text key={st.id}> • {st.title}</Text>
      ))}
    </Box>
  )
}
```

**Why this works:**

1. Layout calculated in JS before rendering visible items
2. Scroll position computed from actual heights
3. Only visible items rendered to native views
4. No height estimation, no getItemLayout hacks

### Prior Art Validation

Facebook already proved this approach works:

| Framework        | Platform | Result                              |
| ---------------- | -------- | ----------------------------------- |
| **Litho**        | Android  | ~35% scroll performance improvement |
| **ComponentKit** | iOS      | Same approach, similar results      |

Both compute layout off-main-thread, then render only visible components.

### Integration Approaches

| Approach           | Description                                    | Feasibility               |
| ------------------ | ---------------------------------------------- | ------------------------- |
| Fork RN Renderer   | Replace RN's reconciler with hightea-style     | High effort, full control |
| Yoga Wrapper       | Wrap Yoga calls to expose dimensions           | Medium effort, may work   |
| Fabric Integration | Leverage new architecture's synchronous layout | Medium effort, best path  |
| Library Layer      | Build on top of RN (limited)                   | Low effort, limited value |

### Technical Risks

| Risk                                      | Severity | Mitigation                          |
| ----------------------------------------- | -------- | ----------------------------------- |
| JS thread blocking for thousands of items | High     | Batch layout, measure incrementally |
| Native bridge overhead                    | Medium   | Fabric reduces this significantly   |
| Yoga already integrated                   | Low      | Wrap, don't replace                 |
| Touch event handling complexity           | Medium   | Leverage existing RN infrastructure |

### Recommendation

**Start with Fabric investigation.** React Native's new architecture (Fabric) has synchronous layout capabilities that might enable hightea's pattern without a full reconciler replacement.

## Tier 5: Browser DOM (Research Only)

**Lowest value** for most applications — CSS already handles layout well.

### Where hightea Pattern Might Help

| Use Case                 | Why                             | Caveat                          |
| ------------------------ | ------------------------------- | ------------------------------- |
| Canvas-within-DOM hybrid | Clear boundaries                | Limited scope                   |
| Custom layout algorithms | CSS can't do constraint solving | Niche                           |
| Heavy virtualization     | Spreadsheets, infinite grids    | FlashList-style solutions exist |

### Why CSS Is Usually Better

| Aspect                | CSS                       | hightea-for-DOM     |
| --------------------- | ------------------------- | ------------------- |
| Text rendering        | Sophisticated, native     | Would need custom   |
| Accessibility         | Browser handles a11y tree | Manual work         |
| Performance           | Highly optimized          | Additional JS layer |
| Developer familiarity | Universal                 | New paradigm        |

### Recommendation

**Don't pursue @hightea/dom as a general solution.** Consider only for:

- Embedding hightea canvas regions in DOM apps
- Very specific custom layout needs

## Tier 6: Specialized Targets (Speculative)

| Target        | Use Case           | Feasibility | Notes                                  |
| ------------- | ------------------ | ----------- | -------------------------------------- |
| PDF           | Reports, invoices  | Medium      | Layout engine + PDF primitives         |
| Email         | HTML email layouts | Medium      | Generate inline-styled HTML            |
| Accessibility | Screen reader tree | Research    | Could generate accessible descriptions |
| AR/VR         | Spatial UI         | Research    | 3D layout is different problem         |

### PDF Generation Example

```tsx
import { renderToPdf, Box, Text, Table } from "@hightea/pdf"

const pdf = await renderToPdf(
  <Box flexDirection="column" padding={20}>
    <Text fontSize={24} bold>
      Monthly Report
    </Text>
    <Table columns={columns} data={data} />
  </Box>,
  { pageSize: "A4" },
)

await Bun.write("report.pdf", pdf)
```

## Validation Strategy

Based on O3 deep research analysis, the recommended path:

```
1. Canvas Prototype (validates architecture)
   ├── Build @hightea/canvas adapter
   ├── Measure perf vs browser layout
   ├── Test with real use cases (data viz, games)
   └── Decision: proceed with RN or not

2. React Native Investigation (if canvas succeeds)
   ├── Study Fabric architecture
   ├── Prototype Yoga wrapper
   ├── Test with FlatList replacement
   └── Measure scroll performance

3. Production Target Selection
   └── Based on prototype results, commit to one target
```

## Web Comparison: What Does hightea Replace?

### The Web Stack Today

```
React Component
     ↓
React DOM Reconciler
     ↓
DOM Elements (div, span, etc.)
     ↓
Browser CSS Layout Engine (async)
     ↓
Paint/Composite
```

**Key limitation**: CSS layout is **asynchronous**. Components render, THEN browser calculates layout.

### How Web Developers Work Around This

| Need                     | Current Solution                          | Pain Level |
| ------------------------ | ----------------------------------------- | ---------- |
| Know component width     | `useRef` + `ResizeObserver` + `useEffect` | High       |
| Layout-dependent content | Two renders (blank → measured → content)  | Medium     |
| Virtualized lists        | `react-virtualized`, estimate heights     | High       |
| Responsive components    | CSS media queries, container queries      | Low        |
| Custom layout algorithm  | Roll your own, no React integration       | Very High  |

### Where hightea-for-Web Would Replace

| Layer            | Browser                    | hightea-for-Web           |
| ---------------- | -------------------------- | ------------------------- |
| Layout Engine    | CSS (browser-native)       | Yoga/Flexture/custom      |
| Layout Timing    | Async (post-render)        | Sync (pre-content)        |
| Size Queries     | ResizeObserver (effect)    | useContentRect() (render) |
| Text Measurement | `getComputedStyle`, canvas | Custom measurer           |
| Output           | DOM mutations              | Canvas/WebGL/DOM          |

### Value Assessment for Web

**High value for:**

- Canvas/WebGL apps (games, data viz, design tools)
- Heavy virtualization (spreadsheets, infinite lists)
- Custom layout algorithms (constraint-based, force-directed)

**Medium value for:**

- Complex dashboards with many resizing panels
- Apps that need predictable frame timing

**Low value for (CSS is better):**

- Standard web apps (CSS flexbox/grid is optimized)
- Text-heavy content (browser text layout is sophisticated)
- Accessibility (browser handles a11y tree)

## Plugin Composition Architecture

Status tracking for the plugin system described in [Event Handling Level 4](guides/event-handling.md#level-4-app-plugins).

| Feature                                                | Guide Reference                                            | Status      |
| ------------------------------------------------------ | ---------------------------------------------------------- | ----------- |
| Individual plugins (withDomEvents, withCommands, etc.) | Event Handling L2-3                                        | Implemented |
| createApp() + centralized key handler                  | State Management L2                                        | Implemented |
| Unified pipe() composition                             | Event Handling L4                                          | Planned     |
| Typed dispatch proxy                                   | Event Handling L4                                          | Planned     |
| app.subscribe() with selector reactions                | Event Handling L4                                          | Planned     |
| Plugin-scoped cleanup via DisposableStack              | Event Handling L4                                          | Planned     |
| Effect combinators (debounce, throttle, delay)         | [Architecture Enables](deep-dives/architecture-enables.md) | Planned     |

## See Also

- [architecture.md](deep-dives/architecture.md) - Core architecture and RenderAdapter interface
- [design.md](design/design.md) - Terminal implementation details
- [performance.md](deep-dives/performance.md) - Performance characteristics
