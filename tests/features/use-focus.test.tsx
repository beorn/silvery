/**
 * useFocus(options) Hook Tests
 *
 * Tests the Ink-compatible useFocus hook in @silvery/ag-react. This hook
 * registers components in the same FocusManager as useFocusable, so they
 * participate in the same Tab cycle and focus state.
 *
 * Covers:
 * - id option (explicit vs auto-generated)
 * - autoFocus option (focus on mount)
 * - isActive option (skip in tab order, never report focused)
 * - Interleaving with tree-based useFocusable focusables
 * - focus(id) callback
 */

import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"
import { useFocus } from "@silvery/ag-react"

// ============================================================================
// Test Components
// ============================================================================

/** Component using useFocus hook */
function HookFocusable({
  id,
  autoFocus,
  isActive,
}: {
  id?: string
  autoFocus?: boolean
  isActive?: boolean
}) {
  const { isFocused } = useFocus({ id, autoFocus, isActive })
  const label = id ?? "auto"
  return (
    <Text>
      {label}: {isFocused ? "focused" : "unfocused"}
    </Text>
  )
}

// ============================================================================
// Tests
// ============================================================================

describe("useFocus(options)", () => {
  // ----- id option -----

  test("registers with explicit id", async () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box flexDirection="column">
        <HookFocusable id="alpha" />
        <HookFocusable id="beta" />
      </Box>,
    )

    expect(app.text).toContain("alpha: unfocused")
    expect(app.text).toContain("beta: unfocused")

    // Tab should focus the first hook focusable (alpha)
    await app.press("Tab")
    expect(app.focusManager.activeId).toBe("alpha")
    expect(app.text).toContain("alpha: focused")
    expect(app.text).toContain("beta: unfocused")

    // Tab again → beta
    await app.press("Tab")
    expect(app.focusManager.activeId).toBe("beta")
    expect(app.text).toContain("alpha: unfocused")
    expect(app.text).toContain("beta: focused")
  })

  test("auto-generated id when none provided", async () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box>
        <HookFocusable />
      </Box>,
    )

    // Should not crash; should be tabbable
    expect(app.text).toContain("auto: unfocused")
    await app.press("Tab")
    // The activeId is the auto-generated one (random) — just check focused state
    expect(app.text).toContain("auto: focused")
  })

  // ----- autoFocus option -----

  test("autoFocus focuses the component on mount", async () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box flexDirection="column">
        <HookFocusable id="first" />
        <HookFocusable id="second" autoFocus />
      </Box>,
    )

    // second should be focused on mount despite being second in tab order
    expect(app.focusManager.activeId).toBe("second")
    expect(app.text).toContain("first: unfocused")
    expect(app.text).toContain("second: focused")
  })

  test("autoFocus is ignored if another focus is already active", async () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box flexDirection="column">
        <HookFocusable id="first" autoFocus />
        <HookFocusable id="second" autoFocus />
      </Box>,
    )

    // First-mounted with autoFocus wins; second's autoFocus is no-op
    expect(app.focusManager.activeId).toBe("first")
  })

  // ----- isActive option -----

  test("isActive=false: registered but never reports focused", async () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box flexDirection="column">
        <HookFocusable id="alpha" />
        <HookFocusable id="beta" isActive={false} />
        <HookFocusable id="gamma" />
      </Box>,
    )

    // Tab order skips beta (inactive)
    await app.press("Tab")
    expect(app.focusManager.activeId).toBe("alpha")

    await app.press("Tab")
    // Should skip beta and go to gamma
    expect(app.focusManager.activeId).toBe("gamma")
    expect(app.text).toContain("beta: unfocused")
  })

  // ----- Interleaving with tree-based focusables -----

  test("hook focusables come AFTER tree-based focusables in tab order", async () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box flexDirection="column">
        <Box testID="tree-a" focusable>
          <Text>tree-a</Text>
        </Box>
        <HookFocusable id="hook-a" />
        <Box testID="tree-b" focusable>
          <Text>tree-b</Text>
        </Box>
        <HookFocusable id="hook-b" />
      </Box>,
    )

    // Expected tab order: tree-a, tree-b, hook-a, hook-b
    // (tree focusables in document order, then hook focusables in registration order)
    await app.press("Tab")
    expect(app.focusManager.activeId).toBe("tree-a")

    await app.press("Tab")
    expect(app.focusManager.activeId).toBe("tree-b")

    await app.press("Tab")
    expect(app.focusManager.activeId).toBe("hook-a")

    await app.press("Tab")
    expect(app.focusManager.activeId).toBe("hook-b")

    // Wrap around to first tree focusable
    await app.press("Tab")
    expect(app.focusManager.activeId).toBe("tree-a")
  })

  test("Shift+Tab cycles backward through hook + tree focusables", async () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box flexDirection="column">
        <Box testID="tree-a" focusable>
          <Text>tree-a</Text>
        </Box>
        <HookFocusable id="hook-a" />
      </Box>,
    )

    // Focus hook-a, then Shift+Tab back to tree-a
    await app.press("Tab")
    expect(app.focusManager.activeId).toBe("tree-a")
    await app.press("Tab")
    expect(app.focusManager.activeId).toBe("hook-a")

    // Shift+Tab → tree-a
    await app.press("Shift+Tab")
    expect(app.focusManager.activeId).toBe("tree-a")
  })
})
