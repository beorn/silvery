import { useCallback, useEffect, useId, useRef, useState } from "react"
import type { ReactElement } from "react"
import { findUrls } from "@silvery/ansi"
import { computeMatchRanges, type SearchMatch } from "@silvery/ag-term/search-overlay"
import { highlight, type SyntaxToken, type TokenLine } from "@silvery/syntax"
import { Box } from "../../components/Box"
import { Link } from "../../components/Link"
import { Text } from "../../components/Text"
import { useSearchOptional } from "../../providers/SearchProvider"
import type { ScrollController } from "./ScrollArea"
import { CodeBlock } from "./Typography"

export interface SyntaxHighlighterProps {
  language: string
  code: string
  theme?: string
  bare?: boolean
  backgroundColor?: string
  bold?: boolean
  expanded?: boolean
  defaultExpanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  /** Register this source with the enclosing SearchProvider. */
  search?: {
    readonly id?: string
    readonly scrollController: ScrollController
  }
}

/** Shiki-backed source renderer with an immediate plain-text first frame. */
export function SyntaxHighlighter({
  language,
  code,
  theme = "github-dark",
  bare = false,
  backgroundColor,
  bold: forceBold = false,
  search,
  expanded,
  defaultExpanded,
  onExpandedChange,
}: SyntaxHighlighterProps): ReactElement {
  const lang = (language || "plain").toLowerCase()
  const lines = useSyntaxTokens(code, lang, theme)
  const lineWrap = isDiffLanguage(lang) ? "truncate" : "hard"
  const body = search ? (
    <SearchableSyntaxLines
      code={code}
      lines={lines}
      lineWrap={lineWrap}
      backgroundColor={backgroundColor}
      forceBold={forceBold}
      search={search}
    />
  ) : (
    lines.map((line, lineIndex) => (
      <SyntaxLine
        key={lineIndex}
        line={line}
        lineWrap={lineWrap}
        backgroundColor={backgroundColor}
        forceBold={forceBold}
      />
    ))
  )

  if (bare) return <Box flexDirection="column">{body}</Box>

  return (
    <CodeBlock
      width="auto"
      label={lang}
      content={body}
      expanded={expanded}
      defaultExpanded={defaultExpanded}
      onExpandedChange={onExpandedChange}
      backgroundColor={backgroundColor}
    />
  )
}

function useSyntaxTokens(code: string, language: string, theme: string): TokenLine[] {
  const [lines, setLines] = useState<TokenLine[]>(() =>
    code.split("\n").map((text) => ({ tokens: [{ text }] })),
  )

  useEffect(() => {
    let cancelled = false
    void highlight(code, language, theme).then((result) =>
      cancelled ? undefined : setLines(result),
    )
    return () => {
      cancelled = true
    }
  }, [code, language, theme])

  return lines
}

function isDiffLanguage(language: string): boolean {
  return ["diff", "patch", "udiff", "gitdiff", "git-diff"].includes(language)
}

/** The colour a code-block glyph falls back to — the line's own foreground. */
const LINE_FG = "mix($fg, $fg-muted, 50%)"

/** One styled piece of a line: a whole token, or one side of a URL split. */
interface LinePiece {
  readonly text: string
  readonly color?: string | undefined
  readonly bold?: boolean | undefined
  readonly italic?: boolean | undefined
}

/**
 * A render run: either plain text, or one complete URL with the styled pieces
 * that spell it. One run per URL RANGE (never one per piece) so hover reveal
 * and underline cover the whole URL, the way a prose link does.
 */
interface LineRun {
  readonly href?: string | undefined
  readonly pieces: LinePiece[]
}

function pieceOf(text: string, token: SyntaxToken): LinePiece {
  return { text, color: token.color, bold: token.bold, italic: token.italic }
}

/**
 * Split a highlighted line at URL boundaries so every piece of a URL that wraps
 * across rows carries the same OSC 8 destination.
 *
 * `findUrls` runs once over the JOINED line text: `curl -fsSL https://…` hands
 * shiki the shell word and the URL as separate tokens, so a per-token scan
 * would miss the URL entirely. Each token is then cut at the range edges, every
 * piece keeping its own colour/bold/italic.
 */
function lineRuns(line: TokenLine): LineRun[] {
  const text = line.tokens.map((token) => token.text).join("")
  const ranges = findUrls(text)
  if (ranges.length === 0) {
    return [{ pieces: line.tokens.map((token) => pieceOf(token.text, token)) }]
  }

  const runs: LineRun[] = []
  let current: LineRun | null = null
  const open = (href: string | undefined): LineRun => {
    if (current && current.href === href) return current
    const run: LineRun = href === undefined ? { pieces: [] } : { href, pieces: [] }
    runs.push(run)
    current = run
    return run
  }
  let offset = 0
  for (const token of line.tokens) {
    const tokenStart = offset
    const tokenEnd = offset + token.text.length
    offset = tokenEnd
    let cursor = tokenStart
    for (const range of ranges) {
      if (range.end <= tokenStart || range.start >= tokenEnd) continue
      const from = Math.max(range.start, tokenStart)
      const to = Math.min(range.end, tokenEnd)
      if (from > cursor) open(undefined).pieces.push(pieceOf(text.slice(cursor, from), token))
      open(range.url).pieces.push(pieceOf(text.slice(from, to), token))
      cursor = to
    }
    if (cursor < tokenEnd) open(undefined).pieces.push(pieceOf(text.slice(cursor, tokenEnd), token))
  }

  const kept: LineRun[] = []
  for (const run of runs) {
    const pieces = run.pieces.filter((piece) => piece.text !== "")
    if (pieces.length === 0) continue
    kept.push(run.href === undefined ? { pieces } : { href: run.href, pieces })
  }
  return kept
}

