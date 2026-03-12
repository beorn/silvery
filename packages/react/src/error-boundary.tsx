/**
 * ErrorBoundary — Built-in error boundary for silvery apps.
 *
 * Catches render errors in the component tree and displays a rich
 * error message with source location, code excerpt, and stack trace
 * using low-level silvery host elements (no dependency on Box/Text
 * from @silvery/ui). This is the default root wrapper for all
 * silvery apps — createApp() and run() wrap the element tree with it
 * automatically.
 *
 * Uses `silvery-box` and `silvery-text` host elements directly to
 * avoid circular deps with higher-level component libraries.
 *
 * @packageDocumentation
 */

import * as fs from "node:fs"
import React, { Component } from "react"

// ============================================================================
// Types
// ============================================================================

export interface SilveryErrorBoundaryProps {
  children?: React.ReactNode
  /** Called when an error is caught. Use for logging or cleanup. */
  onError?: (error: Error) => void
}

interface SilveryErrorBoundaryState {
  error: Error | null
}

// ============================================================================
// Stack parsing utilities
// ============================================================================

/**
 * Parse a stack line to extract function name, file, line, column.
 * Handles both `at Foo (file:line:col)` and `at file:line:col` formats.
 */
function parseStackLine(
  line: string,
): { function?: string; file?: string; line?: number; column?: number } | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith("at ")) return null

  const rest = trimmed.slice(3)
  // Match: functionName (file:line:col)
  const match1 = rest.match(/^(.+?)\s+\((.+?):(\d+):(\d+)\)$/)
  if (match1) {
    return {
      function: match1[1],
      file: match1[2],
      line: Number(match1[3]),
      column: Number(match1[4]),
    }
  }
  // Match: file:line:col (no function name)
  const match2 = rest.match(/^(.+?):(\d+):(\d+)$/)
  if (match2) {
    return { file: match2[1], line: Number(match2[2]), column: Number(match2[3]) }
  }
  return null
}

/**
 * Clean up file path by removing cwd prefix and file:// protocol.
 */
function cleanupPath(filePath: string | undefined): string | undefined {
  if (!filePath) return filePath
  let p = filePath
  const cwdPath = process.cwd()
  // Remove file:// protocol
  p = p.replace(/^file:\/\//, "")
  // Remove cwd prefix
  for (const prefix of [cwdPath, `/private${cwdPath}`]) {
    if (p.startsWith(`${prefix}/`)) {
      p = p.slice(prefix.length + 1)
      break
    }
  }
  return p
}

/**
 * Get source code excerpt around a line number (±3 lines).
 */
function getCodeExcerpt(
  filePath: string,
  line: number,
): Array<{ line: number; value: string }> | null {
  try {
    if (!fs.existsSync(filePath)) return null
    const source = fs.readFileSync(filePath, "utf8")
    const lines = source.split("\n")
    const start = Math.max(0, line - 4)
    const end = Math.min(lines.length, line + 3)
    const result: Array<{ line: number; value: string }> = []
    for (let i = start; i < end; i++) {
      result.push({ line: i + 1, value: (lines[i] ?? "").replace(/\t/g, "  ") })
    }
    return result
  } catch {
    return null
  }
}

// ============================================================================
// Component
// ============================================================================

/**
 * Rich error boundary for silvery's runtime layer.
 *
 * Must be a class component (React limitation for error boundaries).
 * Renders error info using silvery-box/silvery-text host elements — no Box/Text dependency.
 * Shows: ERROR label, error message, file location, source code excerpt, and stack trace.
 */
export class SilveryErrorBoundary extends Component<
  SilveryErrorBoundaryProps,
  SilveryErrorBoundaryState
> {
  override state: SilveryErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): SilveryErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error) {
    this.props.onError?.(error)
  }

  override render() {
    if (this.state.error) {
      const err = this.state.error
      const stack = err.stack ? err.stack.split("\n").slice(1) : []
      const origin = stack.length > 0 ? parseStackLine(stack[0]!) : null
      const filePath = cleanupPath(origin?.file)

      // Get source code excerpt
      let excerpt: Array<{ line: number; value: string }> | null = null
      let lineWidth = 0
      if (filePath && origin?.line) {
        excerpt = getCodeExcerpt(filePath, origin.line)
        if (excerpt) {
          for (const { line } of excerpt) {
            lineWidth = Math.max(lineWidth, String(line).length)
          }
        }
      }

      // Build the error display using silvery host elements
      // Format: padding=1 column layout with ERROR label, location, code, and stack
      const children: React.ReactNode[] = []

      // ERROR label + message
      children.push(
        React.createElement(
          "silvery-box",
          { key: "header" },
          React.createElement(
            "silvery-text",
            { backgroundColor: "red", color: "white" },
            " ERROR ",
          ),
          React.createElement("silvery-text", {}, ` ${err.message}`),
        ),
      )

      // File location
      if (filePath && origin) {
        children.push(
          React.createElement(
            "silvery-box",
            { key: "location", marginTop: 1 },
            React.createElement(
              "silvery-text",
              { dimColor: true },
              `${filePath}:${origin.line}:${origin.column}`,
            ),
          ),
        )
      }

      // Source code excerpt
      if (excerpt && origin) {
        const codeLines = excerpt.map(({ line, value }) => {
          const lineNum = String(line).padStart(lineWidth, " ")
          return React.createElement(
            "silvery-box",
            { key: `code-${line}` },
            React.createElement(
              "silvery-text",
              {
                dimColor: line !== origin.line,
                backgroundColor: line === origin.line ? "red" : undefined,
                color: line === origin.line ? "white" : undefined,
              },
              `${lineNum}:`,
            ),
            React.createElement(
              "silvery-text",
              {
                backgroundColor: line === origin.line ? "red" : undefined,
                color: line === origin.line ? "white" : undefined,
              },
              ` ${value}`,
            ),
          )
        })
        children.push(
          React.createElement(
            "silvery-box",
            { key: "code", marginTop: 1, flexDirection: "column" },
            ...codeLines,
          ),
        )
      }

      // Stack trace
      if (stack.length > 0) {
        const stackLines = stack.map((line, i) => {
          const parsed = parseStackLine(line)
          if (!parsed) {
            return React.createElement(
              "silvery-box",
              { key: `stack-${i}` },
              React.createElement("silvery-text", { dimColor: true }, `- ${line.trim()}`),
            )
          }
          const cleanFile = cleanupPath(parsed.file)
          return React.createElement(
            "silvery-box",
            { key: `stack-${i}` },
            React.createElement("silvery-text", { dimColor: true }, "- "),
            React.createElement(
              "silvery-text",
              { dimColor: true, bold: true },
              parsed.function ?? "",
            ),
            React.createElement(
              "silvery-text",
              { dimColor: true, color: "gray" },
              ` (${cleanFile ?? ""}:${parsed.line}:${parsed.column})`,
            ),
          )
        })
        children.push(
          React.createElement(
            "silvery-box",
            { key: "stack", marginTop: 1, flexDirection: "column" },
            ...stackLines,
          ),
        )
      }

      return React.createElement(
        "silvery-box",
        { flexDirection: "column", padding: 1 },
        ...children,
      )
    }
    return this.props.children
  }
}
