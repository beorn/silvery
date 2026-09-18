/**
 * MarkdownView — minimal Markdown → Silvery renderer.
 *
 * Renders a Markdown string as styled TUI blocks: ATX headings, paragraphs
 * (with hard-wrap reflow), bold / italic / inline-code / link inline spans,
 * fenced code blocks, blockquotes, bullet + ordered lists, and horizontal
 * rules. Inline and block styling map onto the Typography presets (H1..H6,
 * Strong, Em, Code, Blockquote, HR) and semantic theme tokens — never raw SGR
 * attributes or hardcoded colors — so output adapts to any Sterling theme
 * automatically (The Silvery Way §6).
 *
 * ## Paragraph reflow (the point)
 *
 * Authored hard-wraps inside a paragraph are joined into one logical line and
 * re-wrapped to the container width — the terminal, not the author, decides
 * where lines break. A blank line separates paragraphs. This is the key
 * difference from splitting text on `"\n"` and printing each line verbatim: a
 * commit body wrapped at 72 columns reflows cleanly into a narrow detail pane
 * instead of showing mangled mid-word breaks.
 *
 * ```tsx
 * <MarkdownView source={pr.description} />
 * <Prose><MarkdownView source={longText} /></Prose>
 * ```
 *
 * ## Scope (intentionally minimal)
 *
 * A pragmatic subset, not a CommonMark implementation: no tables, reference
 * links, raw HTML, setext headings, or nested-emphasis edge cases. Fenced code
 * preserves authored lines and uses the shared SyntaxHighlighter, including
 * its language label and collapsible frame. When a consumer needs more, grow
 * the parser here rather than pre-formatting Markdown at the call site.
 */

import { Fragment, type JSX, type ReactNode } from "react"
import { Box, type BoxProps } from "../../components/Box"
import { Text } from "../../components/Text"
import { Link } from "../../components/Link"
import { Blockquote, Code, Em, H1, H2, H3, H4, H5, H6, HR, Strong } from "./Typography"
import { HeadingRow } from "./HeadingRow"
import { SyntaxHighlighter } from "./SyntaxHighlighter"

// ============================================================================
// Block model
// ============================================================================

interface MdListItem {
  /** Item text with authored hard-wraps joined for reflow. */
  text: string
  /** A nested sub-list, when the item has more-indented list children. */
  list?: MdList
}

interface MdList {
  ordered: boolean
  items: MdListItem[]
}

type MdBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "code"; lines: string[]; language: string }
  | { kind: "quote"; text: string }
  | { kind: "hr" }
  | { kind: "list"; list: MdList }

// ============================================================================
// Line classifiers
// ============================================================================

const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*)$/u
const HR_RE = /^\s{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/u
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+-]*)\s*$/u
const FENCE_CLOSE_RE = /^\s{0,3}(`{3,}|~{3,})\s*$/u
const QUOTE_RE = /^\s{0,3}>\s?(.*)$/u
const LIST_ITEM_RE = /^(\s*)(?:[-*+]|\d{1,9}[.)])\s+(.*)$/u
const ORDERED_MARKER_RE = /^\s*\d/u

interface FenceInfo {
  ch: string
  len: number
  language: string
}

function matchFenceOpen(line: string): FenceInfo | null {
  const m = FENCE_RE.exec(line)
  if (m === null) return null
  const run = m[1] ?? ""
  return { ch: run[0] ?? "`", len: run.length, language: m[2] ?? "" }
}

function matchFenceClose(line: string, fence: FenceInfo): boolean {
  const m = FENCE_CLOSE_RE.exec(line)
  if (m === null) return false
  const run = m[1] ?? ""
  return run[0] === fence.ch && run.length >= fence.len
}

interface ListItemMatch {
  indent: number
  ordered: boolean
  content: string
}

function matchListItem(line: string): ListItemMatch | null {
  const m = LIST_ITEM_RE.exec(line)
  if (m === null) return null
  const indent = (m[1] ?? "").length
  const ordered = ORDERED_MARKER_RE.test(line)
  return { indent, ordered, content: m[2] ?? "" }
}

function leadingIndent(line: string): number {
  return line.length - line.trimStart().length
}

