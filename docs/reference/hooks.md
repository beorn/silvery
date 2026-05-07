# Hooks

## useBoxRect

Returns the content area dimensions (excluding padding and borders) of the nearest Box ancestor.

```tsx
import { useBoxRect } from "@silvery/ag-term"

function ResponsiveCard() {
  const { width, height, x, y } = useBoxRect()
  return <Text>{`Content area: ${width}x${height} at (${x},${y})`}</Text>
}
```

Components know their size _during_ render, not after — no post-layout effects or prop drilling needed.

## useScrollRect

Returns the absolute screen position and dimensions.

```tsx
import { useScrollRect } from "@silvery/ag-term"

function Tooltip() {
  const { x, y, width, height } = useScrollRect()
  // Position tooltip relative to screen coordinates
}
```

## useInput

Registers a keyboard input handler. Return `"exit"` to exit the app.

```tsx
import { useInput, type Key } from "@silvery/ag-term/runtime"

function App() {
  useInput((input: string, key: Key) => {
    if (input === "j" || key.downArrow) moveCursor(1)
    if (input === "k" || key.upArrow) moveCursor(-1)
    if (input === "q") return "exit"
  })
}
```

### Key Object

```typescript
interface Key {
  // Navigation
  upArrow: boolean
  downArrow: boolean
  leftArrow: boolean
  rightArrow: boolean
  pageUp: boolean
  pageDown: boolean
  home: boolean
  end: boolean

  // Action keys
  return: boolean
  escape: boolean
  tab: boolean
  backspace: boolean
  delete: boolean

  // Modifiers — always available
  ctrl: boolean // ⌃ Ctrl
  shift: boolean // ⇧ Shift
  meta: boolean // ⌥ Opt/Alt

  // Modifiers — require Kitty protocol (auto-enabled by run() on supported terminals)
  super: boolean // ⌘ Cmd/Super
  hyper: boolean // ✦ Hyper

  // Kitty protocol extensions
  eventType?: 1 | 2 | 3 // 1=press, 2=repeat, 3=release (requires REPORT_EVENTS flag)
}
```

**Modifier symbols**: Use macOS symbols in `parseHotkey()` for concise hotkey definitions:

```tsx
import { parseHotkey, matchHotkey } from "@silvery/ag-term"

const save = parseHotkey("⌘s")
const palette = parseHotkey("⌃⇧p")
const hyperJump = parseHotkey("✦j")

useInput((input, key) => {
  if (matchHotkey(save, key, input)) save()
  if (matchHotkey(palette, key, input)) openPalette()
})
```

See [Input Features](input-features.md) for the full modifier reference, mouse events, and Kitty protocol details.

### Options

| Option      | Type                                | Default | Description                                      |
| ----------- | ----------------------------------- | ------- | ------------------------------------------------ |
| `isActive`  | `boolean`                           | `true`  | Enable/disable input handling                    |
| `onPaste`   | `(text: string) => void`            | --      | Callback for bracketed paste events              |
| `onRelease` | `(input: string, key: Key) => void` | --      | Callback for key release events (Kitty protocol) |

### Key Release Events

When the Kitty protocol is enabled with `REPORT_EVENTS`, every keystroke produces both press and release events. By default, `useInput` silently drops release events to preserve press-only semantics for the main handler.

To handle release events, pass an `onRelease` callback:

```tsx
useInput(
  (input, key) => {
    if (input === " ") setScrolling(true) // Space press starts scrolling
  },
  {
    onRelease: (input, key) => {
      if (input === " ") setScrolling(false) // Space release stops scrolling
    },
  },
)
```

The `onRelease` callback receives the same `(input, key)` arguments as the main handler, with `key.eventType === "release"`.

## useApp

Access app-level controls:

```tsx
import { useApp } from "@silvery/ag-term"

function App() {
  const { exit, panic } = useApp()

  useInput((input) => {
    if (input === "q") exit()
    if (input === "P") panic("fatal provider invariant", { title: "my-app" })
  })
}
```

With Layer 3 (createApp), `useApp` also accesses the Zustand store:

```tsx
const cursor = useApp((s) => s.cursor)
```

## useTerm

Access terminal capabilities and styling:

```tsx
import { useTerm } from "@silvery/ag-term"

function StatusLine() {
  const term = useTerm()

  return (
    <Text>
      {term.caps.colorLevel ? term.green("OK") : "OK"}
      {` ${term.cols}x${term.rows}`}
    </Text>
  )
}
```

## useFocusable

