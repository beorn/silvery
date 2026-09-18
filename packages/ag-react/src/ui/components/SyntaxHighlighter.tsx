import { useCallback, useEffect, useId, useRef, useState } from "react"
import type { ReactElement } from "react"
import { computeMatchRanges, type SearchMatch } from "@silvery/ag-term/search-overlay"
import { highlight, type TokenLine } from "@silvery/syntax"
import { Box } from "../../components/Box"
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
  return (
    <Text color="mix($fg, $fg-muted, 50%)" wrap={lineWrap} backgroundColor={backgroundColor}>
      {line.tokens.map((token, tokenIndex) => (
        <Text
          key={tokenIndex}
          color={
            token.color === undefined
              ? undefined
              : `mix(${token.color}, mix($fg, $fg-muted, 50%), 50%)`
          }
          bold={forceBold || token.bold}
          italic={token.italic}
          backgroundColor={backgroundColor}
        >
          {token.text}
        </Text>
      ))}
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
