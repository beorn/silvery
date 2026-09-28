import React, { useCallback, useContext } from "react"
import type { SilveryMouseEvent } from "@silvery/ag-term/mouse-events"
import { displayLength } from "@silvery/ansi"
import { Box } from "../../components/Box"
import { Text } from "../../components/Text"
import { useTheme } from "../../ThemeContext"
import { StylePriorityContext, StylePriorityProvider } from "../../style-priority"
import { useInteractionTreatment } from "../../hooks/useInteractionTreatment"
import { DISCLOSURE_MARKERS } from "../icons"
import { useExpansion } from "./use-expansion"
import { Prose } from "./Prose"

export interface HeadingRowProps {
  level: number
  markerWidth?: number
  marker?: React.ReactNode
  color?: string
  children: React.ReactNode
  foldable?: boolean
  expanded?: boolean
  onToggleFold?: () => void
}

/**
 * Private block-heading geometry shared by the document presenters.
 * The marker hangs in the host's left gutter without changing title width
 * or alignment. Hosts reserve at least two cells there; DocumentView does
 * so through its lane's gutter floor. Inline H1–H6 remain ordinary Text.
 */
export function HeadingRow({
  level,
  markerWidth = 1,
  marker,
  color,
  children,
  foldable = false,
  expanded,
  onToggleFold,
}: HeadingRowProps): React.ReactElement {
  const theme = useTheme()
  const priority = useContext(StylePriorityContext)
  const foreground = priority?.foreground ?? color ?? theme.variants?.[`h${level}`]?.color ?? "$fg"
  const interaction = useInteractionTreatment("control", "surfaceHover")

  const onExpandedChange = useCallback(
    (_next: boolean) => {
      onToggleFold?.()
    },
    [onToggleFold],
  )

  const [isExpanded, setExpanded] = useExpansion(expanded, true, onExpandedChange)

  const handleToggle = useCallback(
    (event: SilveryMouseEvent) => {
      event.stopPropagation()
      setExpanded(!isExpanded)
    },
    [isExpanded, setExpanded],
  )

  const showTriangle = foldable && (!isExpanded || interaction.isHovered)

  const baseMarker = marker ?? (
    <StylePriorityProvider foreground={`mix(${foreground}, $bg, 75%)`}>
      <Text>#</Text>
    </StylePriorityProvider>
  )

  const baseMarkerWidth = typeof marker === "string" ? displayLength(marker) : 1
  const minRequiredWidth = foldable ? baseMarkerWidth + 2 : baseMarkerWidth
  const totalMarkerWidth = Math.max(markerWidth ?? minRequiredWidth, minRequiredWidth)
  const foldPrefixWidth = Math.max(0, totalMarkerWidth - baseMarkerWidth)

  const foldPrefix =
    foldPrefixWidth > 0 ? (
      foldable ? (
        <Box flexDirection="row" alignItems="center" flexShrink={0}>
          {showTriangle ? (
            <Box
              mouseCursor="pointer"
              onClick={handleToggle}
              data-testid="fold-triangle"
              flexShrink={0}
            >
              <Text color={color ?? "$fg-muted"}>
                {isExpanded ? DISCLOSURE_MARKERS.expanded : DISCLOSURE_MARKERS.collapsed}
              </Text>
            </Box>
          ) : (
            <Text> </Text>
          )}
          <Text>{" ".repeat(foldPrefixWidth - 1)}</Text>
        </Box>
      ) : (
        <Text>{" ".repeat(foldPrefixWidth)}</Text>
      )
    ) : null

  const effectiveMarker = foldPrefix ? (
    <Box flexDirection="row" alignItems="center" flexShrink={0}>
      {foldPrefix}
      {baseMarker}
    </Box>
  ) : (
    baseMarker
  )

  return (
    <HangingMarkerRow
      markerWidth={totalMarkerWidth}
      onMouseEnter={foldable ? interaction.onMouseEnter : undefined}
      onMouseLeave={foldable ? interaction.onMouseLeave : undefined}
      marker={effectiveMarker}
    >
      {children}
    </HangingMarkerRow>
  )
}

export interface HangingMarkerRowProps {
  marker: React.ReactNode
  markerWidth?: number
  onMouseEnter?: (event: SilveryMouseEvent) => void
  onMouseLeave?: (event: SilveryMouseEvent) => void
  children: React.ReactNode
}

/** Private gutter geometry shared by headings and collapsed source blocks. */
export function HangingMarkerRow({
  marker,
  markerWidth = 1,
  onMouseEnter,
  onMouseLeave,
  children,
}: HangingMarkerRowProps): React.ReactElement {
  const gutter = markerWidth + 1
  return (
    <Box
      flexDirection="row"
      width="100%"
      minWidth={0}
      marginLeft={-gutter}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <Box
        width={gutter}
        minWidth={gutter}
        flexShrink={0}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {marker}
      </Box>
      <Prose flexGrow={1} minWidth={0}>
        {children}
      </Prose>
    </Box>
  )
}
