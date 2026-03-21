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

import type { JSX } from "react"
import React from "react"

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
import { Gallery } from "../../interactive/gallery.js"
import { Explorer } from "../../interactive/explorer.js"
import { TerminalDemo } from "../../interactive/terminal.js"
import { ComponentsApp } from "../../interactive/components.js"
import { ThemeExplorer } from "../../interactive/theme.js"

/** Registry mapping URL keys to showcase components. */
export const SHOWCASES: Record<string, () => JSX.Element> = {
  // --- 9 Flagship Showcases (clean URL keys) ---
  aichat: () => <AIChat script={SCRIPT} autoStart={false} fastMode={false} />,
  gallery: Gallery,
  kanban: KanbanBoard,
  explorer: Explorer,
  wizard: CliWizard,
  dashboard: Dashboard,
  terminal: () => <TerminalDemo kittySupported={false} />,
  components: ComponentsApp,
  theme: () => <ThemeExplorer entries={[]} />,

  // --- Additional terminal examples ---
  "ai-chat": () => <AIChat script={SCRIPT} autoStart={false} fastMode={false} />,
  "cli-wizard": CliWizard,
  "dev-tools": DevTools,
  "data-explorer": DataExplorer,
  scroll: ScrollExample,
  "search-filter": SearchApp,
  transform: TransformDemo,
  textarea: NoteEditor,
}
