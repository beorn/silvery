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
 * NOTE: Many showcases are disabled until they render well in web xterm.
 * Run `bun examples/apps/<name>.tsx` in a real terminal for the full experience.
 */

import type { JSX } from "react"
import React from "react"

// Import only the showcases that work well in web xterm
import { Dashboard } from "../../layout/dashboard.js"
import { KanbanBoard } from "../../apps/kanban.js"
import { DevTools } from "../../apps/dev-tools.js"
import { ComponentsApp } from "../../apps/components.js"
import { NoteEditor } from "../../apps/textarea.js"

/** Registry mapping URL keys to showcase components. */
export const SHOWCASES: Record<string, () => JSX.Element> = {
  dashboard: Dashboard,
  kanban: KanbanBoard,
  components: ComponentsApp,
  "dev-tools": DevTools,
  textarea: NoteEditor,
}
