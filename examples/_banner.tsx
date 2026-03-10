import React from "react";
import { Box, Text, ThemeProvider, getThemeByName, type Theme } from "../src/index.js";

export interface ExampleMeta {
  name: string;
  description: string;
  /** API features showcased, e.g. ["VirtualList", "useContentRect()"] */
  features?: string[];
}

interface Props {
  meta: ExampleMeta;
  /** Short controls legend, e.g. "j/k navigate  q quit" */
  controls?: string;
  /** Override theme (from viewer). Falls back to SILVERY_THEME env var. */
  theme?: Theme;
  children: React.ReactNode;
}

/**
 * Compact header shown when examples run standalone.
 * Wraps children in ThemeProvider for consistent theming.
 */
export function ExampleBanner({ meta, controls, theme, children }: Props) {
  const resolvedTheme = theme ?? getThemeByName(process.env.SILVERY_THEME);

  return (
    <ThemeProvider theme={resolvedTheme}>
      <Box flexDirection="column" flexGrow={1}>
        {/* One-line header: dimmed to not compete with example UI */}
        <Box paddingX={1} gap={1}>
          <Text dim color="$warning">
            {"▸ silvery"}
          </Text>
          <Text bold color="$text">
            {meta.name}
          </Text>
          <Text color="$muted">— {meta.description}</Text>
        </Box>
        {meta.features && meta.features.length > 0 && (
          <Box paddingX={1}>
            <Text color="$muted">
              {"  "}
              {meta.features.join(" · ")}
            </Text>
          </Box>
        )}
        {controls && (
          <Box paddingX={1}>
            <Text color="$muted">
              {"  "}
              {controls}
            </Text>
          </Box>
        )}
        {children}
      </Box>
    </ThemeProvider>
  );
}
