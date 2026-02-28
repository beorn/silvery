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

import { useState, useEffect, type ReactNode, type ReactElement } from "react"
import { Box } from "./Box.js"

// =============================================================================
// Types
// =============================================================================

export interface ScreenProps {
  /** Children to render in the fullscreen area */
  children: ReactNode
  /** Flex direction for layout. Default: "column" */
  flexDirection?: "row" | "column" | "row-reverse" | "column-reverse"
}

// =============================================================================
// Helpers
// =============================================================================

function getTermDims(): { width: number; height: number } {
  return {
    width: process.stdout.columns ?? 80,
    height: process.stdout.rows ?? 24,
  }
}

// =============================================================================
// Component
// =============================================================================

/**
 * Fullscreen root component.
 *
 * Provides a Box that fills the entire terminal. Tracks terminal resize
 * events to stay in sync with the actual terminal dimensions.
 */
export function Screen({ children, flexDirection = "column" }: ScreenProps): ReactElement {
  const [dims, setDims] = useState(getTermDims)

  useEffect(() => {
    const onResize = () => setDims(getTermDims())
    process.stdout.on("resize", onResize)
    return () => {
      process.stdout.off("resize", onResize)
    }
  }, [])

  return (
    <Box width={dims.width} height={dims.height} flexDirection={flexDirection}>
      {children}
    </Box>
  )
}
