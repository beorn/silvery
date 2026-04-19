/**
 * Table Component
 *
 * A data table with headers and column alignment, composed over ListView.
 * Each data row is a ListView item; column headers render above.
 * Gets nav/cache/search from ListView for free.
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
import React, { useMemo } from "react"
import { Box } from "../../components/Box"
import { Text } from "../../components/Text"
import { ListView } from "./ListView"

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

function computeWidths(
  columns: TableColumn[],
  data: Array<Record<string, unknown> | unknown[]>,
): number[] {
  return columns.map((col, colIndex) => {
    if (col.width) return col.width
    let maxWidth = col.header.length
    for (const row of data) {
      const cellText = getCellValue(row, col, colIndex)
      maxWidth = Math.max(maxWidth, cellText.length)
    }
    return maxWidth
  })
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
  const colWidths = useMemo(() => computeWidths(columns, data), [columns, data])

  // Build separator line for header underline
  const separatorLine = useMemo(() => {
    return colWidths
      .map((w) => "─".repeat(w))
      .join(separator.replace(/[^│]/g, "─").replace(/│/g, "┼"))
  }, [colWidths, separator])

  const renderCell = (
    value: string,
    width: number,
    align: "left" | "right" | "center" = "left",
  ) => {
    const justifyContent =
      align === "right"
        ? ("flex-end" as const)
        : align === "center"
          ? ("center" as const)
          : undefined
    return (
      <Box width={width} justifyContent={justifyContent} flexShrink={0}>
        <Text>{value}</Text>
      </Box>
    )
  }

  const renderRow = (row: Record<string, unknown> | unknown[]) => (
    <Box>
      {columns.map((col, i) => {
        const value = getCellValue(row, col, i)
        const isLast = i === columns.length - 1
        return (
          <React.Fragment key={col.key ?? col.header}>
            {renderCell(value, colWidths[i]!, col.align)}
            {!isLast && <Text>{separator}</Text>}
          </React.Fragment>
        )
      })}
    </Box>
  )

  // Viewport height = number of data rows (show all, no scrolling)
  // Minimum 1 to avoid zero-height viewport when data is empty
  const viewportHeight = Math.max(data.length, 1)

  return (
    <Box flexDirection="column">
      {showHeader && (
        <>
          <Box>
            {columns.map((col, i) => {
              const isLast = i === columns.length - 1
              return (
                <React.Fragment key={col.key ?? col.header}>
                  <Box width={colWidths[i]} flexShrink={0}>
                    <Text bold={headerBold} color="$muted">
                      {col.header}
                    </Text>
                  </Box>
                  {!isLast && <Text color="$border">{separator}</Text>}
                </React.Fragment>
              )
            })}
          </Box>
          <Text color="$border">{separatorLine}</Text>
        </>
      )}
      {data.length > 0 && (
        <ListView items={data} height={viewportHeight} estimateHeight={1} renderItem={renderRow} />
      )}
    </Box>
  )
}
