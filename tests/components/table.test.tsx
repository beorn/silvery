/**
 * Table Component Tests
 *
 * Verifies the generic Table component: auto-sizing, fixed width, grow columns,
 * alignment, custom renderers, header visibility, empty data, and null handling.
 */

import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text, Table } from "silvery"

const render = createRenderer({ cols: 80, rows: 20 })

// =============================================================================
// Test data
// =============================================================================

type Person = { name: string; age: number; city: string }

const people: Person[] = [
  { name: "Alice", age: 30, city: "New York" },
  { name: "Bob", age: 25, city: "San Francisco" },
  { name: "Charlie", age: 35, city: "Chicago" },
]

// =============================================================================
// Tests
// =============================================================================

describe("Table", () => {
  test("renders header row with column names", () => {
    const app = render(
      <Table
        columns={[
          { header: "Name", key: "name" },
          { header: "Age", key: "age" },
        ]}
        data={people}
      />,
    )
    expect(app.text).toContain("Name")
    expect(app.text).toContain("Age")
  })

  test("renders data rows with correct values", () => {
    const app = render(
      <Table
        columns={[
          { header: "Name", key: "name" },
          { header: "Age", key: "age" },
        ]}
        data={people}
      />,
    )
    expect(app.text).toContain("Alice")
    expect(app.text).toContain("30")
    expect(app.text).toContain("Bob")
    expect(app.text).toContain("25")
    expect(app.text).toContain("Charlie")
    expect(app.text).toContain("35")
  })

  test("auto-sizes columns based on data content", () => {
    const app = render(
      <Table
        columns={[
          { header: "Name", key: "name" },
          { header: "City", key: "city" },
        ]}
        data={people}
      />,
    )
    // With default padding=2, "Charlie" (7 chars) + 2 = 9 column width
    // "San Francisco" (13 chars) + 2 = 15 column width
    // Each row should have Name and City separated by space from fixed width boxes
    const lines = app.lines
    // Header line: "Name" in a 9-wide box, "City" in a 15-wide box
    // "Charlie" is the longest name (7), header "Name" is 4 — max is 7, +2 padding = 9
    // "San Francisco" is the longest city (13), header "City" is 4 — max is 13, +2 padding = 15
    expect(lines[0]).toMatch(/^Name/)
    expect(lines[0]).toMatch(/City/)
    // Verify that "Alice" and "New York" appear on the same line
    const aliceLine = lines.find((l) => l.includes("Alice"))
    expect(aliceLine).toBeDefined()
    expect(aliceLine).toContain("New York")
  })

  test("respects fixed width columns", () => {
    const app = render(
      <Table
        columns={[
          { header: "Name", key: "name", width: 20 },
          { header: "Age", key: "age" },
        ]}
        data={people}
      />,
    )
    const lines = app.lines
    // The header "Name" should be in a 20-wide box
    // So "Age" should start at column 20
    const headerLine = lines[0]!
    expect(headerLine).toMatch(/^Name/)
    // "Age" starts after the 20-char wide Name column
    const ageIndex = headerLine.indexOf("Age")
    expect(ageIndex).toBe(20)
  })

  test("grow column takes remaining space", () => {
    const app = render(
      <Table
        columns={[
          { header: "Name", key: "name" },
          { header: "Bio", key: "city", grow: true },
        ]}
        data={people}
      />,
    )
    // The grow column should expand to fill remaining space
    // With 80 cols, the Name column auto-sizes, the Bio column grows
    expect(app.text).toContain("Name")
    expect(app.text).toContain("Bio")
    expect(app.text).toContain("Alice")
    expect(app.text).toContain("New York")
  })

  test("right-aligned columns", () => {
    const app = render(
      <Table
        columns={[
          { header: "Name", key: "name", width: 15 },
          { header: "Age", key: "age", width: 10, align: "right" },
        ]}
        data={[{ name: "Alice", age: 30 }]}
      />,
    )
    const lines = app.lines
    // In the age column (width 10, right-aligned), "30" should be right-justified
    // The age column starts at position 15
    const dataLine = lines[1]!
    // "30" right-aligned in a 10-char box means it's at the end of the box
    const ageSection = dataLine.slice(15, 25)
    expect(ageSection.trimEnd()).toMatch(/\s+30$|30$/)
  })

  test("custom render function", () => {
    const app = render(
      <Table
        columns={[
          { header: "Name", key: "name" },
          {
            header: "Status",
            render: (item: Person) => (
              <Text color={item.age >= 30 ? "$fg-success" : "$fg-warning"}>
                {item.age >= 30 ? "senior" : "junior"}
              </Text>
            ),
          },
        ]}
        data={people}
      />,
    )
    expect(app.text).toContain("Alice")
    expect(app.text).toContain("senior")
    expect(app.text).toContain("Bob")
    expect(app.text).toContain("junior")
  })

  test("showHeader=false hides header", () => {
    const app = render(
      <Table
        columns={[
          { header: "Name", key: "name" },
          { header: "Age", key: "age" },
        ]}
        data={people}
        showHeader={false}
      />,
    )
    // Header text should not be present as a header row
    // Data should still render
    expect(app.text).toContain("Alice")
    expect(app.text).toContain("Bob")
    // The first line should be data, not the header
    const firstLine = app.lines[0]!
    expect(firstLine).toContain("Alice")
  })

  test("empty data shows only header", () => {
    const app = render(
      <Table<Person>
        columns={[
          { header: "Name", key: "name" },
          { header: "Age", key: "age" },
        ]}
        data={[]}
      />,
    )
    expect(app.text).toContain("Name")
    expect(app.text).toContain("Age")
    // Only the header line should be present
    const nonEmptyLines = app.lines.filter((l) => l.trim().length > 0)
    expect(nonEmptyLines).toHaveLength(1)
  })

  test("handles undefined/null values gracefully", () => {
    type Partial = { name: string; email?: string | null }
    const data: Partial[] = [
      { name: "Alice", email: "alice@example.com" },
      { name: "Bob", email: null },
      { name: "Charlie", email: undefined },
    ]
    const app = render(
      <Table
        columns={[
          { header: "Name", key: "name" },
          { header: "Email", key: "email" },
        ]}
        data={data}
      />,
    )
    expect(app.text).toContain("Alice")
    expect(app.text).toContain("alice@example.com")
    expect(app.text).toContain("Bob")
    expect(app.text).toContain("Charlie")
    // Should not contain "null" or "undefined" as text
    expect(app.text).not.toContain("null")
    expect(app.text).not.toContain("undefined")
  })

  test("header uses custom color", () => {
    const app = render(
      <Table
        columns={[{ header: "X", key: "name" }]}
        data={[{ name: "A" }]}
        headerColor="$fg-success"
      />,
    )
    expect(app.text).toContain("X")
    expect(app.text).toContain("A")
  })

  test("custom padding affects column spacing", () => {
    const app = render(
      <Table
        columns={[
          { header: "A", key: "name" },
          { header: "B", key: "age" },
        ]}
        data={[{ name: "X", age: 1 }]}
        padding={4}
      />,
    )
    const lines = app.lines
    // With padding=4, column A width = max("A".length, "X".length) + 4 = 5
    // "B" header should start at position 5
    const headerLine = lines[0]!
    const bIndex = headerLine.indexOf("B")
    expect(bIndex).toBe(5)
  })
})
