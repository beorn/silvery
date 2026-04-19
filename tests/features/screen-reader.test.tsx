/**
 * Screen reader mode tests for renderToString.
 *
 * When `isScreenReaderEnabled: true`, renderToString walks the React element tree
 * and produces accessible text with ARIA roles, labels, and states.
 *
 * Based on Ink's screen-reader.tsx test suite.
 */
import React from "react"
import { test, expect } from "vitest"
import { Box, Text, renderToString } from "../../packages/ink/src/ink"

// Helper to render with screen reader mode
function sr(node: React.JSX.Element): string {
  return renderToString(node, { isScreenReaderEnabled: true })
}

// --- aria-label ---

test("render text for screen readers (aria-label on Box)", () => {
  const output = sr(
    <Box aria-label="Hello World">
      <Text>Not visible to screen readers</Text>
    </Box>,
  )
  expect(output).toBe("Hello World")
})

test("render aria-label only Text for screen readers", () => {
  const output = sr(<Text aria-label="Screen-reader only" />)
  expect(output).toBe("Screen-reader only")
})

test("render aria-label only Box for screen readers", () => {
  const output = sr(<Box aria-label="Screen-reader only" />)
  expect(output).toBe("Screen-reader only")
})

// --- aria-hidden ---

test("render text for screen readers with aria-hidden", () => {
  const output = sr(
    <Box aria-hidden>
      <Text>Not visible to screen readers</Text>
    </Box>,
  )
  expect(output).toBe("")
})

// --- aria-role ---

test("render text for screen readers with aria-role", () => {
  const output = sr(
    <Box aria-role="button">
      <Text>Click me</Text>
    </Box>,
  )
  expect(output).toBe("button: Click me")
})

// --- ANSI stripping ---

test("omit ANSI styling in screen-reader output", () => {
  const output = sr(
    <Box>
      <Text bold color="green" inverse underline>
        Styled content
      </Text>
    </Box>,
  )
  expect(output).toBe("Styled content")
})

// --- display:none ---

test("skip nodes with display:none style in screen-reader output", () => {
  const output = sr(
    <Box>
      <Box display="none">
        <Text>Hidden</Text>
      </Box>
      <Text>Visible</Text>
    </Box>,
  )
  expect(output).toBe("Visible")
})

// --- Direction: column (newline-separated) ---

test("render multiple Text components (column)", () => {
  const output = sr(
    <Box flexDirection="column">
      <Text>Hello</Text>
      <Text>World</Text>
    </Box>,
  )
  expect(output).toBe("Hello\nWorld")
})

test("render nested Box components with Text (column)", () => {
  const output = sr(
    <Box flexDirection="column">
      <Text>Hello</Text>
      <Box>
        <Text>World</Text>
      </Box>
    </Box>,
  )
  expect(output).toBe("Hello\nWorld")
})

// --- Null components ---

function NullComponent(): undefined {
  return undefined
}

test("render component that returns null", () => {
  const output = sr(
    <Box flexDirection="column">
      <Text>Hello</Text>
      <NullComponent />
      <Text>World</Text>
    </Box>,
  )
  expect(output).toBe("Hello\nWorld")
})

// --- aria-state ---

test("render with aria-state.busy", () => {
  const output = sr(
    <Box aria-state={{ busy: true }}>
      <Text>Loading</Text>
    </Box>,
  )
  expect(output).toBe("(busy) Loading")
})

test("render with aria-state.checked", () => {
  const output = sr(
    <Box aria-role="checkbox" aria-state={{ checked: true }}>
      <Text>Accept terms</Text>
    </Box>,
  )
  expect(output).toBe("checkbox: (checked) Accept terms")
})

test("render with aria-state.disabled", () => {
  const output = sr(
    <Box aria-role="button" aria-state={{ disabled: true }}>
      <Text>Submit</Text>
    </Box>,
  )
  expect(output).toBe("button: (disabled) Submit")
})

test("render with aria-state.expanded", () => {
  const output = sr(
    <Box aria-role="combobox" aria-state={{ expanded: true }}>
      <Text>Select</Text>
    </Box>,
  )
  expect(output).toBe("combobox: (expanded) Select")
})

