/**
 * Table Component
 *
 * A generic data table with auto-sizing columns, custom renderers, and alignment.
 * Thin composition over ListView — each data row is a ListView item, column headers
 * are rendered above. Gets nav/cache/search from ListView for free.
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
import React, { useMemo } from "react"
import { Box } from "./Box"
import { Text } from "./Text"
import { ListView } from "../ui/components/ListView"

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
// Helpers
// =============================================================================

function computeWidths<T>(columns: Column<T>[], data: T[], padding: number): number[] {
  return columns.map((col) => {
    if (col.width) return col.width
    if (col.grow) return 0 // will use flexGrow
    const cellValues = data.map((item, i) => {
      if (col.render) {
        const rendered = col.render(item, i)
        // Measure string renders for auto-width; React nodes fall back to header width
        return typeof rendered === "string" ? rendered : ""
      }
      return String((col.key ? item[col.key] : "") ?? "")
    })
    return Math.max(col.header.length, ...cellValues.map((v) => v.length)) + padding
  })
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
  const widths = useMemo(() => computeWidths(columns, data, padding), [columns, data, padding])

  const renderCell = (col: Column<T>, item: T, index: number, width: number) => {
    const rendered = col.render ? col.render(item, index) : null
    const content =
      rendered != null ? (
        typeof rendered === "string" ? (
          <Text>{rendered}</Text>
        ) : (
          rendered
        )
      ) : (
        <Text>{String((col.key ? item[col.key] : "") ?? "")}</Text>
      )

    return col.grow ? (
      <Box
        key={col.header}
        flexGrow={1}
        justifyContent={col.align === "right" ? "flex-end" : undefined}
      >
        {content}
      </Box>
    ) : (
      <Box
        key={col.header}
        width={width}
        justifyContent={col.align === "right" ? "flex-end" : undefined}
      >
        {content}
      </Box>
    )
  }

  const renderRow = (item: T, index: number) => (
    <Box>{columns.map((col, colIndex) => renderCell(col, item, index, widths[colIndex]!))}</Box>
  )

  // Viewport height = number of data rows (show all, no scrolling)
  // Minimum 1 to avoid zero-height viewport when data is empty
  const viewportHeight = Math.max(data.length, 1)

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
      {data.length > 0 && (
        <ListView items={data} height={viewportHeight} estimateHeight={1} renderItem={renderRow} />
      )}
    </Box>
  )
}
