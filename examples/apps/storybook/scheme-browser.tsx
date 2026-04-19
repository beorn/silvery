/**
 * SchemeBrowser — scrollable list of all bundled schemes with mini swatches.
 *
 * Pure presentational component. The parent owns selectedIndex and passes
 * the list of entries.
 */

import React from "react"
import { Box, Text, Muted, Divider, Small } from "silvery"
import type { StorybookEntry } from "./types"

interface Props {
  entries: StorybookEntry[]
  selectedIndex: number
  /** When true, a faint secondary cursor marker (for compare mode). */
  secondaryIndex?: number
  /** Title shown at the top of the list. */
  title?: string
  /** Fixed column width. */
  width?: number
}

function MiniSwatch({ entry }: { entry: StorybookEntry }) {
  const { palette } = entry
  return (
    <Text>
      <Text color={palette.red}>{"█"}</Text>
      <Text color={palette.green}>{"█"}</Text>
      <Text color={palette.blue}>{"█"}</Text>
      <Text color={palette.yellow}>{"█"}</Text>
      <Text color={palette.magenta}>{"█"}</Text>
      <Text color={palette.cyan}>{"█"}</Text>
    </Text>
  )
}

/** A non-selectable divider row used to separate light/dark groups. */
function SectionDivider({ label }: { label: string }) {
  return (
    <Box>
      <Small>
        <Muted>{label}</Muted>
      </Small>
    </Box>
  )
}

export function SchemeBrowser({
  entries,
  selectedIndex,
  secondaryIndex,
  title = "Color Schemes",
  width = 36,
}: Props) {
  // Split entries into dark-first then light, preserving relative order within each group.
  // We build a flat render list that interleaves non-selectable section headers.
  // selectedIndex / secondaryIndex refer to positions in `entries` (the original array),
  // so we just compare against the entry's original index.

  const dark = entries.filter((e) => e.dark)
  const light = entries.filter((e) => !e.dark)

  type RenderItem =
    | { kind: "header"; label: string; leadingGap: boolean }
    | { kind: "entry"; entry: StorybookEntry; originalIndex: number }

  const renderList: RenderItem[] = []
  if (dark.length > 0) {
    renderList.push({ kind: "header", label: `── dark (${dark.length}) ──`, leadingGap: false })
    for (const entry of dark) {
      renderList.push({ kind: "entry", entry, originalIndex: entries.indexOf(entry) })
    }
  }
  if (light.length > 0) {
    renderList.push({ kind: "header", label: `── light (${light.length}) ──`, leadingGap: true })
    for (const entry of light) {
      renderList.push({ kind: "entry", entry, originalIndex: entries.indexOf(entry) })
    }
  }

  // The swatch cluster is 6 chars wide. The name column fills the rest.
  // Layout: marker(1) + space(1) + swatch(6) + space(1) + name
  // Fixed swatch column = 8 chars (marker + space + swatch + space).
  // Name column = width - border(2) - paddingX(2) - swatch-cluster(8).
  const nameWidth = Math.max(width - 14, 10)

  // We need scrollTo to point at the row in the render list that corresponds
  // to the selected entry. Find that row index.
  const scrollToIndex = renderList.findIndex(
    (r) => r.kind === "entry" && r.originalIndex === selectedIndex,
  )

  return (
    <Box flexDirection="column" width={width} flexShrink={0} borderStyle="single">
      <Box paddingX={1} paddingY={0} gap={1}>
        <Text bold color="$primary">
          {title}
        </Text>
        <Muted>({entries.length})</Muted>
      </Box>
      <Divider />
      <Box
        flexDirection="column"
        paddingX={1}
        paddingY={1}
        overflow="scroll"
        scrollTo={scrollToIndex >= 0 ? scrollToIndex : selectedIndex}
        flexGrow={1}
      >
        {renderList.map((item) => {
          if (item.kind === "header") {
            return (
              <Box key={`header-${item.label}`} marginTop={item.leadingGap ? 1 : 0}>
                <SectionDivider label={item.label} />
              </Box>
            )
          }

          const { entry, originalIndex } = item
          const isPrimary = originalIndex === selectedIndex
          const isSecondary = secondaryIndex !== undefined && originalIndex === secondaryIndex
          const marker = isPrimary ? "▸" : isSecondary ? "·" : " "
          // Truncate long names with ellipsis so they fit the column — avoids
          // the right-side cropping the user saw on "tomorrow-night-eighties"
          // and similar long scheme names.
          const truncated =
            entry.name.length > nameWidth ? entry.name.slice(0, nameWidth - 1) + "…" : entry.name
          const label = truncated.padEnd(nameWidth)

          return (
            <Box key={entry.name} flexDirection="row">
              <Text
                inverse={isPrimary}
                color={isSecondary && !isPrimary ? "$accent" : undefined}
                wrap="truncate"
              >
                {marker}{" "}
              </Text>
              <MiniSwatch entry={entry} />
              <Text
                inverse={isPrimary}
                color={isSecondary && !isPrimary ? "$accent" : undefined}
                wrap="truncate"
              >
                {" "}
                {label}
              </Text>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
