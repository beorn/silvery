/**
 * useEditContext Hook
 *
 * React hook wrapping createTermEditContext. Drop-in replacement for
 * useSlateEdit and useLineEdit — same consumer interface, unified
 * EditContext backend.
 *
 * Registers as active edit context on mount, cleans up on unmount.
 * Auto-saves on unmount if value changed and not explicitly cancelled.
 */

import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { createTermEditContext } from "../edit-context"
import type { TermEditContext } from "../edit-context"
import type { TextOp } from "@silvery/create/text-ops"
import { rowColToCursor, countVisualLines } from "@silvery/create/text-cursor"

// =============================================================================
// Types
// =============================================================================

export interface UseEditContextOptions {
  /** Initial text value */
  initialValue?: string
  /** Called when value changes (every keystroke) */
  onChange?: (value: string) => void
  /** Called when Enter is pressed (text.confirm command) */
  onConfirm?: (value: string) => void
  /** Called when exiting edit mode (Escape) */
  onCancel?: () => void
  /** Called when save() is invoked (auto-save on block navigate) */
  onSave?: (value: string) => void
  /** Called when Enter creates a new tree node (split at boundary) */
  onSplitAtBoundary?: (offset: number) => void
  /** Called when Backspace at start needs a tree merge */
  onMergeBackward?: () => void
  /** Available width for visual line wrapping */
  wrapWidth?: number
  /** Initial cursor position */
  initialCursorPos?: "start" | "end" | number
  /** Preferred cursor column preserved across block boundaries (visual column index) */
  stickyX?: number
  /** Called on each text operation (for undo log) */
  onTextOp?: (op: TextOp) => void
}

/**
 * BlockEditTarget-compatible interface.
 *
 * Methods match the existing BlockEditTarget type from km-tui so that
 * board-actions.ts can call them without changes. This is defined here
 * (in silvery, a lower layer) to avoid importing from km-tui.
 */
export interface EditTarget {
  insertChar(char: string): void
  deleteBackward(): void
  deleteForward(): void
  cursorLeft(): void
  cursorRight(): void
  cursorUp(): boolean
  cursorDown(): boolean
  cursorStart(): void
  cursorEnd(): void
  deleteWord(): void
  deleteToStart(): void
  deleteToEnd(): void
  confirm(): void
  cancel(): void
  save(): void
  getCursorOffset(): number
  getContent(): string
  insertBreak(): boolean
  replaceContent(content: string, cursor: number): void
  /** Set cursor position from external source (e.g. mouse click) */
  setCursorOffset(offset: number): void
}

export interface UseEditContextResult {
  /** Current text value */
  value: string
  /** Cursor position (character offset) */
  cursor: number
  /** Text before cursor (for rendering) */
  beforeCursor: string
  /** Text after cursor (for rendering) */
  afterCursor: string
  /** Clear the input */
  clear: () => void
  /** Set value programmatically */
  setValue: (value: string) => void
  /** The underlying TermEditContext (for advanced usage) */
  editContext: TermEditContext
  /** BlockEditTarget-compatible object for command system integration */
  target: EditTarget
  /** Set cursor position from external source (e.g. mouse click) */
  setCursorOffset: (offset: number) => void
}

/**
 * Stack of currently mounted edit contexts (last mounted = top of stack).
 */
export const activeEditContextStack: TermEditContext[] = []

/**
 * Stack of currently mounted edit targets (last mounted = top of stack).
 */
export const activeEditTargetStack: EditTarget[] = []

let _currentContext: TermEditContext | null = null
let _currentTarget: EditTarget | null = null

/**
 * Returns true when any edit context is currently mounted and active.
 */
export function hasActiveEditContext(): boolean {
  return activeEditContextStack.length > 0 || _currentContext !== null
}

/**
 * Determines whether Tab / Shift+Tab should cycle focus or pass through to the active editor.
 * Returns false when an EditContext is active (Tab belongs to the text editor).
 */
export function tabCyclesFocus(key?: { tab?: boolean }): boolean {
  if (key && !key.tab) return false
  return !hasActiveEditContext()
}

/**
 * Shared mutable ref for the active edit context.
 * Represents the topmost mounted edit context.
 * Maintained as a stack so unmounting a later editor restores the earlier editor.
 */
export const activeEditContextRef: { current: TermEditContext | null } = {
  get current(): TermEditContext | null {
    if (activeEditContextStack.length > 0) {
      return activeEditContextStack[activeEditContextStack.length - 1] ?? null
    }
    return _currentContext
  },
  set current(val: TermEditContext | null) {
    _currentContext = val
    if (val === null) {
      activeEditContextStack.length = 0
    } else if (!activeEditContextStack.includes(val)) {
      activeEditContextStack.push(val)
    }
  },
}

