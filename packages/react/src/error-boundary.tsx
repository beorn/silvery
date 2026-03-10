/**
 * ErrorBoundary — Built-in error boundary for silvery apps.
 *
 * Catches render errors in the component tree and displays a compact
 * error message using low-level silvery-text elements (no dependency on
 * Box/Text from @silvery/ui). This is the default root wrapper for all
 * silvery apps — createApp() and run() wrap the element tree with it
 * automatically.
 *
 * Uses `silvery-text` host elements directly to avoid circular deps
 * with higher-level component libraries.
 *
 * @packageDocumentation
 */

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
// Component
// ============================================================================

/**
 * Lightweight error boundary for silvery's runtime layer.
 *
 * Must be a class component (React limitation for error boundaries).
 * Renders error info using silvery-text host elements — no Box/Text dependency.
 */
export class SilveryErrorBoundary extends Component<SilveryErrorBoundaryProps, SilveryErrorBoundaryState> {
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
      const stack = err.stack ?? ""
      const frames = stack
        .split("\n")
        .filter((line) => line.match(/^\s+at\s/))
        .map((line) => line.trim())
      const firstFrame = frames[0] ?? ""
      const fileMatch = firstFrame.match(/\((.+)\)$/) ?? firstFrame.match(/at (.+)$/)
      const rawLocation = fileMatch?.[1] ?? ""

      let location = rawLocation
      const cwd = process.cwd()
      for (const prefix of [cwd, `/private${cwd}`]) {
        if (location.startsWith(`${prefix}/`)) {
          location = location.slice(prefix.length + 1)
          break
        }
      }

      return React.createElement(
        React.Fragment,
        null,
        React.createElement("silvery-text", { color: "red", bold: true }, "ERROR"),
        " ",
        err.message,
        location ? `\n${location}` : null,
      )
    }
    return this.props.children
  }
}
