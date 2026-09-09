import React, { useEffect, useId, useRef, useState } from "react"
import { computeMatchRanges, type SearchMatch } from "@silvery/ag-term/search-overlay"
import { displayLength } from "@silvery/ansi"
import { Box } from "../../components/Box"
import { Text } from "../../components/Text"
import { usePopoverHandlers } from "../../components/Popover"
import { Blockquote, H1, H2, H3, H4, H5, H6, HR, Small } from "./Typography"
import { SyntaxHighlighter } from "./SyntaxHighlighter"
import { Prose } from "./Prose"
import { HeadingRow } from "./HeadingRow"
import { Content, type ContentBodyWidth, useContentLayout, useHasContentLayout } from "./Content"
import { StylePriorityProvider } from "../../style-priority"
import { useSearchOptional } from "../../providers/SearchProvider"
import { useTerm } from "../../hooks/useTerm"
import { DEFAULT_BREAKPOINTS } from "../../hooks/useResponsiveValue"
import type { ScrollController } from "./ScrollArea"

export type DocumentBlockId = string | number
export type DocumentLane = ContentBodyWidth

export interface DocumentListItem {
  /** Stable identity for the semantic list containing this item. */
  readonly groupId: DocumentBlockId
  /** Zero-based nesting depth. */
  readonly depth: number
  readonly ordered: boolean
  /** First ordinal for an ordered group. Defaults to 1. */
  readonly start?: number
}

interface DocumentBlockBase {
  readonly id: DocumentBlockId
  readonly lane?: DocumentLane
  /** Non-geometric leaf content such as a measurement registrar. */
  readonly accessory?: React.ReactNode
  /** Content projected from another source; the presenter owns its visual treatment. */
  readonly embed?: { readonly source: string }
  /** Keep this block directly beneath its preceding owner without a paragraph gap. */
  readonly attachedToPrevious?: true
  /**
   * Activate this block — a click on its frame, and whatever key the host
   * binds to the same intent. Presence is what makes a block interactive, so
   * a presenter opts blocks in one at a time rather than DocumentView guessing
   * which kinds are actionable.
   */
  readonly onActivate?: () => void
}

export interface DocumentHeadingBlock extends DocumentBlockBase {
  readonly kind: "heading"
  readonly level: 1 | 2 | 3 | 4 | 5 | 6
  readonly content: React.ReactNode
  /**
   * Optional leaf marker, such as a task checkbox, replacing the default #.
   * DocumentView owns its outdented column so every title stays aligned with
   * ordinary prose, whether it carries a task marker or the default #.
   */
  readonly marker?: React.ReactNode
}

export interface DocumentParagraphBlock extends DocumentBlockBase {
  readonly kind: "paragraph"
  readonly content: React.ReactNode
}

export interface DocumentListItemBlock extends DocumentBlockBase {
  readonly kind: "list-item"
  readonly list: DocumentListItem
  readonly content: React.ReactNode
  /** Optional leaf marker, such as a checkbox. DocumentView still owns its column. */
  readonly marker?: React.ReactNode
  /** Width of a non-text marker in logical layout units. Defaults to one. */
  readonly markerWidth?: number
}

export interface DocumentQuoteBlock extends DocumentBlockBase {
  readonly kind: "quote"
  readonly content: React.ReactNode
}

export interface DocumentCodeBlock extends DocumentBlockBase {
  readonly kind: "code"
  readonly content: string
  readonly language?: string
}

export interface DocumentRuleBlock extends DocumentBlockBase {
  readonly kind: "rule"
}

export interface DocumentTableBlock extends DocumentBlockBase {
  readonly kind: "table"
  readonly headers: readonly string[]
  readonly rows: readonly (readonly string[])[]
  readonly alignments?: readonly ("left" | "right" | "center" | null)[]
}

export interface DocumentExtensionBlock extends DocumentBlockBase {
  /**
   * Registered semantic extension name. The content is leaf/inline content;
   * DocumentView retains the lane, rhythm, wrapping, and row geometry.
   */
  readonly kind: "extension"
  readonly token: string
  readonly content: React.ReactNode
}

