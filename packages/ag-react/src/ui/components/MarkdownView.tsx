import { Fragment, useMemo, type JSX, type ReactNode } from "react"
import type { Nodes, PhrasingContent, RootContent, List } from "mdast"
import { parsePreparedMarkdown, type PreparedMarkdown } from "../../markdown"
import { Box, type BoxProps } from "../../components/Box"
import { Text } from "../../components/Text"
import { Link } from "../../components/Link"
import { Blockquote, Code, Em, H1, H2, H3, H4, H5, H6, HR, Strong, unorderedListMarker } from "./Typography"
import { HeadingRow } from "./HeadingRow"
import { SyntaxHighlighter } from "./SyntaxHighlighter"
import { Prose } from "./Prose"
import { Content, useContentLayout, useHasContentLayout } from "./Content"

export type MarkdownInlineKind = "heading" | "paragraph" | "listItem" | "quote"

export interface MarkdownViewProps extends Omit<BoxProps, "children"> {
  source: string
  presentation?: "blocks" | "prose"
  prosePlacement?: "none" | "body" | "local"
  /** Table presentation inside Content.Layout; defaults to content. */
  tableLayout?: "content" | "inline"
  textIndent?: number
  subdueHeadings?: boolean
  prepareSource?: (source: string) => PreparedMarkdown
  renderInline?: (nodes: readonly PhrasingContent[], kind: MarkdownInlineKind) => ReactNode
}

const HEADINGS = [H1, H2, H3, H4, H5, H6] as const

