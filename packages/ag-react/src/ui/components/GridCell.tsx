/**
 * GridCell — auto-registering wrapper for items in a 2D grid.
 *
 * Wraps a child component and automatically registers its screen position
 * in the PositionRegistry. Unregisters on unmount.
 *
 * @example
 * ```tsx
 * <VirtualList
 *   items={column.items}
 *   renderItem={(item, idx) => (
 *     <GridCell sectionIndex={colIndex} itemIndex={idx}>
 *       <Card {...item} />
 *     </GridCell>
 *   )}
 * />
 * ```
 */

import type { ReactNode } from "react"
import { Box } from "@silvery/ag-react/components/Box"
import { useGridPosition } from "@silvery/ag-react/hooks/useGridPosition"

export interface GridCellProps {
  /** Section index (e.g., column index in a kanban board). */
  sectionIndex: number
  /** Item index within the section. */
  itemIndex: number
  /** Child content to render. */
  children: ReactNode
}

/**
 * A thin wrapper that auto-registers its screen position in the PositionRegistry.
 *
 * Renders a transparent Box (no visual impact) around children.
 * Position tracking uses useScrollRectCallback (zero re-renders).
 */
export function GridCell({ sectionIndex, itemIndex, children }: GridCellProps) {
  useGridPosition(sectionIndex, itemIndex)
  return <Box>{children}</Box>
}
