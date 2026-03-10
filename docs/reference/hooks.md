# Hooks

## useContentRect

Returns the content area dimensions (excluding padding and borders) of the nearest Box ancestor.

```tsx
import { useContentRect } from "@silvery/term"

function ResponsiveCard() {
  const { width, height, x, y } = useContentRect()
  return <Text>{`Content area: ${width}x${height} at (${x},${y})`}</Text>
}
```

Components know their size _during_ render, not after — no post-layout effects or prop drilling needed.

## useScreenRect

Returns the absolute screen position and dimensions.

```tsx
import { useScreenRect } from "@silvery/term"

function Tooltip() {
  const { x, y, width, height } = useScreenRect()
  // Position tooltip relative to screen coordinates
}
```

## useInput

Registers a keyboard input handler. Return `"exit"` to exit the app.

```tsx
import { useInput, type Key } from "@silvery/term/runtime"

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

  // Modifiers — require Kitty protocol (pass kitty: true to run())
  super: boolean // ⌘ Cmd/Super
  hyper: boolean // ✦ Hyper

  // Kitty protocol extensions
  eventType?: 1 | 2 | 3 // 1=press, 2=repeat, 3=release (requires REPORT_EVENTS flag)
}
```

**Modifier symbols**: Use macOS symbols in `parseHotkey()` for concise hotkey definitions:

```tsx
import { parseHotkey, matchHotkey } from "@silvery/term"

const save = parseHotkey("⌘s")
const palette = parseHotkey("⌃⇧p")
const hyperJump = parseHotkey("✦j")

useInput((input, key) => {
  if (matchHotkey(save, key, input)) save()
  if (matchHotkey(palette, key, input)) openPalette()
})
```

See [Input Features](input-features.md) for the full modifier reference, mouse events, and Kitty protocol details.

## useApp

Access app-level controls:

```tsx
import { useApp } from "@silvery/term"

function App() {
  const { exit } = useApp()

  useInput((input) => {
    if (input === "q") exit()
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
import { useTerm } from "@silvery/term"

function StatusLine() {
  const term = useTerm()

  return (
    <Text>
      {term.hasColor() ? term.green("OK") : "OK"}
      {` ${term.cols}x${term.rows}`}
    </Text>
  )
}
```

## useFocusable

Makes a component focusable within the tree-based focus system. Reads focus state from `FocusManager` via `useSyncExternalStore`.

The component must have a `testID` prop and `focusable` on its Box ancestor. Optionally set `autoFocus` for initial focus on mount.

```tsx
import { useFocusable } from "@silvery/term"

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
import { useFocusWithin } from "@silvery/term"

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
import { useFocus } from "@silvery/term"

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
import { useInkFocusManager } from "@silvery/term"

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
import { usePaste } from "@silvery/term/runtime"

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
import { useInput } from "@silvery/term"

useInput(handler, {
  onPaste: (text) => insertText(text),
})
```

## useAnimation

Drive a 0-to-1 animation over a duration with easing. Targets ~30fps (33ms interval) since terminals don't benefit from higher refresh rates.

```tsx
import { useAnimation } from "@silvery/term"

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
import { useAnimatedTransition } from "@silvery/term"

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
import { useInterval } from "@silvery/term"

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
import { useScrollRegion } from "@silvery/term/hooks"

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
import { useScrollback } from "@silvery/term"

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
