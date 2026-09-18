import React, { useContext } from "react"
import { Box } from "../../components/Box"
import { Text } from "../../components/Text"
import { useTheme } from "../../ThemeContext"
import { StylePriorityContext, StylePriorityProvider } from "../../style-priority"
import { Prose } from "./Prose"

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
}: {
  level: number
  markerWidth?: number
  marker?: React.ReactNode
  color?: string
  children: React.ReactNode
}): React.ReactElement {
  const theme = useTheme()
  const priority = useContext(StylePriorityContext)
  const foreground = priority?.foreground ?? color ?? theme.variants?.[`h${level}`]?.color ?? "$fg"
  return (
    <HangingMarkerRow
      markerWidth={markerWidth}
      marker={
        marker ?? (
          <StylePriorityProvider foreground={`mix(${foreground}, $bg, 75%)`}>
            <Text>#</Text>
          </StylePriorityProvider>
        )
      }
    >
      {children}
    </HangingMarkerRow>
  )
}

/** Private gutter geometry shared by headings and collapsed source blocks. */
export function HangingMarkerRow({
  marker,
  markerWidth = 1,
  children,
}: {
  marker: React.ReactNode
  markerWidth?: number
  children: React.ReactNode
}): React.ReactElement {
  const gutter = markerWidth + 1
  return (
    <Box flexDirection="row" width="100%" minWidth={0}>
      <Box width={gutter} minWidth={gutter} marginLeft={-gutter} flexShrink={0}>
        {marker}
      </Box>
      <Prose flexGrow={1} minWidth={0}>
        {children}
      </Prose>
    </Box>
  )
}