/**
 * One styled run of the line. `color` is ALWAYS explicit: a piece with no
 * shiki colour takes the line's own foreground, never `Link`'s `$fg-link`
 * default, so adding a link never recolours code (AC3).
 */
function SyntaxPiece({
  piece,
  forceBold,
  backgroundColor,
}: {
  readonly piece: LinePiece
  readonly forceBold: boolean
  readonly backgroundColor?: string
}): ReactElement {
  return (
    <Text
      color={piece.color === undefined ? LINE_FG : `mix(${piece.color}, ${LINE_FG}, 50%)`}
      bold={forceBold || piece.bold}
      italic={piece.italic}
      backgroundColor={backgroundColor}
    >
      {piece.text}
    </Text>
  )
}

function SyntaxLine({
  line,
  lineWrap,
  backgroundColor,
  forceBold,
}: {
  readonly line: TokenLine
  readonly lineWrap: "hard" | "truncate"
  readonly backgroundColor?: string
  readonly forceBold: boolean
}): ReactElement {
  if (line.tokens.length === 0 || line.tokens.every((token) => token.text === "")) {
    return <Box height={1} minWidth={0} backgroundColor={backgroundColor} />
  }
  const children: ReactElement[] = []
  for (const [runIndex, run] of lineRuns(line).entries()) {
    if (run.href === undefined) {
      for (const [pieceIndex, piece] of run.pieces.entries()) {
        children.push(
          <SyntaxPiece
            key={`t${runIndex}:${pieceIndex}`}
            piece={piece}
            forceBold={forceBold}
            backgroundColor={backgroundColor}
          />,
        )
      }
      continue
    }
    // One Link per URL range, holding its token-coloured pieces as children,
    // so hover reveal and underline cover the whole URL.
    children.push(
      <Link key={`u${runIndex}`} href={run.href} color={LINE_FG}>
        {run.pieces.map((piece, pieceIndex) => (
          <SyntaxPiece
            key={pieceIndex}
            piece={piece}
            forceBold={forceBold}
            backgroundColor={backgroundColor}
          />
        ))}
      </Link>,
    )
  }
  return (
    <Text color={LINE_FG} wrap={lineWrap} backgroundColor={backgroundColor}>
      {children}
    </Text>
  )
}

interface SearchableSyntaxLinesProps {
  readonly code: string
  readonly lines: readonly TokenLine[]
  readonly lineWrap: "hard" | "truncate"
  readonly backgroundColor?: string
  readonly forceBold: boolean
  readonly search: NonNullable<SyntaxHighlighterProps["search"]>
}

function SearchableSyntaxLines({
  code,
  lines,
  lineWrap,
  backgroundColor,
  forceBold,
  search,
}: SearchableSyntaxLinesProps): ReactElement {
  const searchContext = useSearchOptional()
  const autoSearchId = useId()
  const searchId = search.id ?? autoSearchId
  const registerSearchable = searchContext?.registerSearchable
  const searchRef = useRef(search)
  const sourceRef = useRef({ code, lines: code.split("\n"), origins: new Map<number, number>() })
  searchRef.current = search
  if (sourceRef.current.code !== code) {
    sourceRef.current = { code, lines: code.split("\n"), origins: new Map() }
  }
  const recordLineOrigin = useCallback((lineIndex: number, y: number) => {
    sourceRef.current.origins.set(lineIndex, y)
  }, [])

  useEffect(() => {
    if (!registerSearchable) return
    return registerSearchable(searchId, {
      search(query: string): SearchMatch[] {
        if (query === "") return []
        return sourceRef.current.lines.flatMap((line, row) =>
          computeMatchRanges(line, query).map((range) => ({
            row,
            startCol: range.start,
            endCol: range.end,
          })),
        )
      },
      reveal(match: SearchMatch): void {
        const origins = sourceRef.current.origins
        const y = origins.get(match.row)
        const firstY = origins.get(0)
        if (y === undefined || firstY === undefined) return
        searchRef.current.scrollController.setScrollOffset(Math.max(0, y - firstY))
      },
    })
  }, [registerSearchable, searchId])

  return (
    <>
      {lines.map((line, lineIndex) => (
        <Box
          key={lineIndex}
          minWidth={0}
          flexDirection="row"
          onLayout={(rect) => recordLineOrigin(lineIndex, rect.y)}
        >
          <SyntaxLine
            line={line}
            lineWrap={lineWrap}
            backgroundColor={backgroundColor}
            forceBold={forceBold}
          />
        </Box>
      ))}
    </>
  )
}
