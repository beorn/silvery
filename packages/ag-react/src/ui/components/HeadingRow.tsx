import React, { useCallback, useContext } from "react"
import type { SilveryMouseEvent } from "@silvery/ag-term/mouse-events"
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

  return (
    <HangingMarkerRow
      markerWidth={markerWidth}
      onMouseEnter={foldable ? interaction.onMouseEnter : undefined}
      onMouseLeave={foldable ? interaction.onMouseLeave : undefined}
      marker={
        marker ?? (
          <StylePriorityProvider foreground={`mix(${foreground}, $bg, 75%)`}>
            <Text>#</Text>
          </StylePriorityProvider>
        )
      }
    >
      <Box flexDirection="row" alignItems="center" flexWrap="nowrap" minWidth={0}>
        <Box flexShrink={1} minWidth={0}>
          {children}
        </Box>
        {foldable && interaction.isHovered ? (
          <Box
            marginLeft={1}
            flexShrink={0}
            mouseCursor="pointer"
            onClick={handleToggle}
            data-testid="fold-triangle"
          >
            <Text color={color ?? "$fg-muted"}>
              {isExpanded ? DISCLOSURE_MARKERS.expanded : DISCLOSURE_MARKERS.collapsed}
            </Text>
          </Box>
        ) : null}
      </Box>
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
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <Box width={gutter} minWidth={gutter} marginLeft={-gutter} flexShrink={0}>
        {marker}
      </Box>
      <Prose flexGrow={1} minWidth={0}>
        {children}
      </Prose>
    </Box>
  )
}