/**
 * True when a line begins a new block. Used to end a paragraph the moment the
 * next line opens a heading / list / fence / quote / rule, so a paragraph never
 * swallows a following block.
 */
function isBlockStart(line: string): boolean {
  return (
    matchFenceOpen(line) !== null ||
    HEADING_RE.test(line) ||
    HR_RE.test(line) ||
    QUOTE_RE.test(line) ||
    matchListItem(line) !== null
  )
}

// ============================================================================
// Block parser
// ============================================================================

/**
 * Parse Markdown source into a flat list of blocks. Pure and synchronous —
 * exported for direct unit testing of the block structure.
 */
export function parseMarkdownBlocks(source: string): MdBlock[] {
  const lines = source.replace(/\r\n?/gu, "\n").split("\n")
  const blocks: MdBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ""
    if (line.trim() === "") {
      i++
      continue
    }

    const fence = matchFenceOpen(line)
    if (fence !== null) {
      const [block, next] = collectFence(lines, i, fence)
      blocks.push(block)
      i = next
      continue
    }

    const heading = HEADING_RE.exec(line)
    if (heading !== null) {
      const level = (heading[1] ?? "#").length
      const text = (heading[2] ?? "").replace(/\s+#+\s*$/u, "").trim()
      blocks.push({ kind: "heading", level, text })
      i++
      continue
    }

    if (HR_RE.test(line)) {
      blocks.push({ kind: "hr" })
      i++
      continue
    }

    if (QUOTE_RE.test(line)) {
      const [block, next] = collectQuote(lines, i)
      blocks.push(block)
      i = next
      continue
    }

    if (matchListItem(line) !== null) {
      const [list, next] = collectList(lines, i, leadingIndent(line))
      blocks.push({ kind: "list", list })
      i = next
      continue
    }

    const [para, next] = collectParagraph(lines, i)
    blocks.push(para)
    i = next
  }
  return blocks
}

function collectFence(lines: string[], start: number, fence: FenceInfo): [MdBlock, number] {
  const body: string[] = []
  let i = start + 1
  while (i < lines.length) {
    const line = lines[i] ?? ""
    if (matchFenceClose(line, fence)) {
      i++
      break
    }
    body.push(line)
    i++
  }
  return [{ kind: "code", lines: body, language: fence.language }, i]
}

function collectQuote(lines: string[], start: number): [MdBlock, number] {
  const parts: string[] = []
  let i = start
  while (i < lines.length) {
    const m = QUOTE_RE.exec(lines[i] ?? "")
    if (m === null) break
    parts.push((m[1] ?? "").trim())
    i++
  }
  // Reflow the quote: join non-empty quoted lines with a space.
  const text = parts.filter((part) => part !== "").join(" ")
  return [{ kind: "quote", text }, i]
}

function collectParagraph(lines: string[], start: number): [MdBlock, number] {
  const buf: string[] = []
  let i = start
  while (i < lines.length) {
    const line = lines[i] ?? ""
    if (line.trim() === "") break
    if (i !== start && isBlockStart(line)) break
    buf.push(line.trim())
    i++
  }
  return [{ kind: "paragraph", text: buf.join(" ") }, i]
}

/**
 * Collect one list starting at `start`, where `baseIndent` is the indentation of
 * the first item. Sibling items sit within `[baseIndent, baseIndent+1]` (a
 * one-space tolerance for ragged `1.`/`10.` alignment); more-indented items form
 * a nested sub-list; indented non-item lines are continuation text joined into
 * the current item (reflow). A blank line only continues the list when the next
 * non-blank line is still a list item at `>= baseIndent`.
 */
