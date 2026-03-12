/**
 * Showcase registry — bridges terminal examples for web rendering.
 *
 * Each entry maps a URL-friendly key to a terminal example component.
 * These are the SAME components used by `bun examples/<name>` — no
 * separate web implementations.
 *
 * showcase-app.tsx renders them via renderToXterm() with input: true,
 * giving full useInput/useMouse/useTerminalFocused support.
 *
 * The 9 flagship showcases have clean URL keys (silvery.dev/examples/<key>):
 *   aichat, gallery, kanban, explorer, wizard, dashboard, terminal, components, theme
 */

import React from "react"
import { Box, Text } from "../../../src/index.js"

// Import components from terminal examples (the single source of truth)
import { Dashboard } from "../../layout/dashboard.js"
import { KanbanBoard } from "../../interactive/kanban.js"
import { CliWizard } from "../../interactive/cli-wizard.js"
import { DevTools } from "../../interactive/dev-tools.js"
import { DataExplorer } from "../../interactive/data-explorer.js"
import { ScrollExample } from "../../interactive/scroll.js"
import { AIChat, SCRIPT } from "../../interactive/aichat/index.js"
import { SearchApp } from "../../interactive/search-filter.js"
import { TransformDemo } from "../../interactive/transform.js"
import { NoteEditor } from "../../interactive/textarea.js"

// Web-only showcases that don't have terminal equivalents yet
// These will be replaced as consolidated examples are built
import { LayoutFeedbackShowcase } from "./layout-feedback.js"
import { FocusShowcase } from "./focus.js"
import { TextInputShowcase } from "./text-input.js"
import { ThemeExplorerShowcase } from "./theme-explorer.js"

// Placeholder for examples not yet implemented — renders a coming-soon message
function Placeholder({ name }: { name: string }) {
  return (
    <Box flexDirection="column" padding={1} justifyContent="center" alignItems="center" flexGrow={1}>
      <Text bold color="$muted">
        {name}
      </Text>
      <Text color="$muted" dim>
        Coming soon
      </Text>
    </Box>
  )
}

/** Registry mapping URL keys to showcase components. */
export const SHOWCASES: Record<string, () => JSX.Element> = {
  // ─── 9 Flagship Showcases (clean URL keys) ────────────────────────
  aichat: () => <AIChat script={SCRIPT} autoStart={false} fastMode={false} />,
  gallery: () => <Placeholder name="Gallery" />, // NEW — interactive/gallery.tsx
  kanban: KanbanBoard,
  explorer: () => <Placeholder name="Explorer" />, // NEW — interactive/explorer.tsx
  wizard: CliWizard,
  dashboard: Dashboard,
  terminal: () => <Placeholder name="Terminal" />, // NEW — interactive/terminal.tsx
  components: () => <Placeholder name="Components" />, // NEW — interactive/components.tsx
  theme: () => <Placeholder name="Theme Explorer" />, // NEW — interactive/theme.tsx

  // ─── Additional terminal examples ─────────────────────────────────
  "ai-chat": () => <AIChat script={SCRIPT} autoStart={false} fastMode={false} />,
  "cli-wizard": CliWizard,
  "dev-tools": DevTools,
  "data-explorer": DataExplorer,
  scroll: ScrollExample,
  "search-filter": SearchApp,
  transform: TransformDemo,
  textarea: NoteEditor,

  // ─── Web-only (to be consolidated into terminal examples) ─────────
  "layout-feedback": LayoutFeedbackShowcase,
  focus: FocusShowcase,
  "text-input": TextInputShowcase,
  "theme-explorer": ThemeExplorerShowcase,
}
