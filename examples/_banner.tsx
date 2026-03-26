import React from "react"
import {
  Box,
  Text,
  Strong,
  Muted,
  ThemeProvider,
  getThemeByName,
  type Theme,
} from "../src/index.js"

export interface ExampleMeta {
  name: string
  description: string
  /** API features showcased, e.g. ["VirtualList", "useContentRect()"] */
  features?: string[]
  /** Curated demo — shown in CLI viewer (`bun examples`) and web showcase */
  demo?: boolean
}

interface Props {
  meta: ExampleMeta
  /** Short controls legend, e.g. "j/k navigate  q quit" */
  controls?: string
  /** Override theme (from viewer). Falls back to SILVERY_THEME env var. */
  theme?: Theme
  children: React.ReactNode
}

/**
 * Compact header shown when examples run standalone.
 * Wraps children in ThemeProvider for consistent theming.
 */
export function ExampleBanner({ meta, controls, theme, children }: Props) {
  const resolvedTheme = theme ?? getThemeByName(process.env.SILVERY_THEME)

  return (
    <ThemeProvider theme={resolvedTheme}>
      <Box flexDirection="column" flexGrow={1}>
        {/* One-line header: dimmed to not compete with example UI */}
        <Box paddingX={1} gap={1}>
          <Text dim color="$warning">
            {"▸ silvery"}
          </Text>
          <Strong>{meta.name}</Strong>
          <Muted>— {meta.description}</Muted>
        </Box>
        {meta.features && meta.features.length > 0 && (
          <Box paddingX={1}>
            <Muted>
              {"  "}
              {meta.features.join(" · ")}
            </Muted>
          </Box>
        )}
        {controls && (
          <Box paddingX={1}>
            <Muted>
              {"  "}
              {controls}
            </Muted>
          </Box>
        )}
        {children}
      </Box>
    </ThemeProvider>
  )
}
