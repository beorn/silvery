/**
 * Ink compat test: focus (from ink/test/focus.tsx)
 * Tests silvery's Ink-compatible focus management system.
 */
import React, { useEffect } from "react"
import { describe, test, expect } from "vitest"
import { Box, Text, render, useFocus, useFocusManager } from "../../../packages/compat/src/ink"
import createStdout from "./helpers/create-stdout"
import { createStdin, emitReadable } from "./helpers/create-stdin"

// ============================================================================
// Test Components (matching Ink's original test structure)
// ============================================================================

type TestProps = {
  readonly showFirst?: boolean
  readonly disableFirst?: boolean
  readonly disableSecond?: boolean
  readonly disableThird?: boolean
  readonly autoFocus?: boolean
  readonly disabled?: boolean
  readonly focusNext?: boolean
  readonly focusPrevious?: boolean
  readonly unmountChildren?: boolean
}

function Test({
  showFirst = true,
  disableFirst = false,
  disableSecond = false,
  disableThird = false,
  autoFocus = false,
  disabled = false,
  focusNext = false,
  focusPrevious = false,
  unmountChildren = false,
}: TestProps) {
  const focusManager = useFocusManager()

  useEffect(() => {
    if (disabled) {
      focusManager.disableFocus()
    } else {
      focusManager.enableFocus()
    }
  }, [disabled])

  useEffect(() => {
    if (focusNext) {
      focusManager.focusNext()
    }
  }, [focusNext])

  useEffect(() => {
    if (focusPrevious) {
      focusManager.focusPrevious()
    }
  }, [focusPrevious])

  if (unmountChildren) {
    return null
  }

  return (
    <Box flexDirection="column">
      {showFirst ? <Item label="First" autoFocus={autoFocus} disabled={disableFirst} /> : null}
      <Item label="Second" autoFocus={autoFocus} disabled={disableSecond} />
      <Item label="Third" autoFocus={autoFocus} disabled={disableThird} />
    </Box>
  )
}

type ItemProps = {
  readonly label: string
  readonly autoFocus: boolean
  readonly disabled?: boolean
}

function Item({ label, autoFocus, disabled = false }: ItemProps) {
  const { isFocused } = useFocus({
    autoFocus,
    isActive: !disabled,
  })

  return (
    <Text>
      {label} {isFocused ? "\u2714" : null}
    </Text>
  )
}

// ============================================================================
// Tests
// ============================================================================

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("focus", () => {
  test("does not crash when focusing next on unmounted children", async () => {
    const stdout = createStdout()
    const stdin = createStdin()
    const { rerender } = render(<Test autoFocus />, {
      stdout,
      stdin,
      debug: true,
    })

    await delay(50)
    rerender(<Test focusNext unmountChildren />)
    await delay(50)

    expect(stdout.get()).toBe("")
  })

  test("does not crash when focusing previous on unmounted children", async () => {
    const stdout = createStdout()
    const stdin = createStdin()
    const { rerender } = render(<Test autoFocus />, {
      stdout,
      stdin,
      debug: true,
    })

    await delay(50)
    rerender(<Test focusPrevious unmountChildren />)
    await delay(50)

    expect(stdout.get()).toBe("")
  })
})