Makes a component focusable within the tree-based focus system. Reads focus state from `FocusManager` via `useSyncExternalStore`.

The component must have a `testID` prop and `focusable` on its Box ancestor. Optionally set `autoFocus` for initial focus on mount.

```tsx
import { useFocusable } from "@silvery/ag-term"

function FocusablePanel() {
  const { focused, focus, blur, focusOrigin } = useFocusable()
  return (
    <Box testID="panel" focusable borderStyle="single" borderColor={focused ? "green" : "gray"}>
      <Text>{focused ? "Focused!" : "Click to focus"}</Text>
    </Box>
  )
}
```

| Return        | Type                                              | Description                        |
| ------------- | ------------------------------------------------- | ---------------------------------- |
| `focused`     | `boolean`                                         | Whether this node is focused       |
| `focus`       | `() => void`                                      | Focus this node programmatically   |
| `blur`        | `() => void`                                      | Remove focus from this node        |
| `focusOrigin` | `"keyboard" \| "mouse" \| "programmatic" \| null` | How focus was most recently gained |

## useFocusWithin

Returns `true` if focus is anywhere within a subtree. Walks from the focused node up to check if it passes through the given `testID`.

```tsx
import { useFocusWithin } from "@silvery/ag-term"

function Sidebar() {
  const hasFocus = useFocusWithin("sidebar")
  return (
    <Box testID="sidebar" borderColor={hasFocus ? "blue" : "gray"}>
      <FocusableItem testID="item1" />
      <FocusableItem testID="item2" />
    </Box>
  )
}
```

## useFocus (Ink-Compatible)

Ink-compatible wrapper around `useFocusable`. Returns `{ isFocused }` instead of `{ focused }`.

```tsx
import { useFocus } from "@silvery/ag-term"

function FocusableItem() {
  const { isFocused } = useFocus()
  return (
    <Box testID="item" focusable>
      <Text color={isFocused ? "green" : "white"}>Item</Text>
    </Box>
  )
}
```

| Option      | Type      | Description                                            |
| ----------- | --------- | ------------------------------------------------------ |
| `autoFocus` | `boolean` | Auto-focus on mount (use Box `autoFocus` prop instead) |
| `isActive`  | `boolean` | Accepted for API compatibility (not wired through)     |
| `id`        | `string`  | Accepted for API compatibility (use `testID` prop)     |

For new code, prefer `useFocusable()` which returns richer state (`focused`, `focus()`, `blur()`, `focusOrigin`).

## useInkFocusManager (Ink-Compatible)

Ink-compatible wrapper around `useFocusManager`. Provides the same API shape as Ink's `useFocusManager`.

```tsx
import { useInkFocusManager } from "@silvery/ag-term"

function Navigation() {
  const { focusNext, focusPrevious } = useInkFocusManager()

  useInput((input, key) => {
    if (key.tab && key.shift) focusPrevious()
    else if (key.tab) focusNext()
  })

  return <Text>Tab to navigate</Text>
}
```

| Return          | Type                   | Description                            |
| --------------- | ---------------------- | -------------------------------------- |
| `focusNext`     | `() => void`           | Focus the next focusable element       |
| `focusPrevious` | `() => void`           | Focus the previous focusable element   |
| `focus`         | `(id: string) => void` | Focus a specific element by ID         |
| `enableFocus`   | `() => void`           | No-op (kept for Ink API compatibility) |
| `disableFocus`  | `() => void`           | No-op (kept for Ink API compatibility) |

For new code, prefer `useFocusManager()` which returns the full Silvery focus manager API.

## usePaste

Receives bracketed paste events. Only available in the `run()` runtime (Layer 2).

```tsx
import { usePaste } from "@silvery/ag-term/runtime"

function Editor() {
  usePaste((text) => {
    insertText(text)
  })

  return <Text>{content}</Text>
}
```

The handler receives the full pasted text as a single string, rather than individual keystrokes. The runtime automatically enables bracketed paste mode.

For the `render()` API (Layer 1), use the `onPaste` option on `useInput` instead:

```tsx
import { useInput } from "@silvery/ag-term"

useInput(handler, {
  onPaste: (text) => insertText(text),
})
```

## useAnimation

Drive a 0-to-1 animation over a duration with easing. Targets ~30fps (33ms interval) since terminals don't benefit from higher refresh rates.

```tsx
import { useAnimation } from "@silvery/ag-term"

function FadeIn({ children }) {
  const { value, isAnimating, reset } = useAnimation({
    duration: 300,
    easing: "easeOut",
  })
  return <Text dimColor={value < 1}>{children}</Text>
}
```