/**
 * Shared mutable ref for the active edit target.
 * Stores the EditTarget wrapper (BlockEditTarget-compatible methods).
 * board-actions.ts reads this to dispatch text editing commands.
 * Maintained as a stack so unmounting a later editor restores the earlier editor.
 */
export const activeEditTargetRef: { current: EditTarget | null } = {
  get current(): EditTarget | null {
    if (activeEditTargetStack.length > 0) {
      return activeEditTargetStack[activeEditTargetStack.length - 1] ?? null
    }
    return _currentTarget
  },
  set current(val: EditTarget | null) {
    _currentTarget = val
    if (val === null) {
      activeEditTargetStack.length = 0
    } else if (!activeEditTargetStack.includes(val)) {
      activeEditTargetStack.push(val)
    }
  },
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook wrapping createTermEditContext for React components.
 *
 * Implements the same BlockEditTarget interface as useSlateEdit and
 * useLineEdit, so it's a drop-in replacement for the command system.
 *
 * Key behaviors:
 * - Creates a stable TermEditContext on mount
 * - Registers as active edit context (via activeEditContextRef)
 * - Subscribes to text updates for re-rendering
 * - Auto-saves on unmount if value changed and not explicitly cancelled
 * - Exposes BlockEditTarget-compatible methods for board-actions.ts
 *
 * WARNING — Auto-save on unmount:
 * This hook fires onConfirm on unmount if cancelledRef is not set.
 * For inline editing fields (navigate away = save), this is correct.
 * For DIALOGS, this causes double-confirm bugs — the dialog closes
 * (unmount), then auto-save fires onConfirm again.
 *
 * Dialog components MUST use useDialogInput (km-tui) instead of this
 * hook directly. useDialogInput never passes onConfirm/onCancel here,
 * making the auto-save inert. See km-qaco9 for the full root cause.
 */
export function useEditContext({
  initialValue = "",
  onChange,
  onConfirm,
  onCancel,
  onSave,
  onSplitAtBoundary,
  onMergeBackward,
  wrapWidth,
  initialCursorPos,
  stickyX,
  onTextOp,
}: UseEditContextOptions = {}): UseEditContextResult {
  // Stable refs for callbacks (avoid stale closures)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onConfirmRef = useRef(onConfirm)
  onConfirmRef.current = onConfirm
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const onSplitRef = useRef(onSplitAtBoundary)
  onSplitRef.current = onSplitAtBoundary
  const onMergeBackwardRef = useRef(onMergeBackward)
  onMergeBackwardRef.current = onMergeBackward
  const onTextOpRef = useRef(onTextOp)
  onTextOpRef.current = onTextOp

  // Track whether cancel was called (suppresses auto-save on unmount)
  const cancelledRef = useRef(false)
  const initialValueRef = useRef(initialValue)

  // Force re-render counter — bumped on every text/cursor change
  const [_version, setVersion] = useState(0)
  const forceRender = useCallback(() => setVersion((v) => v + 1), [])

  // Create TermEditContext (stable across renders)
  const ctx = useMemo(() => {
    const effectiveWrapWidth = wrapWidth ?? Infinity
    let cursorPos: number
    if (stickyX != null && initialValue.length > 0) {
      if (typeof initialCursorPos === "number") {
        cursorPos = Math.max(0, Math.min(initialCursorPos, initialValue.length))
      } else {
        const targetRow =
          initialCursorPos === "start"
            ? 0
            : Math.max(0, countVisualLines(initialValue, effectiveWrapWidth) - 1)
        cursorPos = rowColToCursor(initialValue, targetRow, stickyX, effectiveWrapWidth)
      }
    } else {
      cursorPos =
        typeof initialCursorPos === "number"
          ? Math.max(0, Math.min(initialCursorPos, initialValue.length))
          : initialCursorPos === "start"
            ? 0
            : initialValue.length
    }
    return createTermEditContext({
      text: initialValue,
      selectionStart: cursorPos,
      selectionEnd: cursorPos,
      wrapWidth: effectiveWrapWidth,
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- intentionally stable

  // Subscribe to text updates for onChange, onTextOp, and re-rendering
  useLayoutEffect(() => {
    const unsub = ctx.onTextUpdate((op: TextOp) => {
      onChangeRef.current?.(ctx.text)
      onTextOpRef.current?.(op)
      forceRender()
    })
    return unsub
  }, [ctx, forceRender])

  // Update wrapWidth when it changes
  useEffect(() => {
    if (wrapWidth !== undefined) {
      ctx.setWrapWidth(wrapWidth)
    }
  }, [wrapWidth, ctx])

  // Build BlockEditTarget-compatible object for board-actions.ts
  const target = useMemo(
    () => ({
      insertChar(char: string) {
        ctx.insertChar(char)
      },
      deleteBackward() {
        ctx.deleteBackward()
      },
      deleteForward() {
        ctx.deleteForward()
      },
      cursorLeft() {
        ctx.moveCursor("left")
        forceRender()
      },
      cursorRight() {
        ctx.moveCursor("right")
        forceRender()
      },
      cursorUp(): boolean {
        const moved = ctx.moveCursor("up")
        if (moved) forceRender()
        return moved
      },
      cursorDown(): boolean {
        const moved = ctx.moveCursor("down")
        if (moved) forceRender()
        return moved
      },
      cursorStart() {
        ctx.setCursorOffset(0)
        forceRender()
      },
      cursorEnd() {
        ctx.setCursorOffset(ctx.text.length)
        forceRender()
      },
      deleteWord() {
        ctx.deleteWord()
      },
      deleteToStart() {
        ctx.deleteToStart()
      },
      deleteToEnd() {
        ctx.deleteToEnd()
      },
      confirm() {
        cancelledRef.current = true
        onConfirmRef.current?.(ctx.text)
      },
      cancel() {
        cancelledRef.current = true
        onCancelRef.current?.()
      },
      save() {
        const fn = onSaveRef.current ?? onConfirmRef.current
        fn?.(ctx.text)
        initialValueRef.current = ctx.text
      },
      getCursorOffset() {
        return ctx.selectionStart
      },
      getContent() {
        return ctx.text
      },
      insertBreak(): boolean {
        // Signal that this editor supports outliner-style Enter (split/new sibling).
        // The actual node creation is handled by TEXT_LINEBREAK_* actions in board-actions.ts.
        return !!onSplitRef.current
      },
      replaceContent(content: string, cursor: number) {
        // Replace entire text and set cursor position
        ctx.updateText(0, ctx.text.length, content)
        ctx.setCursorOffset(cursor)
        initialValueRef.current = content
        forceRender()
      },
      setCursorOffset(offset: number) {
        ctx.setCursorOffset(Math.min(Math.max(0, offset), ctx.text.length))
        forceRender()
      },
    }),
    [ctx, forceRender],
  )

  // Register as active edit context + target on mount, clean up on unmount.
  // useLayoutEffect ensures registration happens before the next input event.
  useLayoutEffect(() => {
    activeEditContextStack.push(ctx)
    activeEditTargetStack.push(target)
    return () => {
      const ctxIdx = activeEditContextStack.lastIndexOf(ctx)
      if (ctxIdx !== -1) {
        activeEditContextStack.splice(ctxIdx, 1)
      }
      const targetIdx = activeEditTargetStack.lastIndexOf(target)
      if (targetIdx !== -1) {
        activeEditTargetStack.splice(targetIdx, 1)
      }
      // Auto-save on unmount if value was modified and not explicitly cancelled
      if (!cancelledRef.current) {
        const currentValue = ctx.text
        if (currentValue !== initialValueRef.current) {
          onConfirmRef.current?.(currentValue)
        }
      }
    }
  }, [ctx, target])

  // Derive display values from TermEditContext
  const text = ctx.text
  const cursorPos = ctx.selectionStart
  const beforeCursor = text.slice(0, cursorPos)
  const afterCursor = text.slice(cursorPos)

  return {
    value: text,
    cursor: cursorPos,
    beforeCursor,
    afterCursor,
    clear: useCallback(() => {
      ctx.updateText(0, ctx.text.length, "")
      ctx.setCursorOffset(0)
      onChangeRef.current?.("")
      forceRender()
    }, [ctx, forceRender]),
    setValue: useCallback(
      (value: string) => {
        ctx.updateText(0, ctx.text.length, value)
        ctx.setCursorOffset(value.length)
        onChangeRef.current?.(value)
        forceRender()
      },
      [ctx, forceRender],
    ),
    editContext: ctx,
    target,
    setCursorOffset: useCallback(
      (offset: number) => {
        ctx.setCursorOffset(Math.min(Math.max(0, offset), ctx.text.length))
        forceRender()
      },
      [ctx, forceRender],
    ),
  }
}
