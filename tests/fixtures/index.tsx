/**
 * Shared Test Fixtures for Silvery Tests
 *
 * Reusable React components for memory, visual, stability, and unicode tests.
 * Each fixture is a pure component — no external dependencies beyond silvery.
 */

import React, { useState, useCallback, useEffect } from "react";
import { Box, Text, useInput, useContentRect, TextInput } from "@silvery/react";

// ============================================================================
// SimpleBox — Minimal box with text content
// ============================================================================

export function SimpleBox({ label = "Hello" }: { label?: string }) {
  return (
    <Box borderStyle="single" padding={1}>
      <Text>{label}</Text>
    </Box>
  );
}

// ============================================================================
// ComplexLayout — Multi-level nested layout with various flex properties
// ============================================================================

export function ComplexLayout() {
  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="row">
        <Box width={20} borderStyle="single">
          <Text bold>Sidebar</Text>
        </Box>
        <Box flexGrow={1} flexDirection="column">
          <Box height={1}>
            <Text color="cyan">Header</Text>
          </Box>
          <Box flexGrow={1}>
            <Text>Main content area</Text>
          </Box>
          <Box height={1}>
            <Text dimColor>Footer</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

// ============================================================================
// NestedFlex — Deep nesting to stress layout engine
// ============================================================================

export function NestedFlex({ depth = 5 }: { depth?: number }) {
  if (depth <= 0) {
    return <Text>Leaf</Text>;
  }
  return (
    <Box
      flexDirection={depth % 2 === 0 ? "row" : "column"}
      borderStyle={depth === 1 ? "single" : undefined}
      padding={depth > 3 ? 1 : 0}
    >
      <NestedFlex depth={depth - 1} />
      <NestedFlex depth={depth - 1} />
    </Box>
  );
}

// ============================================================================
// InteractiveForm — Form with text input and toggle state
// ============================================================================

export function InteractiveForm() {
  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useInput((input, key) => {
    if (key.return && name.length > 0) {
      setSubmitted(true);
    }
  });

  if (submitted) {
    return (
      <Box flexDirection="column">
        <Text color="green">Submitted: {name}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Enter your name:</Text>
      <TextInput value={name} onChange={setName} />
    </Box>
  );
}

// ============================================================================
// LargeList — Scrollable list with many items
// ============================================================================

export function LargeList({ count = 1000 }: { count?: number }) {
  const [selected, setSelected] = useState(0);

  useInput((_input, key) => {
    if (key.downArrow) setSelected((s) => Math.min(s + 1, count - 1));
    if (key.upArrow) setSelected((s) => Math.max(s - 1, 0));
  });

  // Render all items (without virtualization, for stress testing)
  const items: React.ReactElement[] = [];
  for (let i = 0; i < count; i++) {
    items.push(
      <Box key={i}>
        <Text color={i === selected ? "cyan" : undefined} bold={i === selected}>
          {i === selected ? "> " : "  "}
          Item {i + 1}
        </Text>
      </Box>,
    );
  }

  return (
    <Box flexDirection="column" overflow="hidden">
      {items}
    </Box>
  );
}

// ============================================================================
// UnicodeContent — Various unicode text for rendering tests
// ============================================================================

export function UnicodeContent() {
  return (
    <Box flexDirection="column" gap={1}>
      <Text>ASCII: Hello, World!</Text>
      <Text>CJK: \u4F60\u597D\u4E16\u754C (Hello World in Chinese)</Text>
      <Text>Japanese: \u3053\u3093\u306B\u3061\u306F</Text>
      <Text>Korean: \uC548\uB155\uD558\uC138\uC694</Text>
      <Text>Emoji: 😀🚀💡❤️</Text>
      <Text>Flags: 🇺🇸🇯🇵🇩🇪</Text>
      <Text>ZWJ: 👨‍👩‍👧‍👦</Text>
      <Text>Combining: e\u0301 n\u0303 o\u0308</Text>
      <Text>Mixed: Hello你好😀World</Text>
    </Box>
  );
}

// ============================================================================
// ChalkStyledContent — Text with various style combinations
// ============================================================================

export function ChalkStyledContent() {
  return (
    <Box flexDirection="column">
      <Text bold>Bold text</Text>
      <Text italic>Italic text</Text>
      <Text underline>Underlined text</Text>
      <Text strikethrough>Strikethrough text</Text>
      <Text dimColor>Dim text</Text>
      <Text color="red">Red text</Text>
      <Text color="green" bold>
        Green bold text
      </Text>
      <Text color="blue" italic underline>
        Blue italic underlined
      </Text>
      <Text backgroundColor="yellow" color="black">
        Yellow background
      </Text>
      <Text bold italic underline color="magenta">
        All styles combined
      </Text>
    </Box>
  );
}

// ============================================================================
// ResponsiveBox — Uses useContentRect for layout feedback
// ============================================================================

export function ResponsiveBox() {
  const { width, height } = useContentRect();
  return (
    <Box flexDirection="column">
      <Text>
        Size: {width}x{height}
      </Text>
      {width > 40 ? <Text>Wide layout</Text> : <Text>Narrow layout</Text>}
    </Box>
  );
}

// ============================================================================
// Counter — Simple stateful component for re-render testing
// ============================================================================

export function Counter({ initial = 0 }: { initial?: number }) {
  const [count, setCount] = useState(initial);

  useInput((input) => {
    if (input === "j" || input === "+") setCount((c) => c + 1);
    if (input === "k" || input === "-") setCount((c) => c - 1);
  });

  return (
    <Box>
      <Text>Count: {count}</Text>
    </Box>
  );
}

// ============================================================================
// RapidUpdater — Updates state on every render tick (stress test)
// ============================================================================

export function RapidUpdater({ onRender }: { onRender?: (count: number) => void }) {
  const [count, setCount] = useState(0);

  useInput((input) => {
    if (input === "u") setCount((c) => c + 1);
  });

  useEffect(() => {
    onRender?.(count);
  });

  return (
    <Box>
      <Text>Renders: {count}</Text>
    </Box>
  );
}

// ============================================================================
// MountUnmountCycle — Component for mount/unmount testing
// ============================================================================

export function MountUnmountCycle({ visible = true }: { visible?: boolean }) {
  if (!visible) return null;

  return (
    <Box flexDirection="column" borderStyle="single">
      <Text bold>Mounted Component</Text>
      <ResponsiveBox />
      <SimpleBox label="Nested" />
    </Box>
  );
}

// ============================================================================
// ScrollableContent — Content taller than viewport
// ============================================================================

export function ScrollableContent({ lineCount = 50 }: { lineCount?: number }) {
  const lines: React.ReactElement[] = [];
  for (let i = 0; i < lineCount; i++) {
    lines.push(
      <Text key={i}>
        Line {i + 1}: {"=".repeat(30)}
      </Text>,
    );
  }

  return (
    <Box flexDirection="column" height={10} overflow="scroll">
      {lines}
    </Box>
  );
}
