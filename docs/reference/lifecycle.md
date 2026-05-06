# Terminal Lifecycle

Silvery handles terminal lifecycle events (suspend/resume, interrupt) automatically. When stdin is in raw mode, Ctrl+Z and Ctrl+C don't generate OS signals (SIGTSTP/SIGINT). Silvery intercepts the raw bytes and manages the full terminal state save/restore cycle.

## Quick Start

Both `run()` (Layer 2) and `createApp().run()` (Layer 3) enable lifecycle handling by default:

```tsx
// Ctrl+Z suspends, Ctrl+C exits — no config needed
await run(<App />)
```

## Options

| Option           | Type                    | Default | Description                                    |
| ---------------- | ----------------------- | ------- | ---------------------------------------------- |
| `suspendOnCtrlZ` | `boolean`               | `true`  | Handle Ctrl+Z by suspending the process        |
| `exitOnCtrlC`    | `boolean`               | `true`  | Handle Ctrl+C by exiting                       |
| `onSuspend`      | `() => boolean \| void` | —       | Called before suspend. Return false to prevent |
| `onResume`       | `() => void`            | —       | Called after resume                            |
| `onInterrupt`    | `() => boolean \| void` | —       | Called on Ctrl+C. Return false to prevent exit |

## Suspend/Resume Flow

When the user presses Ctrl+Z:

1. `onSuspend` hook is called (if provided). If it returns `false`, suspend is cancelled.
2. Terminal state is captured (protocols, modes, cursor visibility).
3. Terminal is restored to normal: raw mode off, alt screen exit, cursor shown, all protocols disabled.
4. `SIGTSTP` is sent to the process (it actually suspends).
5. On `SIGCONT` (resume): terminal state is restored, screen is cleared, synthetic resize triggers full redraw.
6. `onResume` hook is called.

### Protocols Saved/Restored

- Raw mode (stdin)
- Alternate screen buffer (DEC mode 1049)
- Cursor visibility (DEC mode 25)
- Mouse tracking (modes 1003, 1006, optional 1016 SGR-Pixels)
- Kitty keyboard protocol (with original flags)
- Bracketed paste (DEC mode 2004)
- SGR attributes (reset on suspend, not restored — redraw handles this)

## Interrupt Flow

When the user presses Ctrl+C:

1. `onInterrupt` hook is called (if provided). If it returns `false`, exit is cancelled.
2. The app's exit function is called, which triggers normal cleanup (unmount, restore terminal, exit).

## Hooks Example

```tsx
await run(<App />, {
  onSuspend: () => {
    // Pause background timers before suspend
    pauseTimers()
  },
  onResume: () => {
    // Refresh data that may have changed while suspended
    refetchData()
  },
  onInterrupt: () => {
    if (hasUnsavedChanges) {
      showConfirmDialog()
      return false // Prevent exit
    }
  },
})
```

## Low-Level API

For custom lifecycle management (e.g., framework integrations), the building blocks are exported from `silvery/runtime`:

```tsx
import {
  captureTerminalState,
  restoreTerminalState,
  resumeTerminalState,
  performSuspend,
  CTRL_C,
  CTRL_Z,
  type TerminalLifecycleOptions,
  type TerminalState,
} from "@silvery/ag-term/runtime"

// Capture current state
const state = captureTerminalState({
  alternateScreen: true,
  mouse: true,
  kitty: true,
  kittyFlags: 3,
  bracketedPaste: true,
})

// Manual suspend/resume
restoreTerminalState(stdout, stdin) // Before suspend
// ... process suspends ...
resumeTerminalState(state, stdout, stdin) // After resume

// Or use the all-in-one helper
performSuspend(state, stdout, stdin, () => {
  console.log("Resumed!")
})
```

### TerminalState

```typescript
interface TerminalState {
  rawMode: boolean
  alternateScreen: boolean
  cursorHidden: boolean
  mouseEnabled: boolean
  kittyEnabled: boolean
  kittyFlags: number
  bracketedPaste: boolean
}
```

## Terminal Compatibility

Suspend/resume works on all terminals that support the standard escape sequences. Tested with:

- Ghostty
- Kitty
- WezTerm
- iTerm2
- Alacritty
- macOS Terminal.app
- tmux / screen (nested sessions work correctly)

## Implementation Notes

- `writeSync` is used for restore sequences during signal handlers (async writes may not complete before suspend)
- The `SIGCONT` handler is registered as a one-time handler BEFORE sending `SIGTSTP`
- Screen clear (`CSI 2 J` + `CSI H`) is always included on resume to ensure a clean slate
- Synthetic resize (`stdout.emit("resize")`) triggers a full redraw after resume
- The runtime's `invalidate()` is called to force a fresh render (not incremental diff)