/**
 * Geometric document content such as a terminal image. Unlike paragraph and
 * extension content, media is deliberately not wrapped in `<Text>`.
 */
export interface DocumentMediaBlock extends DocumentBlockBase {
  readonly kind: "media"
  readonly content: React.ReactNode
}

export type DocumentBlock =
  | DocumentHeadingBlock
  | DocumentParagraphBlock
  | DocumentListItemBlock
  | DocumentQuoteBlock
  | DocumentCodeBlock
  | DocumentRuleBlock
  | DocumentTableBlock
  | DocumentExtensionBlock
  | DocumentMediaBlock

export interface DocumentViewSearchConfig {
  /** Stable routing id when more than one searchable is mounted. */
  readonly id?: string
  /** Project one semantic block into searchable plain text. */
  readonly getText: (block: DocumentBlock, index: number) => string
  /** Measured viewport controller used to reveal the matching block. */
  readonly scrollController: ScrollController
}

export interface DocumentViewProps {
  readonly blocks: readonly DocumentBlock[]
  readonly selectedId?: DocumentBlockId | null
  readonly empty?: React.ReactNode
  /** Default lane for blocks without an explicit lane. */
  readonly lane?: DocumentLane
  /** Register this semantic document with the enclosing SearchProvider. */
  readonly search?: DocumentViewSearchConfig
  /** Reveal one semantic block from the same measured geometry used by search. */
  readonly reveal?: {
    readonly operationId: string | number
    readonly blockId: DocumentBlockId
    readonly scrollController: ScrollController
  }
}

interface ResolvedListItem {
  readonly marker: React.ReactNode
  readonly markerWidth: number
}

function textMarkerWidth(marker: React.ReactNode): number | null {
  // `displayLength`, not `.length`: this width indents every line of the list
  // item, so it is terminal columns. The built-in markers are all one cell, but
  // a caller-supplied emoji or CJK marker is two and would shift the whole block.
  if (typeof marker === "string") return displayLength(marker)
  if (typeof marker === "number") return displayLength(String(marker))
  return null
}

function resolveListItems(
  blocks: readonly DocumentBlock[],
): ReadonlyMap<DocumentBlockId, ResolvedListItem> {
  const groupCounts = new Map<DocumentBlockId, number>()
  const groupWidths = new Map<DocumentBlockId, number>()
  const provisional = new Map<
    DocumentBlockId,
    { marker: React.ReactNode; width: number; groupId: DocumentBlockId }
  >()

  for (const block of blocks) {
    if (block.kind !== "list-item") continue
    const count = groupCounts.get(block.list.groupId) ?? 0
    groupCounts.set(block.list.groupId, count + 1)
    const marker =
      block.marker ?? (block.list.ordered ? `${(block.list.start ?? 1) + count}.` : "•")
    const width = Math.max(1, block.markerWidth ?? textMarkerWidth(marker) ?? 1)
    provisional.set(block.id, { marker, width, groupId: block.list.groupId })
    groupWidths.set(block.list.groupId, Math.max(groupWidths.get(block.list.groupId) ?? 0, width))
  }

  return new Map(
    [...provisional].map(([id, item]) => [
      id,
      {
        marker: item.marker,
        markerWidth: groupWidths.get(item.groupId) ?? item.width,
      },
    ]),
  )
}

/**
 * Width of the widest heading marker in the document — shared by every
 * heading, not computed per-row like list markers, because the design
 * intent is column ALIGNMENT: a task heading's checkbox and a non-task
 * heading's # must start titles at the same column. At least one cell is
 * reserved for the default #, including documents without task headings.
 *
 * The gutter HANGS in the title's own left margin — it does not push the
 * title right, relative to any OTHER heading in the document (marked or
 * not) OR to a fully marker-less document (see `HeadingRow`,
 * `DOCUMENT_MIN_GUTTER`). `markerWidth + 1` — marker glyph, then one
 * visible gap cell — is the space it needs; `DocumentView` separately
 * guarantees at least that much margin is always there to hang into,
 * whether or not this particular document happens to use heading markers.
 */
