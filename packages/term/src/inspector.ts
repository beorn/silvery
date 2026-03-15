/**
 * silvery Inspector — Debug introspection for rendering pipeline.
 *
 * Activate with SILVERY_DEV=1 env var or by calling enableInspector().
 * Outputs debug info to stderr or a log file (never to the TUI stdout).
 *
 * Features:
 * - Component tree dump (with layout rects)
 * - Focus path display
 * - Render stats (frame time, dirty rows, cell changes)
 * - Dirty region visualization
 *
 * This is DISTINCT from React DevTools (devtools.ts). This inspector provides
 * silvery-specific introspection: render pipeline stats, focus tree, dirty regions,
 * layout info.
 */

import type { createWriteStream as createWriteStreamType } from "node:fs"
import type { RenderStats } from "./scheduler"
import type { TeaNode } from "@silvery/tea/types"

// =============================================================================
// Types
// =============================================================================

export interface InspectorOptions {
  /** Output stream (default: process.stderr) */
  output?: NodeJS.WritableStream
  /** Log file path (overrides output stream) */
  logFile?: string
  /** Include layout rects in tree dump */
  showLayout?: boolean
  /** Include style info in tree dump */
  showStyles?: boolean
}

// =============================================================================
// State
// =============================================================================

let inspectorEnabled = false
let inspectorOutput: NodeJS.WritableStream = process.stderr

// =============================================================================
// Public API
// =============================================================================

/** Enable the silvery inspector. */
export function enableInspector(options?: InspectorOptions): void {
  inspectorEnabled = true
  if (options?.logFile) {
    // Dynamic require to avoid pulling in fs for non-inspector users
    const fs: { createWriteStream: typeof createWriteStreamType } = require("node:fs")
    inspectorOutput = fs.createWriteStream(options.logFile, { flags: "a" })
  } else if (options?.output) {
    inspectorOutput = options.output
  } else {
    inspectorOutput = process.stderr
  }
}

/** Disable the inspector. */
export function disableInspector(): void {
  inspectorEnabled = false
}

/** Check if inspector is active. */
export function isInspectorEnabled(): boolean {
  return inspectorEnabled
}

/**
 * Log render stats after each frame.
 *
 * Called by the scheduler after executeRender completes. When the inspector
 * is disabled this is a no-op (zero overhead).
 */
export function inspectFrame(stats: RenderStats): void {
  if (!inspectorEnabled) return
  const line =
    `[silvery] frame #${stats.renderCount} ` +
    `${stats.lastRenderTime.toFixed(1)}ms ` +
    `avg=${stats.avgRenderTime.toFixed(1)}ms ` +
    `skipped=${stats.skippedCount}\n`
  inspectorOutput.write(line)
}

/**
 * Dump the component tree structure as indented text.
 *
 * Walks the SilveryNode tree and formats each node with its type, testID,
 * layout rect, and dirty flags.
 */
export function inspectTree(rootNode: TeaNode, options?: { depth?: number; showLayout?: boolean }): string {
  const maxDepth = options?.depth ?? 10
  const showLayout = options?.showLayout ?? true
  const lines: string[] = []

  function walk(node: TeaNode, indent: number): void {
    if (indent > maxDepth) return

    const prefix = "  ".repeat(indent)
    const type = node.type
    const testID = (node.props as Record<string, unknown>)?.testID
    const idStr = testID ? ` #${testID}` : ""

    // Layout rect from computed layout node or contentRect
    let rectStr = ""
    if (showLayout) {
      if (node.contentRect) {
        const r = node.contentRect
        rectStr = ` [${r.x},${r.y} ${r.width}x${r.height}]`
      } else if (node.layoutNode) {
        const ln = node.layoutNode
        rectStr = ` [${ln.getComputedLeft()},${ln.getComputedTop()} ${ln.getComputedWidth()}x${ln.getComputedHeight()}]`
      }
    }

    // Dirty flags
    const dirtyFlags: string[] = []
    if (node.layoutDirty) dirtyFlags.push("layout")
    if (node.contentDirty) dirtyFlags.push("content")
    if (node.stylePropsDirty) dirtyFlags.push("paint")
    if (node.bgDirty) dirtyFlags.push("bg")
    if (node.subtreeDirty) dirtyFlags.push("subtree")
    if (node.childrenDirty) dirtyFlags.push("children")
    const dirtyStr = dirtyFlags.length > 0 ? ` dirty=[${dirtyFlags.join(",")}]` : ""

    // Text content (for text nodes)
    const textStr = node.textContent
      ? ` "${node.textContent.slice(0, 30)}${node.textContent.length > 30 ? "..." : ""}"`
      : ""

    lines.push(`${prefix}${type}${idStr}${rectStr}${dirtyStr}${textStr}`)

    for (const child of node.children) {
      walk(child, indent + 1)
    }
  }

  walk(rootNode, 0)
  return lines.join("\n")
}

/**
 * Auto-enable if SILVERY_DEV=1 is set.
 *
 * Call this at startup to respect the environment variable convention.
 */
export function autoEnableInspector(): void {
  if (process.env.SILVERY_DEV === "1" || process.env.SILVERY_DEV === "true") {
    const logFile = process.env.SILVERY_DEV_LOG
    enableInspector(logFile ? { logFile } : undefined)
  }
}
