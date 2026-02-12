# Focus-Based Input Routing

Prescribed pattern for command-driven apps built on inkx. Routes all keyboard input through a centralized command/keybinding system using context predicates instead of per-component key handlers.

## Problem

Per-component `useInputLayer` handlers for discrete commands (navigation, toggles, modes) have several issues:

1. **Invisible routing**: Key assignments are scattered across component files
2. **Fragile ordering**: Layer stack order determines which handler wins
3. **Duplicate logic**: Multiple components check for the same modes/guards
4. **Not discoverable**: Can't introspect all keybindings for help display or AI automation

## Solution: Context Keys + When Predicates

One `useInput`/`useInputLayer` at the app root bridges raw keys to a command system. Components declare **context state** (e.g., "text input is focused"), and the command system routes keys via **when predicates**.

```
Raw key → App root handler → Command system → When predicates → Action
                                                    ↓
                                          Context from app state
```

### Key Principles

1. **Single key router**: All keys flow through the command system
2. **Context, not layers**: Components set state that activates predicates
3. **Text input is a fallback**: Unmatched keys + `textInputFocused` = insert character
4. **Editing shortcuts are commands**: Backspace, Ctrl+A, Ctrl+W are registered commands
5. **TextEditTarget**: Active text editor registers action methods via shared ref
6. **Discoverable**: All keybindings visible in help, AI introspection, user config

### WhenPredicate

Typed function + `.label` for introspection:

```ts
interface WhenPredicate {
  (ctx: KeybindingContext): boolean
  label: string
}

function when(label: string, fn: (ctx: KeybindingContext) => boolean): WhenPredicate {
  return Object.assign(fn, { label })
}

// Compose predicates
const textInputFocused = when("textInputFocused", (ctx) => ctx.textInputFocused)
const isInDetailPane = when("isInDetailPane", (ctx) => ctx.isInDetailPane)
const notTextInput = not(textInputFocused)
const inMoveAndNotEditing = and(inMoveMode, notTextInput)
```

### Text Input via TextEditTarget

Components that accept text input register a `TextEditTarget` interface on mount:

```ts
interface TextEditTarget {
  insertChar(char: string): void
  deleteBackward(): void
  deleteForward(): void
  cursorLeft(): void
  cursorRight(): void
  cursorStart(): void
  cursorEnd(): void
  deleteWord(): void
  deleteToStart(): void
  deleteToEnd(): void
  confirm(): void
  cancel(): void
}
```

The command system dispatches text editing actions (TEXT_INSERT, TEXT_DELETE_BACKWARD, etc.) to the active target. Text editing shortcuts are registered keybindings with `when: textInputFocused`:

```ts
{ key: "Backspace", commandId: "text.delete_backward", when: textInputFocused },
{ key: "a", ctrl: true, commandId: "text.cursor_start", when: textInputFocused },
{ key: "w", ctrl: true, commandId: "text.delete_word", when: textInputFocused },
```

### Text Insert Priority

When `textInputFocused` is true, printable characters MUST be routed to TEXT_INSERT **before** keybinding resolution. Otherwise, normal-mode bindings (e.g., `-` = decrease content lines) intercept typed characters.

```ts
// In processInkKey():
if (textInputFocused && isPrintable(input) && !hasModifiers) {
  return {
    commandId: "text.insert",
    actions: { type: "TEXT_INSERT", char: input },
  }
}
// Only THEN resolve keybindings
const commandId = resolveKeybinding(key, modifiers, context)
```

## Where useInputLayer Is Still Used

`useInputLayer` remains appropriate for exactly two cases:

1. **App root bridge**: The single base-level handler that receives raw keys and feeds them to the command system
2. **Dialog navigation**: Dialogs (search, project picker) that handle a small set of nav keys (Enter, Escape, arrows) before the command system sees them

Components should **never** use `useInputLayer` for:

- Navigation keys (j/k/h/l) - use keybindings
- Mode-specific keys (Escape in detail pane) - use `when` predicates
- Text editing shortcuts - use TextEditTarget + commands

## Testing

Context-based routing is straightforward to test:

```ts
// Set context state → resolve key → assert command
const ctx = { textInputFocused: true, isInDetailPane: false, ... }
const result = resolveKeybinding("Backspace", {}, ctx)
expect(result).toBe("text.delete_backward")

// Normal mode: same key, different command
const normalCtx = { textInputFocused: false, ... }
const normalResult = resolveKeybinding("Backspace", {}, normalCtx)
expect(normalResult).toBeNull() // No binding without textInputFocused
```

## Comparison: Per-Component vs Focus-Based

| Aspect         | Per-Component (useInputLayer) | Focus-Based (when predicates) |
| -------------- | ----------------------------- | ----------------------------- |
| Key assignment | Scattered across files        | Central keybindings table     |
| Mode handling  | Component checks mode         | Predicate on binding          |
| Text input     | Layer intercepts all keys     | TextEditTarget + fallback     |
| Help display   | Manually maintained           | Auto-generated from bindings  |
| AI automation  | Opaque key sequences          | Command IDs + metadata        |
| Testing        | Mount component + send keys   | Resolve binding from context  |
