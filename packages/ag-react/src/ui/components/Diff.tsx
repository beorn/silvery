/**
 * Diff Component
 *
 * Renders a unified diff (text-only at v0 — no syntax highlighting). Each
 * row carries a +/- marker and an optional line-number gutter. Use for
 * tool-call results, code reviews, file-edit previews. Highlighting via
 * the <Code> primitive will land in a follow-up
 * (km-silvery.code-tree-sitter).
 *
 * Usage:
 * ```tsx
 * <Diff
 *   hunks={[
 *     {
 *       oldStart: 10, newStart: 10,
 *       lines: [
 *         { kind: "context", text: "function greet() {" },
 *         { kind: "remove", text: "  return 'hi'" },
 *         { kind: "add", text: "  return 'hello'" },
 *         { kind: "context", text: "}" },
 *       ],
 *     },
 *   ]}
 * />
 * ```
 *
 * Variants:
 * - `unified` (default) — single column with +/- markers
 * - `side-by-side` — split removes/adds across two columns
 *
 * Line numbers: pass `showLineNumbers` to render an old/new gutter.
 * Numbers compute from `oldStart` / `newStart` plus row offsets within
 * the hunk.
 */
import React from "react"
import { Box } from "../../components/Box"
import type { BoxProps } from "../../components/Box"
import { Text } from "../../components/Text"
import { LineNumber } from "./LineNumber"

// =============================================================================
// Types
// =============================================================================

/** A single line inside a hunk. `kind` drives rendering and gutter math. */
export interface DiffLine {
  kind: "context" | "add" | "remove"
  text: string
}

/** A contiguous run of lines from one place in the file. */
export interface DiffHunk {
  /** 1-indexed start line in the OLD file. */
  oldStart: number
  /** 1-indexed start line in the NEW file. */
  newStart: number
  /** Optional header label (e.g., function name shown by `git diff`). */
  header?: string
  /** Lines in display order. */
  lines: ReadonlyArray<DiffLine>
}

export type DiffMode = "unified" | "side-by-side"

export interface DiffProps extends Omit<BoxProps, "children"> {
  hunks: ReadonlyArray<DiffHunk>
  /** Render mode. Default `unified`. */
  mode?: DiffMode
  /** Render an old/new line-number gutter. Default true. */
  showLineNumbers?: boolean
  /** Width for each line-number column. Auto-derives from largest line. */
  lineNumberWidth?: number
}

// =============================================================================
// Internal helpers
// =============================================================================

function maxLineNumber(hunks: ReadonlyArray<DiffHunk>): number {
  let max = 0
  for (const h of hunks) {
    let oldN = h.oldStart - 1
    let newN = h.newStart - 1
    for (const line of h.lines) {
      if (line.kind !== "add") oldN++
      if (line.kind !== "remove") newN++
    }
    if (oldN > max) max = oldN
    if (newN > max) max = newN
  }
  return max
}

const MARKER: Record<DiffLine["kind"], string> = {
  context: " ",
  add: "+",
  remove: "-",
}

// Text-color tokens for diff lines. Use semantic status tokens — they
// resolve consistently across themes; `$success` and `$error` carry the
// add/remove signal even on monochrome / colorblind-safe palettes when
// paired with the `+`/`-` markers.
const COLOR: Record<DiffLine["kind"], string> = {
  context: "$muted",
  add: "$success",
  remove: "$error",
}

// =============================================================================
// Unified renderer
// =============================================================================

