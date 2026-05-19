/**
 * Render-path debug primitive — query the live AgNode tree to answer
 * "what is the parent chain of component X?" without grepping source.
 *
 * Use case: visual / first-paint / layout bugs where the bead reporter
 * thinks component X renders inside lane A, but the actual mounted tree
 * has it inside lane B. Static-trace this BEFORE /pro to catch
 * misframed beads early. See bead @km/silvery/14348-render-path-trace.
 *
 * No instrumentation required — reads directly from the committed
 * AgNode tree. Pairs with `silvery:mount` lifecycle logs (which fire on
 * every mount/update/unmount) for time-series instrumentation.
 *
 * Sibling primitive to:
 *   - `silvery:cls` (ClsMonitor) — detects layout SHIFTS
 *   - `silvery:mount` (logNodeLifecycle) — logs mount/update/unmount events
 *
 * Render-path answers a different question: "where does X actually live
 * in the tree right now?"
 */

import type { AgNode, AgNodeType } from "@silvery/ag/types"

/**
 * A summary of one node in a render-path or mount-tree dump.
 * The shape is JSON-serializable for snapshot tests.
 */
export interface RenderPathNode {
  /** Component name (data-component prop, or `${hostType}#${testID|id}`, or hostType) */
  name: string
  /** AgNode host type (silvery-box, silvery-text, silvery-root) */
  type: AgNodeType
  /** Optional content-relative position from layout phase */
  boxRect?: { x: number; y: number; width: number; height: number }
}

/** Recursive mount tree — name + children for snapshot-friendly dumps. */
export interface MountTree extends RenderPathNode {
  children: MountTree[]
}

function hostTypeLabel(type: AgNodeType): string {
  if (type === "silvery-box") return "Box"
  if (type === "silvery-text") return "Text"
  return type
}

/**
 * Resolve a node to its display name.
 * Mirrors `getDebugComponentName` in reconciler/host-config.ts (kept in
 * sync; if you change one, update the other).
 */
export function getComponentName(node: AgNode): string {
  const props = node.props as Record<string, unknown>
  const explicit = props["data-component"]
  if (typeof explicit === "string" && explicit.length > 0) return explicit
  const base = hostTypeLabel(node.type)
  const testID = props.testID
  if (typeof testID === "string" && testID.length > 0) return `${base}#${testID}`
  const id = props.id
  if (typeof id === "string" && id.length > 0) return `${base}#${id}`
  return base
}

function summarize(node: AgNode): RenderPathNode {
  const out: RenderPathNode = { name: getComponentName(node), type: node.type }
  if (node.boxRect) {
    out.boxRect = {
      x: node.boxRect.x,
      y: node.boxRect.y,
      width: node.boxRect.width,
      height: node.boxRect.height,
    }
  }
  return out
}

/**
 * Find every AgNode whose component name matches `componentName`.
 * Match is exact string equality on `getComponentName(node)`.
 *
 * Walks the tree rooted at `root`. Returns nodes in tree order (DFS pre-order).
 */
export function findNodesByComponentName(root: AgNode, componentName: string): AgNode[] {
  const out: AgNode[] = []
  function walk(node: AgNode): void {
    if (getComponentName(node) === componentName) out.push(node)
    for (const child of node.children) walk(child)
  }
  walk(root)
  return out
}

/**
 * Return the parent chain from `root` down to the first node matching
 * `componentName`. Each element is a `RenderPathNode` summary.
 *
 * Returns `[]` if no match is found.
 *
 * If multiple nodes match, returns the path to the FIRST in tree order.
 * Use `findNodesByComponentName` to inspect all matches.
 */
export function getRenderPath(root: AgNode, componentName: string): RenderPathNode[] {
  function walk(node: AgNode, chain: AgNode[]): AgNode[] | null {
    const next = [...chain, node]
    if (getComponentName(node) === componentName) return next
    for (const child of node.children) {
      const hit = walk(child, next)
      if (hit) return hit
    }
    return null
  }
  const hit = walk(root, [])
  return hit ? hit.map(summarize) : []
}

/**
 * Recursive JSON dump of the entire mount tree rooted at `root`.
 *
 * Useful for snapshot tests asserting on structural invariants —
 * e.g., "ToolBlock is always wrapped in a Content.Body[width=full]".
 */
export function getMountTree(root: AgNode): MountTree {
  return {
    ...summarize(root),
    children: root.children.map(getMountTree),
  }
}

/**
 * Format a render-path chain as a human-readable string. One-liner
 * suitable for console.log or debug-log output.
 *
 * Example: `Root > Content > MeasuredLayoutProbe > ChatBlockList > ToolBlock`
 */
export function formatRenderPath(path: RenderPathNode[]): string {
  return path.map((n) => n.name).join(" > ")
}

/**
 * Convenience: log the render path of `componentName` to console.
 * Equivalent to `console.log(formatRenderPath(getRenderPath(root, componentName)))`.
 */
export function printRenderPath(root: AgNode, componentName: string): void {
  const path = getRenderPath(root, componentName)
  if (path.length === 0) {
    console.log(`[render-path] ${componentName}: NOT FOUND`)
    return
  }
  console.log(`[render-path] ${formatRenderPath(path)}`)
}