function resolveHeadingMarkerWidth(blocks: readonly DocumentBlock[]): number {
  let width = 1
  for (const block of blocks) {
    if (block.kind !== "heading" || block.marker === undefined) continue
    width = Math.max(width, textMarkerWidth(block.marker) ?? 1)
  }
  return width
}

function isListBlock(block: DocumentBlock | undefined): block is DocumentListItemBlock {
  return block?.kind === "list-item"
}

function revealDocumentBlock(
  blocks: readonly DocumentBlock[],
  rowOffsets: ReadonlyMap<DocumentBlockId, number>,
  blockId: DocumentBlockId,
  scrollController: ScrollController,
): boolean {
  if (scrollController.viewportHeight === 0) return false
  const first = blocks[0]
  if (!first) return false
  const y = rowOffsets.get(blockId)
  const firstY = rowOffsets.get(first.id)
  if (y === undefined || firstY === undefined) return false
  const offset = Math.max(0, y - firstY)
  if (scrollController.contentHeight <= offset) return false
  scrollController.setScrollOffset(offset)
  return true
}

function BlockFrame({
  block,
  selected,
  lane,
  marginTop,
  marginBottom,
  onLayout,
  children,
}: {
  block: DocumentBlock
  selected: boolean
  lane: DocumentLane
  marginTop?: number
  marginBottom?: number
  onLayout?: (y: number) => void
  children: React.ReactNode
}): React.ReactElement {
  const popover = usePopoverHandlers(
    { body: <Text color="$fg-muted">{block.embed?.source}</Text> },
    { trigger: "hover" },
  )
  const background = selected ? "$bg-selected" : block.embed ? "mix($fg-link, $bg, 95%)" : undefined
  return (
    <Content.Row>
      <Content.Body width={lane}>
        <Box
          id={String(block.id)}
          testID={String(block.id)}
          data-document-row
          data-document-block-kind={block.kind}
          data-cursor={selected ? true : undefined}
          focusable
          onClick={block.onActivate}
          minWidth={0}
          width={block.embed ? "100%" : undefined}
          paddingRight={block.embed ? 2 : undefined}
          marginTop={block.attachedToPrevious ? 0 : marginTop}
          marginBottom={marginBottom}
          onLayout={onLayout ? (rect) => onLayout(rect.y) : undefined}
          backgroundColor={background}
          color={selected ? "$fg-on-selected" : undefined}
          onMouseEnter={block.embed ? popover.onMouseEnter : undefined}
          onMouseLeave={block.embed ? popover.onMouseLeave : undefined}
        >
          <StylePriorityProvider
            foreground={selected ? "$fg-on-selected" : undefined}
            background={background}
          >
            {block.accessory}
            {children}
          </StylePriorityProvider>
          {block.embed ? (
            <Box position="absolute" right={0} top={0} width={1}>
              <Text color={selected ? "$fg-on-selected" : "mix($fg-link, $bg, 75%)"}>→</Text>
            </Box>
          ) : null}
        </Box>
      </Content.Body>
    </Content.Row>
  )
}

function ListItemRow({
  block,
  item,
  selected,
  lane,
  onLayout,
}: {
  block: DocumentListItemBlock
  item: ResolvedListItem
  selected: boolean
  lane: DocumentLane
  onLayout?: (y: number) => void
}): React.ReactElement {
  const color = selected ? "$fg-on-selected" : undefined
  return (
    <BlockFrame block={block} selected={selected} lane={lane} onLayout={onLayout}>
      <Box
        flexDirection="row"
        width="100%"
        minWidth={0}
        paddingLeft={Math.max(0, block.list.depth) * 2}
      >
        <Box
          width={item.markerWidth}
          minWidth={item.markerWidth}
          flexShrink={0}
          justifyContent="flex-end"
        >
          <Text color={color ?? "$fg-muted"}>{item.marker}</Text>
        </Box>
        <Box width={1} minWidth={1} flexShrink={0} />
        <Prose flexGrow={1} minWidth={0}>
          <Text variant="body" color={color} wrap="wrap">
            {block.content}
          </Text>
        </Prose>
      </Box>
    </BlockFrame>
  )
}