function UnifiedHunk({
  hunk,
  showLineNumbers,
  lineNumberWidth,
}: {
  hunk: DiffHunk
  showLineNumbers: boolean
  lineNumberWidth: number
}): React.ReactElement {
  let oldN = hunk.oldStart
  let newN = hunk.newStart
  return (
    <Box flexDirection="column">
      {hunk.header ? (
        <Box>
          <Text color="$muted">@@ -{hunk.oldStart},+{hunk.newStart} @@ {hunk.header}</Text>
        </Box>
      ) : null}
      {hunk.lines.map((line, i) => {
        const showOld = line.kind !== "add"
        const showNew = line.kind !== "remove"
        const oldDisplay = showOld ? oldN : undefined
        const newDisplay = showNew ? newN : undefined
        if (showOld) oldN++
        if (showNew) newN++
        return (
          <Box key={i}>
            {showLineNumbers ? (
              <>
                {oldDisplay !== undefined ? (
                  <LineNumber n={oldDisplay} width={lineNumberWidth} />
                ) : (
                  <Box width={lineNumberWidth} />
                )}
                <Text> </Text>
                {newDisplay !== undefined ? (
                  <LineNumber n={newDisplay} width={lineNumberWidth} />
                ) : (
                  <Box width={lineNumberWidth} />
                )}
                <Text> </Text>
              </>
            ) : null}
            <Text color={COLOR[line.kind]}>
              {MARKER[line.kind]} {line.text}
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}

// =============================================================================
// Side-by-side renderer
// =============================================================================

function SideBySideHunk({
  hunk,
  showLineNumbers,
  lineNumberWidth,
}: {
  hunk: DiffHunk
  showLineNumbers: boolean
  lineNumberWidth: number
}): React.ReactElement {
  // Pair removes against adds row-by-row; context lines fill both columns.
  type Row = { left: { n: number; line?: DiffLine }; right: { n: number; line?: DiffLine } }
  const rows: Row[] = []
  let oldN = hunk.oldStart
  let newN = hunk.newStart
  for (let i = 0; i < hunk.lines.length; i++) {
    const line = hunk.lines[i]
    if (!line) continue
    if (line.kind === "context") {
      rows.push({ left: { n: oldN, line }, right: { n: newN, line } })
      oldN++
      newN++
    } else if (line.kind === "remove") {
      const next = hunk.lines[i + 1]
      if (next?.kind === "add") {
        rows.push({ left: { n: oldN, line }, right: { n: newN, line: next } })
        oldN++
        newN++
        i++
      } else {
        rows.push({ left: { n: oldN, line }, right: { n: newN } })
        oldN++
      }
    } else {
      rows.push({ left: { n: oldN }, right: { n: newN, line } })
      newN++
    }
  }
  return (
    <Box flexDirection="column">
      {hunk.header ? (
        <Box>
          <Text color="$muted">@@ -{hunk.oldStart},+{hunk.newStart} @@ {hunk.header}</Text>
        </Box>
      ) : null}
      {rows.map((row, i) => (
        <Box key={i}>
          {showLineNumbers ? (
            row.left.line ? (
              <LineNumber n={row.left.n} width={lineNumberWidth} />
            ) : (
              <Box width={lineNumberWidth} />
            )
          ) : null}
          <Text> </Text>
          {row.left.line ? (
            <Text color={COLOR[row.left.line.kind]}>
              {MARKER[row.left.line.kind]} {row.left.line.text}
            </Text>
          ) : (
            <Text> </Text>
          )}
          <Text color="$muted"> │ </Text>
          {showLineNumbers ? (
            row.right.line ? (
              <LineNumber n={row.right.n} width={lineNumberWidth} />
            ) : (
              <Box width={lineNumberWidth} />
            )
          ) : null}
          <Text> </Text>
          {row.right.line ? (
            <Text color={COLOR[row.right.line.kind]}>
              {MARKER[row.right.line.kind]} {row.right.line.text}
            </Text>
          ) : (
            <Text> </Text>
          )}
        </Box>
      ))}
    </Box>
  )
}

// =============================================================================
// Component
// =============================================================================

export function Diff({
  hunks,
  mode = "unified",
  showLineNumbers = true,
  lineNumberWidth,
  ...rest
}: DiffProps): React.ReactElement {
  const w = lineNumberWidth ?? String(maxLineNumber(hunks)).length
  return (
    <Box flexDirection="column" {...rest}>
      {hunks.map((hunk, i) => {
        const props = { hunk, showLineNumbers, lineNumberWidth: w }
        return mode === "side-by-side" ? <SideBySideHunk key={i} {...props} /> : <UnifiedHunk key={i} {...props} />
      })}
    </Box>
  )
}