/** One native tree dispatcher; callers customize preparation and phrasing, never blocks. */
export function MarkdownView({
  source,
  presentation = "blocks",
  prosePlacement = "none",
  tableLayout = "content",
  textIndent = 0,
  subdueHeadings = false,
  prepareSource,
  renderInline,
  ...boxProps
}: MarkdownViewProps): JSX.Element {
  const prepared = useMemo(
    () => prepareSource ? prepareSource(source) : { parseSource: source, fallbackSource: source },
    [source, prepareSource],
  )
  const root = useMemo(() => parsePreparedMarkdown(prepared), [prepared])
  const contentLayout = useContentLayout()
  const hasContentLayout = useHasContentLayout()
  const prose = presentation === "prose"

  function authored(node: Nodes): string {
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    if (start === undefined || end === undefined) {
      throw new Error(`MarkdownView: visible ${node.type} has no authored source span`)
    }
    return prepared.parseSource.slice(start, end)
  }

  function plain(node: Nodes): string {
    if ("value" in node && typeof node.value === "string") return node.value
    if (node.type === "image" || node.type === "imageReference") return node.alt ?? ""
    if (node.type === "break") return "\n"
    if ("children" in node) return node.children.map(plain).join("")
    return authored(node)
  }

  function genericInline(nodes: readonly PhrasingContent[]): ReactNode {
    return nodes.map((node, index) => {
      const children = "children" in node ? genericInline(node.children) : null
      switch (node.type) {
        case "text": return <Fragment key={index}>{node.value.replace(/\s*\n\s*/gu, " ")}</Fragment>
        case "strong": return <Strong key={index}>{children}</Strong>
        case "emphasis": return <Em key={index}>{children}</Em>
        case "inlineCode": return <Code key={index}>{node.value}</Code>
        case "link": return <Link key={index} href={node.url}>{children}</Link>
        case "break": return <Fragment key={index}>{"\n"}</Fragment>
        case "delete": return <Fragment key={index}>{children}</Fragment>
        default: return <Fragment key={index}>{plain(node)}</Fragment>
      }
    })
  }

  function inline(nodes: readonly PhrasingContent[], kind: MarkdownInlineKind): ReactNode {
    return renderInline ? renderInline(nodes, kind) : genericInline(nodes)
  }

  function place(child: ReactNode): ReactNode {
    let result = child
    if (textIndent > 0 && prose) {
      result = <Box flexDirection="row" minWidth={0}>
        <Box width={textIndent} flexShrink={0} />
        <Box flexDirection="column" flexGrow={1} minWidth={0}>{result}</Box>
      </Box>
    }
    if (prosePlacement === "body") return <Content.Body width="prose">{result}</Content.Body>
    if (prosePlacement === "local") {
      return <Box flexDirection="column" width={contentLayout.prose} maxWidth="100%" minWidth={0}>{result}</Box>
    }
    return result
  }

  function renderList(list: List, depth: number): ReactNode {
    return <Box flexDirection="column" minWidth={0}>
      {list.children.map((item, index) => {
        const marker = list.ordered
          ? `${(prose ? list.start ?? 1 : 1) + index}.`
          : prose ? "•" : unorderedListMarker(depth)
        const first = item.children[0]
        const text = first?.type === "paragraph" ? inline(first.children, "listItem") : null
        const body = prose
          ? <Prose flexGrow={1} minWidth={0}>{text}</Prose>
          : <Box flexShrink={1} minWidth={0}><Text variant="body" wrap="wrap">{text}</Text></Box>
        const row = prose
          ? <Box flexDirection="row" gap={1} paddingLeft={depth * 2} flexShrink={0}>
              <Text color="$muted" backgroundColor={boxProps.backgroundColor} flexShrink={0}>{marker}</Text>{body}
            </Box>
          : <Box flexDirection="row" minWidth={0}>
              <Text color="$fg-muted" flexShrink={0}>{"  ".repeat(depth)}{marker}{" "}</Text>{body}
            </Box>
        return <Fragment key={index}>
          {first?.type === "paragraph" ? place(row) : null}
          {item.children.slice(first?.type === "paragraph" ? 1 : 0).map((child, childIndex) =>
            <Fragment key={childIndex}>{renderBlock(child, undefined, depth + 1)}</Fragment>,
          )}
        </Fragment>
      })}
    </Box>
  }

  function renderBlock(node: RootContent, previous: RootContent | undefined, depth = 0): ReactNode {
    switch (node.type) {
      case "heading": {
        const Heading = HEADINGS[node.depth - 1] ?? H1
        const afterBody = previous !== undefined && previous.type !== "heading" && previous.type !== "thematicBreak"
        const text = inline(node.children, "heading")
        const heading = subdueHeadings ? <Text wrap="wrap">{text}</Text> : <Heading wrap="wrap">{text}</Heading>
        return place(<Box marginTop={node.depth <= 2 && afterBody ? 1 : 0} minWidth={0}>
          {prose ? heading : <HeadingRow level={node.depth}>{heading}</HeadingRow>}
        </Box>)
      }
      case "paragraph": {
        const text = inline(node.children, "paragraph")
        return place(renderInline ? text : <Text variant="body" wrap="wrap">{text}</Text>)
      }
      case "list": return renderList(node, depth)
      case "code": return <SyntaxHighlighter language={node.lang || "plain"} code={node.value} />
      case "blockquote": {
        const children: PhrasingContent[] = node.children.flatMap((child, index) => {
          const body: PhrasingContent[] = child.type === "paragraph" || child.type === "heading"
            ? child.children : [{ type: "text", value: plain(child) }]
          return index === 0 ? body : [{ type: "text", value: "\n" }, ...body]
        })
        return place(<Blockquote>{inline(children, "quote")}</Blockquote>)
      }
      case "thematicBreak": return <HR />
      case "table": {
        const [header, ...body] = node.children
        const headers = header?.children.map(plain) ?? []
        const rows = body.map((row) => row.children.map(plain))
        return hasContentLayout && tableLayout !== "inline"
          ? <Content.Table headers={headers} rows={rows} alignments={node.align} />
          : <Box flexDirection="column" gap={1} borderStyle="single" borderColor="$border" paddingX={1}>
              {rows.map((row, index) => <Box key={index} flexDirection="column" minWidth={0}>
                {headers.map((label, column) => <Text key={column} wrap="wrap"><Text bold>{label}:</Text> {row[column] ?? ""}</Text>)}
              </Box>)}
            </Box>
      }
      case "definition": return prose ? null : place(<Text variant="body" wrap="wrap">{authored(node)}</Text>)
      case "html": return place(<Text variant="body" wrap="wrap">{node.value}</Text>)
      default: return place(<Text variant="body" wrap="wrap">{authored(node)}</Text>)
    }
  }

  const children = root.children.map((node, index) => {
    const previous = root.children[index - 1]
    const gap = prose && previous !== undefined && node.type !== "definition" && previous.type !== "definition"
    return <Fragment key={index}>{gap ? <Box height={1} flexShrink={0} /> : null}{renderBlock(node, previous)}</Fragment>
  })
  return prose
    ? <Prose minWidth={0} {...boxProps}>{children}</Prose>
    : <Box width="100%" flexDirection="column" flexShrink={1} minWidth={0} gap={1} {...boxProps}>{children}</Box>
}