function collectList(lines: string[], start: number, baseIndent: number): [MdList, number] {
  const first = matchListItem(lines[start] ?? "")
  const ordered = first?.ordered ?? false
  const items: MdListItem[] = []
  let i = start

  const nextListItem = (from: number): { index: number; match: ListItemMatch } | null => {
    let j = from
    while (j < lines.length && (lines[j] ?? "").trim() === "") j++
    const match = j < lines.length ? matchListItem(lines[j] ?? "") : null
    return match === null ? null : { index: j, match }
  }

  while (i < lines.length) {
    const line = lines[i] ?? ""
    if (line.trim() === "") {
      const upcoming = nextListItem(i + 1)
      if (upcoming !== null && upcoming.match.indent >= baseIndent) {
        i = upcoming.index
        continue
      }
      break
    }

    const item = matchListItem(line)
    if (item === null || item.indent < baseIndent) break

    if (item.indent > baseIndent + 1) {
      // A more-indented item with no sibling above it — start a nested list and
      // attach it to the last sibling (or as a standalone item if none).
      const [sublist, next] = collectList(lines, i, item.indent)
      const last = items.at(-1)
      if (last !== undefined) last.list = sublist
      else items.push({ text: "", list: sublist })
      i = next
      continue
    }

    // A sibling item at this level.
    const current: MdListItem = { text: item.content.trim() }
    items.push(current)
    i++

    // Absorb continuation lines and nested sub-lists that belong to this item.
    while (i < lines.length) {
      const cont = lines[i] ?? ""
      if (cont.trim() === "") {
        const upcoming = nextListItem(i + 1)
        if (upcoming !== null && upcoming.match.indent > baseIndent + 1) {
          i = upcoming.index
          continue
        }
        break
      }
      const nested = matchListItem(cont)
      if (nested !== null && nested.indent > baseIndent + 1) {
        const [sublist, next] = collectList(lines, i, nested.indent)
        current.list = sublist
        i = next
        continue
      }
      if (nested !== null && nested.indent >= baseIndent) break // sibling → outer loop
      if (leadingIndent(cont) > baseIndent) {
        current.text = `${current.text} ${cont.trim()}`.trim()
        i++
        continue
      }
      break
    }
  }

  return [{ ordered, items }, i]
}

// ============================================================================
// Inline parser
// ============================================================================