test("render with aria-state.multiline", () => {
  const output = sr(
    <Box aria-role="textbox" aria-state={{ multiline: true }}>
      <Text>Hello</Text>
    </Box>,
  )
  expect(output).toBe("textbox: (multiline) Hello")
})

test("render with aria-state.multiselectable", () => {
  const output = sr(
    <Box aria-role="listbox" aria-state={{ multiselectable: true }}>
      <Text>Options</Text>
    </Box>,
  )
  expect(output).toBe("listbox: (multiselectable) Options")
})

test("render with aria-state.readonly", () => {
  const output = sr(
    <Box aria-role="textbox" aria-state={{ readonly: true }}>
      <Text>Hello</Text>
    </Box>,
  )
  expect(output).toBe("textbox: (readonly) Hello")
})

test("render with aria-state.required", () => {
  const output = sr(
    <Box aria-role="textbox" aria-state={{ required: true }}>
      <Text>Name</Text>
    </Box>,
  )
  expect(output).toBe("textbox: (required) Name")
})

test("render with aria-state.selected", () => {
  const output = sr(
    <Box aria-role="option" aria-state={{ selected: true }}>
      <Text>Blue</Text>
    </Box>,
  )
  expect(output).toBe("option: (selected) Blue")
})

// --- Multi-line / direction combinations ---

test("render multi-line text (column)", () => {
  const output = sr(
    <Box flexDirection="column">
      <Text>Line 1</Text>
      <Text>Line 2</Text>
    </Box>,
  )
  expect(output).toBe("Line 1\nLine 2")
})

test("render nested multi-line text (column inside row)", () => {
  const output = sr(
    <Box flexDirection="row">
      <Box flexDirection="column">
        <Text>Line 1</Text>
        <Text>Line 2</Text>
      </Box>
    </Box>,
  )
  expect(output).toBe("Line 1\nLine 2")
})

test("render nested row (row inside column)", () => {
  const output = sr(
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text>Line 1</Text>
        <Text>Line 2</Text>
      </Box>
    </Box>,
  )
  expect(output).toBe("Line 1 Line 2")
})

// --- Complex scenarios ---

test("render select input for screen readers", () => {
  const items = ["Red", "Green", "Blue"]

  const output = sr(
    <Box aria-role="list" flexDirection="column">
      <Text>Select a color:</Text>
      {items.map((item, index) => {
        const isSelected = index === 1
        const screenReaderLabel = `${index + 1}. ${item}`

        return (
          <Box
            key={item}
            aria-label={screenReaderLabel}
            aria-role="listitem"
            aria-state={{ selected: isSelected }}
          >
            <Text>{item}</Text>
          </Box>
        )
      })}
    </Box>,
  )

  expect(output).toBe(
    "list: Select a color:\nlistitem: 1. Red\nlistitem: (selected) 2. Green\nlistitem: 3. Blue",
  )
})

test("render multi-line text with roles", () => {
  const output = sr(
    <Box flexDirection="column" aria-role="list">
      <Box aria-role="listitem">
        <Text>Item 1</Text>
      </Box>
      <Box aria-role="listitem">
        <Text>Item 2</Text>
      </Box>
    </Box>,
  )
  expect(output).toBe("list: listitem: Item 1\nlistitem: Item 2")
})

test("render listbox with multiselectable options", () => {
  const output = sr(
    <Box flexDirection="column" aria-role="listbox" aria-state={{ multiselectable: true }}>
      <Box aria-role="option" aria-state={{ selected: true }}>
        <Text>Option 1</Text>
      </Box>
      <Box aria-role="option" aria-state={{ selected: false }}>
        <Text>Option 2</Text>
      </Box>
      <Box aria-role="option" aria-state={{ selected: true }}>
        <Text>Option 3</Text>
      </Box>
    </Box>,
  )

  expect(output).toBe(
    "listbox: (multiselectable) option: (selected) Option 1\noption: Option 2\noption: (selected) Option 3",
  )
})
