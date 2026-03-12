/**
 * Table Component
 *
 * A data table with headers and column alignment.
 *
 * Usage:
 * ```tsx
 * <Table
 *   columns={[
 *     { header: "Name", key: "name" },
 *     { header: "Age", key: "age", align: "right" },
 *   ]}
 *   data={[
 *     { name: "Alice", age: 30 },
 *     { name: "Bob", age: 25 },
 *   ]}
 * />
 * ```
 */
import React from "react"
import { Box } from "@silvery/react/components/Box"
import { Text } from "@silvery/react/components/Text"

// =============================================================================
// Types
// =============================================================================

export interface TableColumn {
  header: string
  /** Key to extract from data row, or index for array data */
  key?: string
  /** Column width (auto if omitted) */
  width?: number
  /** Text alignment */
  align?: "left" | "right" | "center"
}

export interface TableProps {
  /** Column definitions */
  columns: TableColumn[]
  /** Data rows — array of objects or arrays */
  data: Array<Record<string, unknown> | unknown[]>
  /** Show header row (default: true) */
  showHeader?: boolean
  /** Border between columns (default: " │ ") */
  separator?: string
  /** Header style */
  headerBold?: boolean
}

// =============================================================================
// Helpers
// =============================================================================

function getCellValue(
  row: Record<string, unknown> | unknown[],
  col: TableColumn,
  colIndex: number,
): string {
  if (Array.isArray(row)) {
    const val = row[colIndex]
    return val == null ? "" : String(val)
  }
  if (col.key) {
    const val = row[col.key]
    return val == null ? "" : String(val)
  }
  return ""
}

function alignText(
  text: string,
  width: number,
  align: "left" | "right" | "center" = "left",
): string {
  if (text.length >= width) return text.slice(0, width)

  const pad = width - text.length

  switch (align) {
    case "right":
      return " ".repeat(pad) + text
    case "center": {
      const leftPad = Math.floor(pad / 2)
      const rightPad = pad - leftPad
      return " ".repeat(leftPad) + text + " ".repeat(rightPad)
    }
    default:
      return text + " ".repeat(pad)
  }
}

// =============================================================================
// Component
// =============================================================================

export function Table({
  columns,
  data,
  showHeader = true,
  separator = " │ ",
  headerBold = true,
}: TableProps): React.ReactElement {
  // Calculate column widths
  const colWidths = columns.map((col, colIndex) => {
    if (col.width) return col.width

    let maxWidth = col.header.length
    for (const row of data) {
      const cellText = getCellValue(row, col, colIndex)
      maxWidth = Math.max(maxWidth, cellText.length)
    }
    return maxWidth
  })

  // Build header row
  const headerCells = columns.map((col, i) => alignText(col.header, colWidths[i]!, col.align))
  const headerLine = headerCells.join(separator)

  // Build separator line
  const separatorLine = colWidths
    .map((w) => "─".repeat(w))
    .join(separator.replace(/[^│]/g, "─").replace(/│/g, "┼"))

  // Build data rows
  const dataRows = data.map((row) => {
    const cells = columns.map((col, i) => {
      const value = getCellValue(row, col, i)
      return alignText(value, colWidths[i]!, col.align)
    })
    return cells.join(separator)
  })

  return (
    <Box flexDirection="column">
      {showHeader && (
        <>
          <Text bold={headerBold} dimColor>
            {headerLine}
          </Text>
          <Text dimColor>{separatorLine}</Text>
        </>
      )}
      {dataRows.map((row, i) => (
        <Text key={i}>{row}</Text>
      ))}
    </Box>
  )
}