| Option       | Type                     | Default    | Description                         |
| ------------ | ------------------------ | ---------- | ----------------------------------- |
| `duration`   | `number`                 | --         | Duration in milliseconds (required) |
| `easing`     | `EasingName \| EasingFn` | `"linear"` | Easing function or preset name      |
| `delay`      | `number`                 | `0`        | Delay before starting (ms)          |
| `onComplete` | `() => void`             | --         | Called when animation completes     |
| `enabled`    | `boolean`                | `true`     | Whether to run the animation        |

| Return        | Type         | Description                            |
| ------------- | ------------ | -------------------------------------- |
| `value`       | `number`     | Current progress (0 to 1, eased)       |
| `isAnimating` | `boolean`    | Whether the animation is still running |
| `reset`       | `() => void` | Reset and replay the animation         |

**Easing presets** (`easings` object): `linear`, `ease`, `easeIn`, `easeOut`, `easeInOut`, `easeInCubic`, `easeOutCubic`. Pass a custom `(t: number) => number` function for others.

## useAnimatedTransition

Smoothly interpolate between numeric values. When the target changes, animates from the current position to the new target. If the target changes mid-animation, restarts from the current interpolated position.

```tsx
import { useAnimatedTransition } from "@silvery/ag-term"

function ScrollOffset({ target }) {
  const smooth = useAnimatedTransition(target, { duration: 200, easing: "easeOut" })
  return <Box marginTop={Math.round(smooth)}>...</Box>
}
```

| Parameter     | Type                     | Default     | Description                    |
| ------------- | ------------------------ | ----------- | ------------------------------ |
| `targetValue` | `number`                 | --          | Target value to animate toward |
| `duration`    | `number`                 | `300`       | Duration in milliseconds       |
| `easing`      | `EasingName \| EasingFn` | `"easeOut"` | Easing function or preset name |

Returns the current interpolated `number`. On first render, returns the target value immediately (no animation).

## useInterval

