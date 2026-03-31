/**
 * Table Component
 *
 * A generic data table with auto-sizing columns, custom renderers, and alignment.
 * Uses flexbox layout for proper terminal rendering.
 *
 * @example
 * ```tsx
 * <Table
 *   columns={[
 *     { header: "Name", key: "name" },
 *     { header: "Age", key: "age", align: "right" },
 *     { header: "Bio", key: "bio", grow: true },
 *   ]}
 *   data={[
 *     { name: "Alice", age: 30 },
 *     { name: "Bob", age: 25 },
 *   ]}
 * />
 * ```
 */
import React from "react"
import { Box } from "./Box"
import { Text } from "./Text"

// =============================================================================
// Types
// =============================================================================

export type Column<T> = {
  /** Column header text */
  header: string
  /** Key to read from data item (simple string access) */
  key?: keyof T & string
  /** Custom render function (takes precedence over key) */
  render?: (item: T, index: number) => React.ReactNode
  /** Text alignment: left (default) or right */
  align?: "left" | "right"
  /** Fixed width (overrides auto-sizing) */
  width?: number
  /** Allow this column to grow to fill remaining space */
  grow?: boolean
}

export type TableProps<T> = {
  /** Data rows */
  data: T[]
  /** Column definitions */
  columns: Column<T>[]
  /** Header text color (default: "$primary") */
  headerColor?: string
  /** Show header row (default: true) */
  showHeader?: boolean
  /** Minimum column padding between columns (default: 2) */
  padding?: number
}

// =============================================================================
// Component
// =============================================================================

export function Table<T>({
  data,
  columns,
  headerColor = "$primary",
  showHeader = true,
  padding = 2,
}: TableProps<T>): React.ReactElement {
  // Compute auto widths
  const widths = columns.map((col) => {
    if (col.width) return col.width
    if (col.grow) return 0 // will use flexGrow
    const cellValues = data.map((item) => {
      if (col.render) return "" // can't measure React nodes, use header width
      return String((col.key ? item[col.key] : "") ?? "")
    })
    return Math.max(col.header.length, ...cellValues.map((v) => v.length)) + padding
  })

  const renderCell = (col: Column<T>, item: T, index: number, width: number) => {
    const content = col.render ? col.render(item, index) : <Text>{String((col.key ? item[col.key] : "") ?? "")}</Text>

    return col.grow ? (
      <Box key={col.header} flexGrow={1} justifyContent={col.align === "right" ? "flex-end" : undefined}>
        {content}
      </Box>
    ) : (
      <Box key={col.header} width={width} justifyContent={col.align === "right" ? "flex-end" : undefined}>
        {content}
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      {showHeader && (
        <Box>
          {columns.map((col, i) =>
            col.grow ? (
              <Box key={col.header} flexGrow={1}>
                <Text bold color={headerColor}>
                  {col.header}
                </Text>
              </Box>
            ) : (
              <Box key={col.header} width={widths[i]}>
                <Text bold color={headerColor}>
                  {col.header}
                </Text>
              </Box>
            ),
          )}
        </Box>
      )}
      {data.map((item, rowIndex) => (
        <Box key={rowIndex}>{columns.map((col, colIndex) => renderCell(col, item, rowIndex, widths[colIndex]!))}</Box>
      ))}
    </Box>
  )
}