const INLINE_CODE_RE = /`([^`]+?)`/u
const BOLD_ITALIC_RE = /(\*\*\*|___)(.+?)\1/u
const BOLD_RE = /(\*\*|__)(.+?)\1/u
const ITALIC_RE = /(\*|_)(.+?)\1/u
const LINK_RE = /\[([^\]]+?)\]\(([^)\s]+?)\)/u

interface InlineCandidate {
  start: number
  end: number
  build: (key: string) => ReactNode
}

/** Find the earliest inline construct in `s`; ties resolve by precedence. */
function findInline(s: string): InlineCandidate | null {
  const candidates: InlineCandidate[] = []

  const code = INLINE_CODE_RE.exec(s)
  if (code !== null) {
    const content = code[1] ?? ""
    candidates.push({
      start: code.index,
      end: code.index + code[0].length,
      build: (key) => <Code key={key}>{content}</Code>,
    })
  }

  const boldItalic = BOLD_ITALIC_RE.exec(s)
  if (boldItalic !== null) {
    const content = boldItalic[2] ?? ""
    candidates.push({
      start: boldItalic.index,
      end: boldItalic.index + boldItalic[0].length,
      build: (key) => (
        <Strong key={key}>
          <Em>{parseInline(content, key)}</Em>
        </Strong>
      ),
    })
  }

  const bold = BOLD_RE.exec(s)
  if (bold !== null) {
    const content = bold[2] ?? ""
    candidates.push({
      start: bold.index,
      end: bold.index + bold[0].length,
      build: (key) => <Strong key={key}>{parseInline(content, key)}</Strong>,
    })
  }

  const italic = ITALIC_RE.exec(s)
  if (italic !== null) {
    const content = italic[2] ?? ""
    candidates.push({
      start: italic.index,
      end: italic.index + italic[0].length,
      build: (key) => <Em key={key}>{parseInline(content, key)}</Em>,
    })
  }

  const link = LINK_RE.exec(s)
  if (link !== null) {
    const label = link[1] ?? ""
    const href = link[2]
    if (href === undefined) throw new Error("Markdown link match is missing its destination")
    candidates.push({
      start: link.index,
      end: link.index + link[0].length,
      build: (key) => (
        <Link key={key} href={href}>
          {parseInline(label, key)}
        </Link>
      ),
    })
  }

  let best: InlineCandidate | null = null
  for (const candidate of candidates) {
    // Strict `<` keeps the earlier-pushed candidate on ties → precedence order
    // (code, bold-italic, bold, italic, link).
    if (best === null || candidate.start < best.start) best = candidate
  }
  return best
}

/**
 * Parse a single logical line into inline nodes (plain strings + styled
 * preset spans). Emphasis and link labels recurse for nested styling; inline
 * code content is literal.
 */
export function parseInline(text: string, keyPrefix = "md"): ReactNode[] {
  const nodes: ReactNode[] = []
  let rest = text
  let index = 0
  // Guard against a pathological non-advancing loop; each iteration consumes at
  // least one construct or exits.
  let guard = 0
  while (rest.length > 0 && guard < 5000) {
    guard++
    const token = findInline(rest)
    if (token === null) {
      nodes.push(rest)
      break
    }
    if (token.start > 0) nodes.push(rest.slice(0, token.start))
    nodes.push(token.build(`${keyPrefix}-${index}`))
    index++
    rest = rest.slice(token.end)
  }
  return nodes
}

// ============================================================================
// Renderers
// ============================================================================

const HEADINGS = [H1, H2, H3, H4, H5, H6] as const
function renderList(list: MdList, keyPrefix: string, depth = 0): JSX.Element {
  return (
    <Box flexDirection="column" minWidth={0}>
      {list.items.map((item, index) => {
        const key = `${keyPrefix}-${index}`
        const marker = list.ordered ? `${index + 1}.` : "•"
        return (
          <Box key={key} flexDirection="column" minWidth={0}>
            <Box flexDirection="row" minWidth={0}>
              <Text color="$fg-muted" flexShrink={0}>
                {"  ".repeat(depth)}
                {marker}{" "}
              </Text>
              <Box flexShrink={1} minWidth={0}>
                <Text variant="body" wrap="wrap">
                  {parseInline(item.text, key)}
                </Text>
              </Box>
            </Box>
            {item.list === undefined ? null : renderList(item.list, `${key}-sub`, depth + 1)}
          </Box>
        )
      })}
    </Box>
  )
}

/** Fenced source uses the shared code surface and preserves authored lines. */
function CodeFence({ lines, language }: { lines: string[]; language: string }): JSX.Element {
  return (
    <Box minWidth={0} marginX={-2}>
      <SyntaxHighlighter language={language} code={lines.join("\n")} />
    </Box>
  )
}

function renderBlock(block: MdBlock, key: string, previous: MdBlock | undefined): ReactNode {
  switch (block.kind) {
    case "heading": {
      const Heading = HEADINGS[Math.min(Math.max(block.level, 1), 6) - 1] ?? H1
      const afterBody =
        previous !== undefined && previous.kind !== "heading" && previous.kind !== "hr"
      return (
        <Box marginTop={block.level <= 2 && afterBody ? 1 : 0} minWidth={0}>
          <HeadingRow level={block.level}>
            <Heading wrap="wrap">{parseInline(block.text, key)}</Heading>
          </HeadingRow>
        </Box>
      )
    }
    case "paragraph":
      return (
        <Text variant="body" wrap="wrap">
          {parseInline(block.text, key)}
        </Text>
      )
    case "code":
      return <CodeFence lines={block.lines} language={block.language} />
    case "quote":
      return <Blockquote>{parseInline(block.text, key)}</Blockquote>
    case "hr":
      return <HR />
    case "list":
      return renderList(block.list, key)
    default: {
      const exhaustive: never = block
      throw new Error(`MarkdownView: unhandled block ${JSON.stringify(exhaustive)}`)
    }
  }
}

// ============================================================================
// Component
// ============================================================================

export interface MarkdownViewProps extends Omit<BoxProps, "children"> {
  /** Markdown source text. */
  source: string
}

/**
 * Render Markdown `source` as themed Silvery blocks. See the file header for the
 * supported subset and the paragraph-reflow contract. Any `BoxProps` (padding,
 * gap, width, color, …) pass through to the outer column; `gap` defaults to 1
 * row between blocks so paragraphs and lists breathe.
 */
export function MarkdownView({ source, ...boxProps }: MarkdownViewProps): JSX.Element {
  const blocks = parseMarkdownBlocks(source)
  return (
    <Box width="100%" flexDirection="column" flexShrink={1} minWidth={0} gap={1} {...boxProps}>
      {blocks.map((block, index) => (
        <Fragment key={index}>{renderBlock(block, `b${index}`, blocks[index - 1])}</Fragment>
      ))}
    </Box>
  )
}
