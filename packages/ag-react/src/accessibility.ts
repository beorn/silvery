/**
 * Screen Reader Mode — ARIA-based accessible text rendering.
 *
 * Walks a React element tree and produces plain text output with
 * ARIA roles, labels, and states for screen reader consumption.
 *
 * Rules:
 * - `aria-hidden` → skip element entirely
 * - `display="none"` → skip element entirely
 * - `aria-label` → use label instead of children text
 * - `aria-role` → prefix with "role: "
 * - `aria-state` → prepend active states as "(state) "
 * - Row direction → space-separated children
 * - Column direction → newline-separated children
 * - Plain text content (no ANSI codes)
 */

import React, { type ReactNode } from "react"

// =============================================================================
// Types
// =============================================================================

/**
 * ARIA state flags that can be set on elements via `aria-state` prop.
 */
export interface AriaState {
  busy?: boolean
  checked?: boolean
  disabled?: boolean
  expanded?: boolean
  multiline?: boolean
  multiselectable?: boolean
  readonly?: boolean
  required?: boolean
  selected?: boolean
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Walk a React element tree and produce accessible text output.
 *
 * @param node - React node to render as screen reader text
 * @returns Plain text with ARIA annotations
 */
export function renderScreenReaderOutput(node: React.ReactNode): string {
  return walkNode(node, "row")
}

// =============================================================================
// Internal
// =============================================================================

/**
 * Recursively walk a React node and produce screen reader text.
 * @param node - React node to walk
 * @param parentDirection - flex direction of the parent container
 */
function walkNode(node: React.ReactNode, parentDirection: "row" | "column"): string {
  // Null, undefined, boolean → empty
  if (node == null || typeof node === "boolean") {
    return ""
  }

  // String or number → literal text
  if (typeof node === "string" || typeof node === "number") {
    return String(node)
  }

  // Arrays/fragments → join children
  if (Array.isArray(node)) {
    const parts = node
      .map((child) => walkNode(child as ReactNode, parentDirection))
      .filter((s) => s !== "")
    const sep = parentDirection === "column" ? "\n" : " "
    return parts.join(sep)
  }

  // React element
  if (React.isValidElement(node)) {
    const props = node.props as Record<string, any>

    // aria-hidden → skip entirely
    if (props["aria-hidden"]) {
      return ""
    }

    // display="none" → skip entirely
    if (props.display === "none") {
      return ""
    }

    // Determine this element's flex direction
    const direction: "row" | "column" = props.flexDirection === "column" ? "column" : "row"

    // Build the content: aria-label overrides children
    let content: string
    if (props["aria-label"] != null) {
      content = String(props["aria-label"])
    } else {
      // Walk children
      const children = props.children
      content = walkChildren(children, direction)
    }

    // Build ARIA state prefix
    const statePrefix = buildStatePrefix(props["aria-state"])

    // Build role prefix
    const role = props["aria-role"]

    // Assemble output
    if (role && statePrefix) {
      return `${role}: ${statePrefix}${content}`
    }
    if (role) {
      return `${role}: ${content}`
    }
    if (statePrefix) {
      return `${statePrefix}${content}`
    }

    return content
  }

  return ""
}

/**
 * Walk children of a React element, joining with direction-appropriate separator.
 */
function walkChildren(children: React.ReactNode, direction: "row" | "column"): string {
  if (children == null) return ""

  // Single child
  if (!Array.isArray(children)) {
    // React.Children.toArray normalizes fragments, filters nulls
    const childArray = React.Children.toArray(children)
    if (childArray.length <= 1) {
      return walkNode(children, direction)
    }
    const parts = childArray.map((child) => walkNode(child, direction)).filter((s) => s !== "")
    const sep = direction === "column" ? "\n" : " "
    return parts.join(sep)
  }

  // Array of children
  const parts = children
    .map((child) => walkNode(child as ReactNode, direction))
    .filter((s) => s !== "")
  const sep = direction === "column" ? "\n" : " "
  return parts.join(sep)
}

/**
 * Build the state prefix string from aria-state object.
 * Active (truthy) states become "(stateName) " prefix.
 */
function buildStatePrefix(state: AriaState | undefined): string {
  if (!state) return ""

  const activeStates: string[] = []
  // Check each state in a consistent order
  const stateNames: (keyof AriaState)[] = [
    "busy",
    "checked",
    "disabled",
    "expanded",
    "multiline",
    "multiselectable",
    "readonly",
    "required",
    "selected",
  ]

  for (const name of stateNames) {
    if (state[name]) {
      activeStates.push(`(${name})`)
    }
  }

  if (activeStates.length === 0) return ""
  return activeStates.join(" ") + " "
}
