/**
 * TreeView Component
 *
 * Expandable/collapsible hierarchical data display with keyboard navigation.
 * Each node can have children, and the tree supports controlled or
 * uncontrolled expansion state.
 *
 * Usage:
 * ```tsx
 * const data: TreeNode[] = [
 *   {
 *     id: "1",
 *     label: "Documents",
 *     children: [
 *       { id: "1.1", label: "README.md" },
 *       { id: "1.2", label: "notes.txt" },
 *     ],
 *   },
 *   { id: "2", label: "config.json" },
 * ]
 *
 * <TreeView data={data} renderNode={(node) => <Text>{node.label}</Text>} />
 * ```
 */
import React, { useCallback, useState } from "react"
import { useInput } from "../hooks/useInput.js"
import { Box } from "./Box.js"
import { Text } from "./Text.js"

// =============================================================================
// Types
// =============================================================================

export interface TreeNode {
  /** Unique identifier for this node */
  id: string
  /** Display label */
  label: string
  /** Child nodes (optional) */
  children?: TreeNode[]
}

export interface TreeViewProps {
  /** Hierarchical data to display */
  data: TreeNode[]
  /** Custom node renderer (default: renders label text) */
  renderNode?: (node: TreeNode, depth: number) => React.ReactNode
  /** Controlled: set of expanded node IDs */
  expandedIds?: Set<string>
  /** Called when expansion state changes */
  onToggle?: (nodeId: string, expanded: boolean) => void
  /** Whether nodes start expanded (default: false) */
  defaultExpanded?: boolean
  /** Whether this component captures input (default: true) */
  isActive?: boolean
  /** Indent per level in characters (default: 2) */
  indent?: number
}

// =============================================================================
// Helpers
// =============================================================================

/** Flatten tree into visible list based on expansion state. */
function flattenTree(
  nodes: TreeNode[],
  expanded: Set<string>,
  depth: number = 0,
): Array<{ node: TreeNode; depth: number }> {
  const result: Array<{ node: TreeNode; depth: number }> = []
  for (const node of nodes) {
    result.push({ node, depth })
    if (node.children && node.children.length > 0 && expanded.has(node.id)) {
      result.push(...flattenTree(node.children, expanded, depth + 1))
    }
  }
  return result
}

/** Collect all node IDs in the tree (for defaultExpanded). */
function collectAllIds(nodes: TreeNode[]): Set<string> {
  const ids = new Set<string>()
  for (const node of nodes) {
    ids.add(node.id)
    if (node.children) {
      for (const id of collectAllIds(node.children)) {
        ids.add(id)
      }
    }
  }
  return ids
}

// =============================================================================
// Component
// =============================================================================

/**
 * Expandable/collapsible tree view.
 *
 * Navigate with Up/Down (or j/k), expand/collapse with Enter or Right/Left.
 * Branch nodes show a triangle indicator (right = collapsed, down = expanded).
 */
export function TreeView({
  data,
  renderNode,
  expandedIds: controlledExpanded,
  onToggle,
  defaultExpanded = false,
  isActive = true,
  indent = 2,
}: TreeViewProps): React.ReactElement {
  const isControlled = controlledExpanded !== undefined

  const [uncontrolledExpanded, setUncontrolledExpanded] = useState<Set<string>>(() =>
    defaultExpanded ? collectAllIds(data) : new Set(),
  )

  const expanded = isControlled ? controlledExpanded : uncontrolledExpanded
  const [cursorIndex, setCursorIndex] = useState(0)

  const flatItems = flattenTree(data, expanded)

  const toggleNode = useCallback(
    (nodeId: string) => {
      const isExpanded = expanded.has(nodeId)
      if (!isControlled) {
        setUncontrolledExpanded((prev) => {
          const next = new Set(prev)
          if (isExpanded) {
            next.delete(nodeId)
          } else {
            next.add(nodeId)
          }
          return next
        })
      }
      onToggle?.(nodeId, !isExpanded)
    },
    [expanded, isControlled, onToggle],
  )

  useInput(
    (input, key) => {
      if (flatItems.length === 0) return

      // Navigate up
      if (key.upArrow || input === "k") {
        setCursorIndex((prev) => Math.max(0, prev - 1))
        return
      }

      // Navigate down
      if (key.downArrow || input === "j") {
        setCursorIndex((prev) => Math.min(flatItems.length - 1, prev + 1))
        return
      }

      // Expand / toggle
      if (key.return || key.rightArrow) {
        const item = flatItems[cursorIndex]
        if (item && item.node.children && item.node.children.length > 0) {
          if (!expanded.has(item.node.id)) {
            toggleNode(item.node.id)
          } else if (key.return) {
            // Enter on already-expanded = collapse
            toggleNode(item.node.id)
          }
        }
        return
      }

      // Collapse
      if (key.leftArrow) {
        const item = flatItems[cursorIndex]
        if (item && expanded.has(item.node.id)) {
          toggleNode(item.node.id)
        }
        return
      }
    },
    { isActive },
  )

  if (flatItems.length === 0) {
    return (
      <Box>
        <Text color="$disabledfg">No items</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      {flatItems.map(({ node, depth }, i) => {
        const isCursor = i === cursorIndex
        const hasChildren = node.children && node.children.length > 0
        const isExpanded = expanded.has(node.id)
        const prefix = hasChildren ? (isExpanded ? "v " : "> ") : "  "
        const padding = " ".repeat(depth * indent)

        return (
          <Text key={node.id} inverse={isCursor}>
            {padding}
            <Text color={hasChildren ? "$primary" : "$fg"}>{prefix}</Text>
            {renderNode ? renderNode(node, depth) : <Text>{node.label}</Text>}
          </Text>
        )
      })}
    </Box>
  )
}