Run a callback on a fixed interval. Uses a ref for the callback to avoid stale closures (Dan Abramov's pattern). The callback is NOT called on mount -- only on subsequent ticks.

```tsx
import { useInterval } from "@silvery/ag-term"

function Clock() {
  const [time, setTime] = useState(Date.now())
  useInterval(() => setTime(Date.now()), 1000)
  return <Text>{new Date(time).toLocaleTimeString()}</Text>
}
```

| Parameter  | Type         | Default | Description                    |
| ---------- | ------------ | ------- | ------------------------------ |
| `callback` | `() => void` | --      | Function to call on each tick  |
| `ms`       | `number`     | --      | Interval in milliseconds       |
| `enabled`  | `boolean`    | `true`  | Whether the interval is active |

## useScrollRegion

Terminal scroll region optimization hook. When scroll offset changes, uses DECSTBM to natively shift content instead of re-rendering the entire area. See [Scroll Region Optimization](scroll-regions.md) for full details.

```tsx
import { useScrollRegion } from "@silvery/ag-term/hooks"

function ScrollableArea({ items, scrollOffset }) {
  const { isActive, scrollDelta } = useScrollRegion({
    top: 2,
    bottom: 20,
    scrollOffset,
  })
  return <VirtualList items={items} />
}
```

| Option         | Type                 | Default          | Description             |
| -------------- | -------------------- | ---------------- | ----------------------- |
| `top`          | `number`             | --               | Top row (0-indexed)     |
| `bottom`       | `number`             | --               | Bottom row (0-indexed)  |
| `scrollOffset` | `number`             | --               | Current scroll position |
| `enabled`      | `boolean`            | auto-detect      | Force on/off            |
| `stdout`       | `NodeJS.WriteStream` | `process.stdout` | Output stream           |

| Return        | Type      | Description                                  |
| ------------- | --------- | -------------------------------------------- |
| `isActive`    | `boolean` | Whether scroll region optimization is active |
| `scrollDelta` | `number`  | Lines shifted since last render              |

## useScrollback

Push frozen items to terminal scrollback. Tracks a contiguous frozen prefix — when the count increases, renders newly frozen items and writes them to stdout.

Pair with VirtualList's `virtualized` prop for the complete experience.

```tsx
import { useScrollback } from "@silvery/ag-term"

const frozenCount = useScrollback(items, {
  frozen: (item) => item.complete,
  render: (item) => `  ✓ ${item.title}`,
  width: terminalWidth,
})
```

| Option    | Type                                   | Description                                      |
| --------- | -------------------------------------- | ------------------------------------------------ |
| `frozen`  | `(item: T, index: number) => boolean`  | Predicate for frozen items                       |
| `render`  | `(item: T, index: number) => string`   | Render item to string for stdout                 |
| `stdout`  | `{ write(data: string): boolean }`     | Output stream (default: `process.stdout`)        |
| `markers` | `boolean \| ScrollbackMarkerCallbacks` | OSC 133 semantic markers for terminal navigation |
| `width`   | `number`                               | Terminal width — enables resize re-emission      |

Returns the current frozen count (contiguous prefix length).

**Requires inline mode** — scrollback only exists in the normal screen buffer.

### Resize Re-emission

When `width` is provided and changes, useScrollback clears the visible screen and re-emits all frozen items at the new width. This is necessary because the output phase clears the entire visible screen on resize, which would otherwise wipe visible frozen items.

This is O(1) on normal frames (width unchanged) and O(N) renderStringSync on resize (infrequent).

### DECAWM Handling

All stdout writes use `\r\n` instead of bare `\n` to cancel the terminal's pending-wrap state. When a line fills exactly the terminal width, the cursor enters pending-wrap; a bare `\n` would cause a double line advance. `\r` cancels pending-wrap by moving to column 0 first.

### OSC 133 Markers

When `markers: true`, each frozen item is bracketed with OSC 133 prompt/command markers, enabling terminal navigation (Cmd+Up/Down in iTerm2, Kitty, WezTerm, Ghostty). Custom marker callbacks are also supported for per-item control.

## useModifierKeys

Track which modifier keys (Cmd, Ctrl, Alt, Shift) are currently held. Works out of the box — Silvery's default Kitty flags enable modifier-only key reporting, so Cmd hold is detected without any configuration.

```tsx
import { useModifierKeys } from "@silvery/ag-react"

function ModifierDisplay() {
  const { super: cmdHeld, ctrl, alt, shift } = useModifierKeys()
  return (
    <Text>
      Cmd: {String(cmdHeld)}, Ctrl: {String(ctrl)}
    </Text>
  )
}
```

The `enabled` option controls subscription -- when `false`, the component never re-renders from modifier changes. Use this to limit re-renders to only the component that needs modifier state:

```tsx
function HoverTarget() {
  const [hovered, setHovered] = useState(false)
  // Only subscribe when hovered -- zero cost for non-hovered elements
  const { super: cmdHeld } = useModifierKeys({ enabled: hovered })
  const armed = hovered && cmdHeld
  // ...
}
```

| Option    | Type      | Default | Description                                  |
| --------- | --------- | ------- | -------------------------------------------- |
| `enabled` | `boolean` | `true`  | Whether to subscribe to modifier key changes |

| Return  | Type      | Description                             |
| ------- | --------- | --------------------------------------- |
| `super` | `boolean` | Super/Cmd key (requires Kitty protocol) |
| `ctrl`  | `boolean` | Ctrl key                                |
| `alt`   | `boolean` | Alt/Option key                          |
| `shift` | `boolean` | Shift key                               |

## useMouseCursor

Set the terminal mouse cursor shape via OSC 22. Resets to default on unmount or when the shape changes to null/undefined. Supported by Ghostty, Kitty (>=0.33), foot, WezTerm (partial). Terminals that don't support OSC 22 safely ignore it.

```tsx
import { useMouseCursor } from "@silvery/ag-react"

function DraggableHandle() {
  const [hovered, setHovered] = useState(false)
  useMouseCursor(hovered ? "move" : null)
  return (
    <Box onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <Text>Drag me</Text>
    </Box>
  )
}
```

Combine with `useModifierKeys` for modifier-aware cursors (as `<Link>` does internally):

```tsx
function ClickableRegion() {
  const [hovered, setHovered] = useState(false)
  const { super: cmdHeld } = useModifierKeys({ enabled: hovered })
  useMouseCursor(hovered && cmdHeld ? "pointer" : null)
  // ...
}
```

| Parameter | Type                                    | Description                              |
| --------- | --------------------------------------- | ---------------------------------------- |
| `shape`   | `MouseCursorShape \| null \| undefined` | Cursor shape to set, or null for default |

Available shapes: `"default"`, `"text"`, `"pointer"`, `"crosshair"`, `"move"`, `"not-allowed"`, `"wait"`, `"help"`.
