/**
 * Screen - Fullscreen root component.
 *
 * Claims the full terminal dimensions for flexbox layout. This is the
 * declarative equivalent of the implicit fullscreen mode from run()/createApp().
 *
 * @example
 * ```tsx
 * <Screen>
 *   <Sidebar />
 *   <MainContent />
 *   <StatusBar />
 * </Screen>
 * ```
 *
 * @example
 * ```tsx
 * // Fullscreen + scrollable region (log viewer, dashboard)
 * <Screen>
 *   <Sidebar />
 *   <VirtualView items={logs} renderItem={...} />
 *   <StatusBar />
 * </Screen>
 * ```
 */

import { type ReactNode, type ReactElement } from "react"
import { Box } from "../../components/Box"
import { useWindowSize } from "../../hooks/useWindowSize"

// =============================================================================
// Types
// =============================================================================

export interface ScreenProps {
  /** Children to render in the fullscreen area */
  children: ReactNode
  /** Flex direction for layout. Default: "column" (screens are typically vertical) */
  flexDirection?: "row" | "column" | "row-reverse" | "column-reverse"
}

/**
 * Fullscreen root component.
 *
 * Provides a Box that fills the entire terminal. Tracks terminal resize
 * events through the Term size owner so resize bursts share the same
 * coalesced geometry as the runtime pipeline.
 */
export function Screen({ children, flexDirection = "column" }: ScreenProps): ReactElement {
  const { columns, rows } = useWindowSize()

  return (
    <Box width={columns} height={rows} flexDirection={flexDirection}>
      {children}
    </Box>
  )
}
