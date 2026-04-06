/**
 * useCopyMode — React hook for keyboard-driven copy-mode.
 *
 * Manages copy-mode state via the TEA state machine from @silvery/headless/copy-mode.
 * When active, captures h/j/k/l for navigation, v/V for visual mode, y for yank.
 */

import { useCallback, useState } from "react"
import {
  type CopyModeState,
  type CopyModeEffect,
  type CopyModePosition,
  type CopyModeBuffer,
  createCopyModeState,
  copyModeUpdate,
} from "@silvery/headless/copy-mode"

// ============================================================================
// Types
// ============================================================================

export interface UseCopyModeOptions {
  /** Called when the yank effect fires (should copy text and put it on clipboard) */
  onCopy?: (anchor: CopyModePosition, head: CopyModePosition, lineWise: boolean) => void
  /** Called to update the selection display */
  onSetSelection?: (anchor: CopyModePosition, head: CopyModePosition, lineWise: boolean) => void
  /** Called when auto-scroll is needed (cursor at buffer edge) */
  onScroll?: (direction: "up" | "down", amount: number) => void
}

export interface UseCopyModeResult {
  /** Current copy-mode state */
  copyModeState: CopyModeState
  /** Enter copy-mode at a given buffer position */
  enter(col: number, row: number, bufferWidth: number, bufferHeight: number): void
  /** Exit copy-mode */
  exit(): void
  /** Move cursor in a direction */
  move(direction: "up" | "down" | "left" | "right"): void
  /** Move cursor forward by word (w) */
  moveWordForward(buffer?: CopyModeBuffer): void
  /** Move cursor backward by word (b) */
  moveWordBackward(buffer?: CopyModeBuffer): void
  /** Move cursor to end of word (e) */
  moveWordEnd(buffer?: CopyModeBuffer): void
  /** Move cursor to line start (0) */
  moveToLineStart(): void
  /** Move cursor to line end ($) */
  moveToLineEnd(): void
  /** Toggle character-wise visual mode */
  visual(): void
  /** Toggle line-wise visual mode */
  visualLine(): void
  /** Yank (copy) the visual selection and exit */
  yank(): void
}

// ============================================================================
// Hook
// ============================================================================

export function useCopyMode(options?: UseCopyModeOptions): UseCopyModeResult {
  const [state, setState] = useState<CopyModeState>(createCopyModeState)

  const processEffects = useCallback(
    (effects: CopyModeEffect[]) => {
      for (const effect of effects) {
        switch (effect.type) {
          case "copy":
            options?.onCopy?.(effect.anchor, effect.head, effect.lineWise)
            break
          case "setSelection":
            options?.onSetSelection?.(effect.anchor, effect.head, effect.lineWise)
            break
          case "scroll":
            options?.onScroll?.(effect.direction, effect.amount)
            break
          // "render" effects are handled by React re-render from setState
        }
      }
    },
    [options],
  )

  const enter = useCallback(
    (col: number, row: number, bufferWidth: number, bufferHeight: number) => {
      setState((prev) => {
        const [next, effects] = copyModeUpdate({ type: "enter", col, row, bufferWidth, bufferHeight }, prev)
        processEffects(effects)
        return next
      })
    },
    [processEffects],
  )

  const exit = useCallback(() => {
    setState((prev) => {
      const [next, effects] = copyModeUpdate({ type: "exit" }, prev)
      processEffects(effects)
      return next
    })
  }, [processEffects])

  const move = useCallback(
    (direction: "up" | "down" | "left" | "right") => {
      setState((prev) => {
        const [next, effects] = copyModeUpdate({ type: "move", direction }, prev)
        processEffects(effects)
        return next
      })
    },
    [processEffects],
  )

  const moveToLineStart = useCallback(() => {
    setState((prev) => {
      const [next, effects] = copyModeUpdate({ type: "moveToLineStart" }, prev)
      processEffects(effects)
      return next
    })
  }, [processEffects])

  const moveToLineEnd = useCallback(() => {
    setState((prev) => {
      const [next, effects] = copyModeUpdate({ type: "moveToLineEnd" }, prev)
      processEffects(effects)
      return next
    })
  }, [processEffects])

  const visual = useCallback(() => {
    setState((prev) => {
      const [next, effects] = copyModeUpdate({ type: "visual" }, prev)
      processEffects(effects)
      return next
    })
  }, [processEffects])

  const visualLine = useCallback(() => {
    setState((prev) => {
      const [next, effects] = copyModeUpdate({ type: "visualLine" }, prev)
      processEffects(effects)
      return next
    })
  }, [processEffects])

  const moveWordForward = useCallback(
    (buffer?: CopyModeBuffer) => {
      setState((prev) => {
        const [next, effects] = copyModeUpdate({ type: "moveWordForward", buffer }, prev)
        processEffects(effects)
        return next
      })
    },
    [processEffects],
  )

  const moveWordBackward = useCallback(
    (buffer?: CopyModeBuffer) => {
      setState((prev) => {
        const [next, effects] = copyModeUpdate({ type: "moveWordBackward", buffer }, prev)
        processEffects(effects)
        return next
      })
    },
    [processEffects],
  )

  const moveWordEnd = useCallback(
    (buffer?: CopyModeBuffer) => {
      setState((prev) => {
        const [next, effects] = copyModeUpdate({ type: "moveWordEnd", buffer }, prev)
        processEffects(effects)
        return next
      })
    },
    [processEffects],
  )

  const yank = useCallback(() => {
    setState((prev) => {
      const [next, effects] = copyModeUpdate({ type: "yank" }, prev)
      processEffects(effects)
      return next
    })
  }, [processEffects])

  return {
    copyModeState: state,
    enter,
    exit,
    move,
    moveWordForward,
    moveWordBackward,
    moveWordEnd,
    moveToLineStart,
    moveToLineEnd,
    visual,
    visualLine,
    yank,
  }
}