function DocumentBlocks({
  blocks,
  selectedId,
  empty,
  lane,
  compact,
  onBlockLayout,
  collapsedCode,
  onCodeExpandedChange,
}: Required<Pick<DocumentViewProps, "blocks" | "lane">> &
  Pick<DocumentViewProps, "selectedId" | "empty"> & {
    compact: boolean
    onBlockLayout?: (id: DocumentBlockId, y: number) => void
    collapsedCode: ReadonlySet<DocumentBlockId>
    onCodeExpandedChange: (id: DocumentBlockId, expanded: boolean) => void
  }): React.ReactElement {
  const resolvedLists = resolveListItems(blocks)
  const headingMarkerWidth = resolveHeadingMarkerWidth(blocks)
  if (blocks.length === 0) {
    return (
      <Content.Row>
        <Content.Body width={lane}>
          <Small>{empty ?? "(empty document)"}</Small>
        </Content.Body>
      </Content.Row>
    )
  }

  return (
    <Box flexDirection="column" minWidth={0}>
      {blocks.map((block, index) => {
        const selected = block.id === selectedId
        const blockLane = compact && block.kind === "table" ? "prose" : (block.lane ?? lane)
        const previous = blocks[index - 1]
        const afterList = !isListBlock(block) && isListBlock(previous)
        const bottomMargin = blocks[index + 1]?.attachedToPrevious ? 0 : 1

        switch (block.kind) {
          case "heading": {
            const headings = [H1, H2, H3, H4, H5, H6] as const
            const Heading = headings[block.level - 1] ?? H6
            const afterBody =
              previous !== undefined &&
              previous.kind !== "heading" &&
              previous.kind !== "rule" &&
              previous.kind !== "media"
            const extraSpace = block.level <= 2 && afterBody
            const topMargin = (afterList ? 1 : 0) + (extraSpace ? 1 : 0)
            const headingNode = (
              <Heading color={selected ? "$fg-on-selected" : undefined} wrap="wrap">
                {block.content}
              </Heading>
            )
            return (
              <BlockFrame
                key={block.id}
                block={block}
                selected={selected}
                lane={blockLane}
                marginTop={topMargin || undefined}
                marginBottom={bottomMargin}
                onLayout={(y) => onBlockLayout?.(block.id, y)}
              >
                <HeadingRow
                  level={block.level}
                  markerWidth={headingMarkerWidth}
                  marker={block.marker}
                  color={selected ? "$fg-on-selected" : undefined}
                >
                  {headingNode}
                </HeadingRow>
              </BlockFrame>
            )
          }
          case "list-item": {
            const item = resolvedLists.get(block.id)
            if (!item) {
              throw new Error(`DocumentView: list item ${String(block.id)} was not resolved`)
            }
            return (
              <ListItemRow
                key={block.id}
                block={block}
                item={item}
                selected={selected}
                lane={blockLane}
                onLayout={(y) => onBlockLayout?.(block.id, y)}
              />
            )
          }
          case "rule":
            return (
              <BlockFrame
                key={block.id}
                block={block}
                selected={selected}
                lane={blockLane}
                marginTop={afterList ? 1 : undefined}
                marginBottom={bottomMargin}
                onLayout={(y) => onBlockLayout?.(block.id, y)}
              >
                <HR />
              </BlockFrame>
            )
          case "quote":
            return (
              <BlockFrame
                key={block.id}
                block={block}
                selected={selected}
                lane={blockLane}
                marginTop={afterList ? 1 : undefined}
                marginBottom={bottomMargin}
                onLayout={(y) => onBlockLayout?.(block.id, y)}
              >
                <Blockquote color={selected ? "$fg-on-selected" : undefined}>
                  {block.content}
                </Blockquote>
              </BlockFrame>
            )
          case "code":
            return (
              <BlockFrame
                key={block.id}
                block={block}
                selected={selected}
                lane={blockLane}
                marginTop={afterList ? 1 : undefined}
                marginBottom={bottomMargin}
                onLayout={(y) => onBlockLayout?.(block.id, y)}
              >
                <Box flexDirection="column" flexGrow={1} minWidth={0} marginLeft={-2}>
                  <SyntaxHighlighter
                    language={block.language ?? "plain"}
                    code={block.content}
                    expanded={!collapsedCode.has(block.id)}
                    onExpandedChange={(expanded) => onCodeExpandedChange(block.id, expanded)}
                  />
                </Box>
              </BlockFrame>
            )
          case "table":
            return (
              <BlockFrame
                key={block.id}
                block={block}
                selected={selected}
                lane={blockLane}
                marginTop={afterList ? 1 : undefined}
                marginBottom={bottomMargin}
                onLayout={(y) => onBlockLayout?.(block.id, y)}
              >
                <Content.Table
                  headers={[...block.headers]}
                  rows={block.rows.map((row) => [...row])}
                  alignments={block.alignments === undefined ? undefined : [...block.alignments]}
                />
              </BlockFrame>
            )
          case "media":
            return (
              <BlockFrame
                key={block.id}
                block={block}
                selected={selected}
                lane={blockLane}
                marginTop={afterList ? 1 : undefined}
                marginBottom={bottomMargin}
                onLayout={(y) => onBlockLayout?.(block.id, y)}
              >
                <Box width="100%" flexDirection="column">
                  {block.content}
                </Box>
              </BlockFrame>
            )
          case "paragraph":
          case "extension":
            return (
              <BlockFrame
                key={block.id}
                block={block}
                selected={selected}
                lane={blockLane}
                marginTop={afterList ? 1 : undefined}
                marginBottom={bottomMargin}
                onLayout={(y) => onBlockLayout?.(block.id, y)}
              >
                <Text variant="body" color={selected ? "$fg-on-selected" : undefined} wrap="wrap">
                  {block.content}
                </Text>
              </BlockFrame>
            )
        }
      })}
    </Box>
  )
}

