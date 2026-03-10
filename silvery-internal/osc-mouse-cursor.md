# OSC 22 Mouse Cursor Shapes

**Bead**: km-silvery.osc-mouse

## Problem

Modern terminal emulators support OSC 22 to change the mouse cursor shape (pointer, text I-beam, crosshair, etc.). Silvery should emit these sequences based on what's under the mouse:

- **I-beam** over text input areas (TextInput, TextArea)
- **Pointer** (hand) over clickable elements (buttons, links, fold toggles)
- **Default** (arrow) everywhere else

This provides visual affordance similar to web CSS `cursor` property, improving UX for mouse-enabled terminal apps.

## Terminal Support

OSC 22 format: `ESC ] 22 ; cursor-name ST`

Where `cursor-name` is one of the X11/CSS cursor names:

- `default` — standard arrow
- `text` — I-beam for text selection
- `pointer` — pointing hand for clickable elements
- `crosshair` — precision selection
- `move` — move/drag indicator
- `not-allowed` — disabled/unavailable
- `wait` — busy spinner
- `help` — question mark

**Supported by**: Ghostty (full), Kitty (>=0.33), foot, WezTerm (partial). Not supported by iTerm2, Terminal.app, or most older terminals. Unsupported terminals safely ignore the sequence.

**Stack/pop**: Some terminals support push/pop semantics:

- `ESC ] 22 ; cursor-name ST` — push cursor
- `ESC ] 22 ; ST` — pop cursor (restore previous)

## Proposed API

### Layer 1: Low-level escape functions (`@silvery/term/output`)

```ts
/** Set the mouse cursor shape via OSC 22 */
export function setMouseCursor(shape: MouseCursorShape): string {
  return `\x1b]22;${shape}\x07`;
}

/** Reset the mouse cursor to default via OSC 22 */
export function resetMouseCursor(): string {
  return `\x1b]22;default\x07`;
}

export type MouseCursorShape =
  | "default"
  | "text"
  | "pointer"
  | "crosshair"
  | "move"
  | "not-allowed"
  | "wait"
  | "help";
```

### Layer 2: Component prop (`cursor` on Box)

```tsx
<Box cursor="pointer" onClick={handleClick}>
  <Text>Click me</Text>
</Box>

<Box cursor="text">
  <TextArea height={5} />
</Box>
```

The `cursor` prop declares what mouse cursor shape should be shown when the mouse hovers over this element. It does not emit OSC 22 itself — that's handled by the mouse event processor.

### Layer 3: Automatic cursor tracking (mouse event processor)

The `processMouseEvent()` function already tracks hover state via `mouseenter`/`mouseleave`. Extend it to:

1. On `mousemove`, perform hit testing to find the deepest node.
2. Walk the ancestor path from target to root, checking for `cursor` props.
3. If the resolved cursor differs from the current one, emit `setMouseCursor()`.
4. On app exit/cleanup, emit `resetMouseCursor()`.

### Layer 4: Built-in component defaults

Components should set sensible defaults without requiring explicit props:

| Component        | Default cursor        |
| ---------------- | --------------------- |
| TextInput        | `text`                |
| TextArea         | `text`                |
| Button           | `pointer`             |
| Link             | `pointer`             |
| Toggle           | `pointer`             |
| SelectList items | `pointer`             |
| Everything else  | `default` (inherited) |

This can be implemented by having these components set `cursor` on their root Box, which the hit-test cursor resolution would pick up automatically.

## Implementation Plan

### Phase 1: Escape sequences

- Add `setMouseCursor()`, `resetMouseCursor()`, and `MouseCursorShape` type to `@silvery/term/output`.
- Export from `@silvery/react`.
- No component integration yet — apps can call directly.

### Phase 2: `cursor` prop on Box

- Add `cursor?: MouseCursorShape` to `BoxProps`.
- Store it on the `TeaNode` props (no special reconciler handling needed).
- No automatic emission yet.

### Phase 3: Mouse processor integration

- Extend `MouseEventProcessorState` with `currentCursor: MouseCursorShape`.
- In `processMouseEvent()` on `move` events, resolve the cursor from the hit target's ancestor chain.
- If changed, write `setMouseCursor()` to stdout.
- On cleanup (app exit), emit `resetMouseCursor()`.

### Phase 4: Component defaults

- Add `cursor="text"` to TextInput and TextArea root boxes.
- Add `cursor="pointer"` to Button, Link, Toggle.
- No changes needed for components that should use `default`.

## Key Challenges

1. **Terminal detection**: Not all terminals support OSC 22. Emitting it to unsupported terminals is harmless (ignored), but we should consider adding it to `TerminalCaps` for apps that want to know. This is non-blocking — emit unconditionally since terminals ignore unknown OSC.

2. **Performance**: `mousemove` events can fire very rapidly (every cell the cursor crosses). The cursor resolution must be fast (walk ancestor path, check props — should be O(depth) which is typically <10 nodes).

3. **stdout access**: The mouse processor currently doesn't have direct access to stdout. It returns events and lets the app handle them. For cursor changes, we have options:
   - Add a `write` callback to `MouseEventProcessorOptions`
   - Return the cursor change as a side-channel from `processMouseEvent()`
   - Handle it in the runtime event loop where stdout is available

4. **Cursor inheritance**: Like CSS, `cursor` should cascade from parent to child. The hit-test already walks ancestors, so the first `cursor` prop found wins. `cursor="default"` can be used to reset inheritance.

5. **Cleanup on exit**: Terminal lifecycle (`terminal-lifecycle.ts`) already handles cleanup (alternate screen, cursor visibility, etc.). Add `resetMouseCursor()` to the cleanup sequence.

## Effort Estimate

Small-to-medium. Phase 1 is trivial (2 functions). Phase 2 is a one-line BoxProps addition. Phase 3 is the main work (mouse processor changes + stdout plumbing). Phase 4 is mechanical. Total: ~100-150 lines of implementation code plus tests.
