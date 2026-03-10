/**
 * Tab Focus Cycling Tests
 *
 * Verifies that Tab/Shift+Tab automatically cycle focus between focusable
 * components, and Escape blurs the current focus — all as default behavior
 * without apps needing to wire up their own handlers.
 */

import { describe, test, expect } from "vitest";
import { createRenderer } from "@silvery/test";
import { Box, Text, useFocusable } from "silvery";

// ============================================================================
// Test Components
// ============================================================================

/** Inner content that reads focus state via useFocusable */
function FocusableContent({ id }: { id: string }) {
  const { focused } = useFocusable();
  return (
    <Text>
      {id}: {focused ? "focused" : "unfocused"}
    </Text>
  );
}

/** Focusable item: Box with focusable prop wrapping content that reads focus state */
function FocusableItem({ id }: { id: string }) {
  return (
    <Box testID={id} focusable>
      <FocusableContent id={id} />
    </Box>
  );
}

// ============================================================================
// Tests
// ============================================================================

describe("Tab Focus Cycling", () => {
  test("Tab focuses the first focusable component when nothing is focused", async () => {
    const render = createRenderer({ cols: 40, rows: 10 });
    const app = render(
      <Box flexDirection="column">
        <FocusableItem id="a" />
        <FocusableItem id="b" />
        <FocusableItem id="c" />
      </Box>,
    );

    // Nothing focused initially
    expect(app.focusManager.activeId).toBeNull();

    // Tab should focus the first item
    await app.press("Tab");
    expect(app.focusManager.activeId).toBe("a");
    expect(app.text).toContain("a: focused");
  });

  test("Tab cycles forward through focusable components", async () => {
    const render = createRenderer({ cols: 40, rows: 10 });
    const app = render(
      <Box flexDirection="column">
        <FocusableItem id="a" />
        <FocusableItem id="b" />
        <FocusableItem id="c" />
      </Box>,
    );

    await app.press("Tab");
    expect(app.focusManager.activeId).toBe("a");

    await app.press("Tab");
    expect(app.focusManager.activeId).toBe("b");

    await app.press("Tab");
    expect(app.focusManager.activeId).toBe("c");
  });

  test("Tab wraps around from last to first", async () => {
    const render = createRenderer({ cols: 40, rows: 10 });
    const app = render(
      <Box flexDirection="column">
        <FocusableItem id="a" />
        <FocusableItem id="b" />
      </Box>,
    );

    await app.press("Tab");
    expect(app.focusManager.activeId).toBe("a");

    await app.press("Tab");
    expect(app.focusManager.activeId).toBe("b");

    // Should wrap around to first
    await app.press("Tab");
    expect(app.focusManager.activeId).toBe("a");
  });

  test("Shift+Tab focuses the last component when nothing is focused", async () => {
    const render = createRenderer({ cols: 40, rows: 10 });
    const app = render(
      <Box flexDirection="column">
        <FocusableItem id="a" />
        <FocusableItem id="b" />
        <FocusableItem id="c" />
      </Box>,
    );

    expect(app.focusManager.activeId).toBeNull();

    await app.press("Shift+Tab");
    expect(app.focusManager.activeId).toBe("c");
  });

  test("Shift+Tab cycles backward through focusable components", async () => {
    const render = createRenderer({ cols: 40, rows: 10 });
    const app = render(
      <Box flexDirection="column">
        <FocusableItem id="a" />
        <FocusableItem id="b" />
        <FocusableItem id="c" />
      </Box>,
    );

    // Start at last via Shift+Tab
    await app.press("Shift+Tab");
    expect(app.focusManager.activeId).toBe("c");

    await app.press("Shift+Tab");
    expect(app.focusManager.activeId).toBe("b");

    await app.press("Shift+Tab");
    expect(app.focusManager.activeId).toBe("a");
  });

  test("Shift+Tab wraps around from first to last", async () => {
    const render = createRenderer({ cols: 40, rows: 10 });
    const app = render(
      <Box flexDirection="column">
        <FocusableItem id="a" />
        <FocusableItem id="b" />
      </Box>,
    );

    await app.press("Shift+Tab");
    expect(app.focusManager.activeId).toBe("b");

    await app.press("Shift+Tab");
    expect(app.focusManager.activeId).toBe("a");

    // Should wrap around to last
    await app.press("Shift+Tab");
    expect(app.focusManager.activeId).toBe("b");
  });

  test("Escape blurs the currently focused component", async () => {
    const render = createRenderer({ cols: 40, rows: 10 });
    const app = render(
      <Box flexDirection="column">
        <FocusableItem id="a" />
        <FocusableItem id="b" />
      </Box>,
    );

    // Focus something first
    await app.press("Tab");
    expect(app.focusManager.activeId).toBe("a");
    expect(app.text).toContain("a: focused");

    // Escape should blur
    await app.press("Escape");
    expect(app.focusManager.activeId).toBeNull();
    expect(app.text).toContain("a: unfocused");
    expect(app.text).toContain("b: unfocused");
  });

  test("Escape does nothing when nothing is focused", async () => {
    const render = createRenderer({ cols: 40, rows: 10 });
    const app = render(
      <Box flexDirection="column">
        <FocusableItem id="a" />
      </Box>,
    );

    expect(app.focusManager.activeId).toBeNull();

    // Escape should be a no-op (input falls through to useInput handlers)
    await app.press("Escape");
    expect(app.focusManager.activeId).toBeNull();
  });

  test("Tab does nothing when there are no focusable components", async () => {
    const render = createRenderer({ cols: 40, rows: 10 });
    const app = render(
      <Box flexDirection="column">
        <Text>No focusable items</Text>
      </Box>,
    );

    await app.press("Tab");
    expect(app.focusManager.activeId).toBeNull();
  });

  test("focus state is reflected in rendered output", async () => {
    const render = createRenderer({ cols: 40, rows: 10 });
    const app = render(
      <Box flexDirection="column">
        <FocusableItem id="first" />
        <FocusableItem id="second" />
      </Box>,
    );

    // Initially all unfocused
    expect(app.text).toContain("first: unfocused");
    expect(app.text).toContain("second: unfocused");

    // Tab to first
    await app.press("Tab");
    expect(app.text).toContain("first: focused");
    expect(app.text).toContain("second: unfocused");

    // Tab to second
    await app.press("Tab");
    expect(app.text).toContain("first: unfocused");
    expect(app.text).toContain("second: focused");
  });

  test("Tab then Shift+Tab goes back", async () => {
    const render = createRenderer({ cols: 40, rows: 10 });
    const app = render(
      <Box flexDirection="column">
        <FocusableItem id="a" />
        <FocusableItem id="b" />
        <FocusableItem id="c" />
      </Box>,
    );

    await app.press("Tab");
    expect(app.focusManager.activeId).toBe("a");

    await app.press("Tab");
    expect(app.focusManager.activeId).toBe("b");

    await app.press("Shift+Tab");
    expect(app.focusManager.activeId).toBe("a");
  });

  test("skips non-focusable components", async () => {
    const render = createRenderer({ cols: 40, rows: 10 });
    const app = render(
      <Box flexDirection="column">
        <FocusableItem id="a" />
        <Box testID="plain">
          <Text>Not focusable</Text>
        </Box>
        <FocusableItem id="b" />
      </Box>,
    );

    await app.press("Tab");
    expect(app.focusManager.activeId).toBe("a");

    // Should skip the non-focusable Box and go to "b"
    await app.press("Tab");
    expect(app.focusManager.activeId).toBe("b");
  });
});
