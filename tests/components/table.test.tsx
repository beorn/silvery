/**
 * Table Component Tests
 *
 * Verifies the generic Table component: auto-sizing, fixed width, grow columns,
 * alignment, custom renderers, header visibility, empty data, and null handling.
 */

import { describe, test, expect } from "vitest"
import { displayWidth } from "@silvery/ag-term/unicode"
import { createRenderer } from "@silvery/test"
import { Box, Text, Table } from "silvery"
import { DocumentTable } from "../../packages/ag-react/src/components/Table"

const render = createRenderer({ cols: 80, rows: 20 })

// =============================================================================
// Test data
// =============================================================================

type Person = { name: string; age: number; city: string }

const people: readonly Person[] = [
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

  test("uses a rendered column's key for shared intrinsic sizing", () => {
    const app = render(
      <Table
        columns={[
          {
            header: "STATE",
            key: "state",
            render: (item) => <Text color="$fg-success">{item.state}</Text>,
          },
          { header: "NEXT", key: "next" },
        ]}
        data={[{ state: "integrated", next: "visible" }]}
      />,
    )

    expect(app.lines[0]!.indexOf("NEXT")).toBe("integrated".length + 2)
  })

  test("uses intrinsic content as the basis for growing columns", () => {
    const narrow = createRenderer({ cols: 30, rows: 10 })
    const app = narrow(
      <Table
        columns={[
          { header: "A", key: "a", grow: true },
          { header: "B", key: "b", grow: true },
        ]}
        data={[{ a: "substantive", b: "x" }]}
      />,
    )

    expect(app.lines[0]!.indexOf("B")).toBeGreaterThan(15)
  })

  test("a grow column never squeezes fixed siblings below their content", () => {
    // The bossi `ls` regression: at 80 cols a long grow column (process args)
    // overflowed the container and flexbox shrank EVERY track proportionally,
    // crushing the fixed siblings to one-glyph stubs ("P…  S…  C…  …").
    // Contract: non-grow auto columns keep their intrinsic (content) width;
    // only the grow column gives way — the terminal edge truncates IT, never
    // its siblings.
    const app = render(
      <Table
        columns={[
          { header: "PID", key: "pid" },
          { header: "SEAT", key: "seat" },
          { header: "CPU", key: "cpu", align: "right" },
          { header: "RSS", key: "rss", align: "right" },
          { header: "COMMAND", key: "command", grow: true },
        ]}
        data={[
          {
            pid: "726",
            seat: "unknown",
            cpu: "46.3",
            rss: "636M",
            command:
              "/Applications/cmux.app/Contents/MacOS/cmux --with-a-very-long-argument-list --that-overflows-eighty-columns --by-a-large-margin --so-shrink-must-engage",
          },
          { pid: "5994", seat: "daemon", cpu: "20.2", rss: "1204M", command: "claude" },
        ]}
      />,
    )
    const lines = app.text.split("\n")
    const header = lines.find((line) => line.includes("COMMAND"))
    expect(header).toBeDefined()
    // Every fixed header survives in full — no proportional crush.
    expect(header).toMatch(/PID\s+SEAT\s+CPU\s+RSS\s+COMMAND/)
    const row = lines.find((line) => line.includes("46.3"))
    expect(row).toBeDefined()
    expect(row).toContain("726")
    expect(row).toContain("unknown")
    expect(row).toContain("636M")
    // The grow column is the one that yields at the edge.
    expect(row!.length).toBeLessThanOrEqual(80)
  })

  test("headers follow their column's alignment", () => {
    // A right-aligned column right-aligns its TITLE too — one `align` knob
    // governs both header and cells (title narrower than its track so the
    // alignment is observable).
    const app = render(
      <Table
        columns={[
          { header: "Name", key: "name" },
          { header: "Id", key: "id", align: "right" },
        ]}
        data={[
          { name: "Alice", id: "100" },
          { name: "Bob", id: "250" },
        ]}
      />,
    )
    const lines = app.text.split("\n")
    const header = lines.find((line) => line.includes("Id"))!
    const row = lines.find((line) => line.includes("Alice"))!
    // Right-flushed title ends exactly where the right-aligned content ends.
    expect(header.trimEnd().endsWith("Id")).toBe(true)
    expect(header.trimEnd().length).toBe(row.trimEnd().length)
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

  test("flexes bounded columns and truncates content before hiding later columns", () => {
    const narrow = createRenderer({ cols: 32, rows: 10 })
    const app = narrow(
      <Table
        columns={[
          { header: "PR", key: "pr" },
          { header: "STATE", key: "state", maxWidth: 8 },
          { header: "PATH", key: "path", grow: true, minWidth: 8 },
        ]}
        data={[
          {
            pr: "PR8",
            state: "rejected:merge-command-failed",
            path: "task/x",
          },
        ]}
      />,
    )

    expect(app.lines[0]).toContain("PATH")
    expect(app.lines[1]).toContain("task/x")
    expect(app.lines[1]).toContain("…")
    expect(app.lines[1]).toMatch(/… {2}task\/x/u)
  })

  test("framed tables wrap long tracks without hiding compact columns", () => {
    const narrow = createRenderer({ cols: 40, rows: 20 })
    const app = narrow(
      <Table
        frame
        cellWrap="wrap"
        columns={[
          { header: "Model", key: "model", shrink: true },
          { header: "Owner", key: "owner", shrink: true },
          { header: "Mechanism", key: "mechanism", shrink: true },
        ]}
        data={[
          {
            model: "Human sees km inside the agent cockpit",
            owner: "ag",
            mechanism: "views/panes/components",
          },
        ]}
      />,
    )

    // The apportioned allocation keeps the compact header WHOLE — under the
    // retired quadratic-shrink tracks this asserted the truncation artifact
    // "Own…"; nothing is hidden or truncated now, the long track wraps.
    expect(app.text).toContain("Owner")
    expect(app.text).toContain("ag")
    expect(app.text).toContain("components")
    expect(app.text).toContain("┐")
    expect(app.text).toContain("┘")
  })

  test("document tables preserve atomic dates and complete status headers", () => {
    const headers = ["Sample", "Due date", "Status", "Reference", "Command"]
    const app = createRenderer({ cols: 74, rows: 20 })(
      <Box paddingX={1}>
        <DocumentTable
          cellWrap="wrap"
          availableWidth={72}
          columns={headers.map((header, index) => ({
            header,
            render: (row: string[]) => row[index] ?? "",
          }))}
          data={[
            ["Typography", "2026-09-08", "WIP", "This sample", "maddoc typography.md"],
            ["Documentation", "2026-09-09", "Todo", "Maddoc README", "bun run typecheck"],
            ["External reference", "2026-09-10", "Done", "Example website", "echo ready"],
          ]}
        />
      </Box>,
    )

    expect(app.lines.find((line) => line.includes("Sample"))).toMatch(
      /Sample\s+Due date\s+Status\s+Reference\s+Command/u,
    )
    for (const date of ["2026-09-08", "2026-09-09", "2026-09-10"]) expect(app.text).toContain(date)
  })

  test("document tables keep a seven-column grid when header floors fit inside pane padding", () => {
    const headers = [
      "Surface",
      "Language",
      "Alignment",
      "Marker",
      "Navigation",
      "Wrapping",
      "Example",
    ]
    const app = createRenderer({ cols: 76, rows: 50 })(
      <Box paddingX={2}>
        <DocumentTable
          cellWrap="wrap"
          availableWidth={72}
          columns={headers.map((header, index) => ({
            header,
            render: (row: string[]) => row[index] ?? "",
          }))}
          data={[
            [
              "Prose document",
              "Markdown",
              "Prose-aligned",
              "Heading or bullet",
              "Local and external links",
              "Word wrapping",
              "Typography playground",
            ],
            [
              "Source block",
              "TypeScript",
              "Source-aligned",
              "Collapsed triangle",
              "Click to expand",
              "Long source lines",
              "Greeting component",
            ],
            [
              "Metadata panel",
              "YAML",
              "Prose-aligned when it fits",
              "Collapsed triangle",
              "Search reveals content",
              "Multiline values",
              "Sample frontmatter",
            ],
          ]}
        />
      </Box>,
    )

    expect(app.lines.find((line) => line.includes("Surface"))).toMatch(
      /Surface\s+Language\s+Alignment\s+Marker\s+Navigation\s+Wrapping\s+Example/u,
    )
    expect(app.text).not.toContain("Surface:")
    // Keep natural word breaks even after relaxing oversized value floors.
    expect(app.lines.find((line) => line.includes("Prose"))).toMatch(/Prose\s+Markdown/u)
  })

  test("framed tracks align emoji, CJK, combining marks, and ZWJ sequences", () => {
    const app = render(
      <Table
        frame
        columns={[
          { header: "Kind", key: "kind" },
          { header: "Value", key: "value" },
        ]}
        data={[
          { kind: "emoji", value: "🚀" },
          { kind: "CJK", value: "中文" },
          { kind: "combining", value: "é" },
          { kind: "family", value: "👨‍👩‍👧" },
        ]}
      />,
    )

    const framedLines = app.lines.map((line) => line.trim()).filter((line) => /^[┌├│└]/u.test(line))
    const frameWidths = framedLines.map(displayWidth)

    expect(new Set(frameWidths)).toEqual(new Set([frameWidths[0]]))
    expect(app.text).toContain("🚀")
    expect(app.text).toContain("中文")
    expect(app.text).toContain("é")
    expect(app.text).toContain("👨‍👩‍👧")
  })
})
