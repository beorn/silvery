/**
 * Ink-compatible renderToString helper using silvery's renderStringSync.
 *
 * Applies ANSI conversion (silvery → chalk format), VS16 stripping,
 * content height trimming, and empty fragment detection to match Ink output.
 */
import React from "react"
import { renderStringSync } from "../../../../packages/ag-react/src/render-string"
import { ensureDefaultLayoutEngine, isLayoutEngineInitialized } from "../../../../packages/ag-term/src/layout-engine"
import { createTerm } from "../../../../packages/ag-term/src/ansi"
import { TermContext } from "../../../../packages/ag-react/src/context"
import { currentChalkLevel, restoreColonFormatSGR } from "../../../../packages/ink/src/ink"
import { stripAnsi } from "../../../../packages/ag-term/src/unicode"
import chalk, { supportsColor } from "@silvery/ink/chalk"

type RenderToStringOptions = {
  columns?: number
}

let engineReady = false

async function ensureEngine(): Promise<void> {
  if (engineReady || isLayoutEngineInitialized()) {
    engineReady = true
    return
  }
  await ensureDefaultLayoutEngine()
  engineReady = true
}

function doRender(node: React.JSX.Element, options?: RenderToStringOptions): string {
  const chalkHasColors = currentChalkLevel() > 0
  const colorLevel = chalkHasColors ? ("truecolor" as const) : null
  const term = createTerm({ color: colorLevel })
  const plain = term.hasColor() === null
  const wrapped = React.createElement(TermContext.Provider, { value: term }, node)

  const bufferHeight = 24
  let layoutContentHeight = 0
  let output = renderStringSync(wrapped as React.ReactElement, {
    width: options?.columns ?? 100,
    height: bufferHeight,
    plain,
    // Always use styled output to preserve embedded ANSI sequences (SGR, OSC
    // hyperlinks) in text content. Ink passes these through regardless of
    // chalk level; silvery's plain mode would strip them via bufferToText.
    alwaysStyled: true,
    trimTrailingWhitespace: true,
    trimEmptyLines: false,
    onContentHeight: (h: number) => {
      layoutContentHeight = h
    },
  })

  // NOTE: VS16 stripping removed — silvery's ensureEmojiPresentation adds VS16
  // to text-presentation emojis, but we preserve them since Ink also preserves
  // user-provided VS16. The compat layer in ink.ts still strips VS16 in the
  // render() path for the upstream compat test runner.
  output = restoreColonFormatSGR(output)

  // Trim buffer padding rows using content height from layout
  if (layoutContentHeight > 0 && layoutContentHeight < bufferHeight) {
    const lines = output.split("\n")
    output = lines.slice(0, layoutContentHeight).join("\n")
  } else {
    // Fall back: strip trailing empty lines (content height unknown or fills buffer)
    const lines = output.split("\n")
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop()
    output = lines.join("\n")
  }

  // Empty fragment → empty string (strip ANSI to detect styled-but-empty output)
  if (stripAnsi(output).trim() === "") return ""

  return output
}

/**
 * Synchronous render to string (requires layout engine to be initialized).
 */
export const renderToString = (node: React.JSX.Element, options?: RenderToStringOptions): string => {
  if (!isLayoutEngineInitialized()) {
    throw new Error("Layout engine not initialized. Call initLayoutEngine() in beforeAll().")
  }
  return doRender(node, options)
}

/**
 * Async render to string (auto-initializes layout engine).
 */
export const renderToStringAsync = async (
  node: React.JSX.Element,
  options?: RenderToStringOptions,
): Promise<string> => {
  await ensureEngine()
  return doRender(node, options)
}

/**
 * Initialize the layout engine (call in beforeAll).
 */
export const initLayoutEngine = ensureEngine

/**
 * Force chalk to output colors even in non-TTY environments for testing.
 */
export function enableTestColors(): void {
  chalk.level = 3
}

/**
 * Restore chalk's automatic color detection.
 */
export function disableTestColors(): void {
  chalk.level = supportsColor ? supportsColor.level : 0
}