/** Normal document margin; compact mode keeps only one trailing cell. */
const DOCUMENT_MIN_GUTTER = 2

/**
 * Store-neutral semantic document presenter.
 *
 * Adapters supply identities and inline/leaf content. DocumentView owns block
 * rhythm, Content lanes, list counters, marker cells, gaps, and wrapping.
 */
export function DocumentView({
  blocks,
  selectedId = null,
  empty,
  lane = "prose",
  search,
  reveal,
}: DocumentViewProps): React.ReactElement {
  const hasContentLayout = useHasContentLayout()
  const ambientLayout = useContentLayout()
  const termCols = useTerm((term) => term.size.cols())
  const paneCols = hasContentLayout ? ambientLayout.available : termCols
  const compact = paneCols > 0 && paneCols < DEFAULT_BREAKPOINTS.md
  const markerGutter = resolveHeadingMarkerWidth(blocks) + 1
  const searchContext = useSearchOptional()
  const autoSearchId = useId()
  const searchId = search?.id ?? autoSearchId
  const registerSearchable = searchContext?.registerSearchable
  const searchEnabled = search !== undefined
  const blocksRef = useRef(blocks)
  const searchRef = useRef(search)
  const revealRef = useRef(reveal)
  const revealedOperationRef = useRef<string | number | null>(null)
  const rowOffsetsRef = useRef(new Map<DocumentBlockId, number>())
  const [collapsedCode, setCollapsedCode] = useState<ReadonlySet<DocumentBlockId>>(() => new Set())
  const collapsedCodeRef = useRef(collapsedCode)
  const pendingSearchRevealRef = useRef<DocumentBlockId | null>(null)
  blocksRef.current = blocks
  searchRef.current = search
  revealRef.current = reveal
  collapsedCodeRef.current = collapsedCode

  useEffect(() => {
    if (!searchEnabled || !registerSearchable) return
    return registerSearchable(searchId, {
      search(query: string): SearchMatch[] {
        const currentSearch = searchRef.current
        if (!currentSearch || query === "") return []
        return blocksRef.current.flatMap((block, row) =>
          computeMatchRanges(currentSearch.getText(block, row), query).map((range) => ({
            row,
            startCol: range.start,
            endCol: range.end,
          })),
        )
      },
      reveal(match: SearchMatch): void {
        const currentBlocks = blocksRef.current
        const block = currentBlocks[match.row]
        const currentSearch = searchRef.current
        if (!block || !currentSearch) return
        if (block.kind === "code" && collapsedCodeRef.current.has(block.id)) {
          pendingSearchRevealRef.current = block.id
          setCollapsedCode((current) => {
            const next = new Set(current)
            next.delete(block.id)
            return next
          })
          return
        }
        revealDocumentBlock(
          currentBlocks,
          rowOffsetsRef.current,
          block.id,
          currentSearch.scrollController,
        )
      },
    })
  }, [registerSearchable, searchEnabled, searchId])

  // A collapsed match must acquire its expanded layout before scrolling.
  useEffect(() => {
    const id = pendingSearchRevealRef.current
    const currentSearch = searchRef.current
    if (id === null || !currentSearch || collapsedCode.has(id)) return
    if (
      revealDocumentBlock(
        blocksRef.current,
        rowOffsetsRef.current,
        id,
        currentSearch.scrollController,
      )
    ) {
      pendingSearchRevealRef.current = null
    }
  }, [
    collapsedCode,
    search?.scrollController.contentHeight,
    search?.scrollController.viewportHeight,
  ])

  useEffect(() => {
    const currentReveal = revealRef.current
    if (!currentReveal || revealedOperationRef.current === currentReveal.operationId) return
    if (
      revealDocumentBlock(
        blocksRef.current,
        rowOffsetsRef.current,
        currentReveal.blockId,
        currentReveal.scrollController,
      )
    ) {
      revealedOperationRef.current = currentReveal.operationId
    }
  }, [
    reveal?.operationId,
    reveal?.scrollController.contentHeight,
    reveal?.scrollController.viewportHeight,
  ])

  const currentSearchMatch =
    searchContext && searchContext.currentMatch >= 0
      ? searchContext.matches[searchContext.currentMatch]
      : undefined
  const searchSelectedId =
    search && currentSearchMatch ? blocks[currentSearchMatch.row]?.id : undefined
  const document = (
    <DocumentBlocks
      blocks={blocks}
      selectedId={searchSelectedId ?? selectedId}
      empty={empty}
      lane={lane}
      compact={compact}
      collapsedCode={collapsedCode}
      onCodeExpandedChange={(id, expanded) => {
        setCollapsedCode((current) => {
          const next = new Set(current)
          if (expanded) next.delete(id)
          else next.add(id)
          return next
        })
      }}
      onBlockLayout={(id, y) => {
        rowOffsetsRef.current.set(id, y)
        const currentReveal = revealRef.current
        if (!currentReveal || revealedOperationRef.current === currentReveal.operationId) return
        if (
          revealDocumentBlock(
            blocksRef.current,
            rowOffsetsRef.current,
            currentReveal.blockId,
            currentReveal.scrollController,
          )
        ) {
          revealedOperationRef.current = currentReveal.operationId
        }
      }}
    />
  )
  // Keep ambient wide-lane policy. Compact prose fills the pane, reserving
  // enough leading cells for its heading marker and a single trailing space.
  return (
    <Content.Layout
      fill={false}
      prose={compact ? "100%" : hasContentLayout ? ambientLayout.prose : undefined}
      wide={hasContentLayout ? ambientLayout.wide : undefined}
      align={hasContentLayout ? ambientLayout.align : undefined}
      gap={hasContentLayout ? ambientLayout.gap : undefined}
      gutterMinWidth={{
        left: Math.max(ambientLayout.gutterMinWidth.left, markerGutter),
        right: compact ? 1 : Math.max(ambientLayout.gutterMinWidth.right, DOCUMENT_MIN_GUTTER),
      }}
    >
      {document}
    </Content.Layout>
  )
}
