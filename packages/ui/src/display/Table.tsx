/**
 * React Table component for hightea/Ink TUI apps
 */

import React from "react"
import type { TableProps, TableColumn } from "../types.js"

/**
 * Unicode box drawing characters for borders
 */
const BOX = {
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  horizontal: "─",
  vertical: "│",
  leftT: "├",
  rightT: "┤",
  topT: "┬",
  bottomT: "┴",
  cross: "┼",
} as const

/**
 * Data grid display component for React TUI apps
 *
 * @example
 * ```tsx
 * import { Table } from "@hightea/ui/display";
 *
 * const columns = [
 *   { key: "name", header: "Name", width: 20 },
 *   { key: "status", header: "Status", width: 10, align: "center" },
 *   { key: "count", header: "Count", width: 8, align: "right" },
 * ];
 *
 * const data = [
 *   { name: "Item 1", status: "active", count: 42 },
 *   { name: "Item 2", status: "pending", count: 7 },
 * ];
 *
 * function DataView() {
 *   return <Table columns={columns} data={data} border />;
 * }
 * ```
 */
export function Table({ columns, data, border = false }: TableProps): React.ReactElement {
  // Calculate effective column widths
  const effectiveColumns = calculateColumnWidths(columns, data)

  const lines: string[] = []

  if (border) {
    // Top border
    lines.push(buildBorderLine(effectiveColumns, "top"))
  }

  // Header row
  lines.push(buildDataRow(effectiveColumns, getHeaderRow(effectiveColumns), border))

  if (border) {
    // Separator after header
    lines.push(buildBorderLine(effectiveColumns, "middle"))
  }

  // Data rows
  for (const row of data) {
    lines.push(buildDataRow(effectiveColumns, row, border))
  }

  if (border) {
    // Bottom border
    lines.push(buildBorderLine(effectiveColumns, "bottom"))
  }

  return (
    <span data-table data-border={border}>
      {lines.join("\n")}
    </span>
  )
}

/**
 * Calculate effective column widths based on content if not specified
 */
function calculateColumnWidths(
  columns: TableColumn[],
  data: Array<Record<string, unknown>>,
): Array<TableColumn & { effectiveWidth: number }> {
  return columns.map((col) => {
    if (col.width !== undefined) {
      return { ...col, effectiveWidth: col.width }
    }

    // Calculate width from content
    let maxWidth = col.header.length

    for (const row of data) {
      const value = String(row[col.key] ?? "")
      maxWidth = Math.max(maxWidth, value.length)
    }

    return { ...col, effectiveWidth: maxWidth }
  })
}

/**
 * Create header row object from columns
 */
function getHeaderRow(columns: Array<TableColumn & { effectiveWidth: number }>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const col of columns) {
    row[col.key] = col.header
  }
  return row
}

/**
 * Build a border line (top, middle, or bottom)
 */
function buildBorderLine(
  columns: Array<TableColumn & { effectiveWidth: number }>,
  position: "top" | "middle" | "bottom",
): string {
  const left = position === "top" ? BOX.topLeft : position === "bottom" ? BOX.bottomLeft : BOX.leftT
  const right = position === "top" ? BOX.topRight : position === "bottom" ? BOX.bottomRight : BOX.rightT
  const join = position === "top" ? BOX.topT : position === "bottom" ? BOX.bottomT : BOX.cross

  const segments = columns.map((col) => BOX.horizontal.repeat(col.effectiveWidth + 2))

  return left + segments.join(join) + right
}

/**
 * Build a data row (header or content)
 */
function buildDataRow(
  columns: Array<TableColumn & { effectiveWidth: number }>,
  row: Record<string, unknown>,
  border: boolean,
): string {
  const cells = columns.map((col) => {
    const value = String(row[col.key] ?? "")
    return formatCell(value, col.effectiveWidth, col.align ?? "left")
  })

  if (border) {
    return BOX.vertical + " " + cells.join(" " + BOX.vertical + " ") + " " + BOX.vertical
  }

  return cells.join("  ")
}

/**
 * Format a cell value with alignment and truncation
 */
function formatCell(value: string, width: number, align: "left" | "center" | "right"): string {
  // Truncate if too long
  if (value.length > width) {
    return value.slice(0, width - 1) + "…"
  }

  // Pad according to alignment
  const padding = width - value.length

  switch (align) {
    case "right":
      return " ".repeat(padding) + value
    case "center": {
      const leftPad = Math.floor(padding / 2)
      const rightPad = padding - leftPad
      return " ".repeat(leftPad) + value + " ".repeat(rightPad)
    }
    case "left":
    default:
      return value + " ".repeat(padding)
  }
}
