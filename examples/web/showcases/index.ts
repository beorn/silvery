/**
 * Showcase registry and shared event bus exports.
 *
 * Re-exports the input/mouse/focus infrastructure for use by host apps
 * (showcase-app.tsx, viewer-app.tsx), and assembles the SHOWCASES registry
 * mapping demo names to their React components.
 */

export { emitInput, emitMouse, setTermFocused } from "./shared.js"

import { DashboardShowcase } from "./dashboard.js"
import { CodingAgentShowcase } from "./coding-agent.js"
import { KanbanShowcase } from "./kanban.js"
import { CLIWizardShowcase } from "./cli-wizard.js"
import { DataExplorerShowcase } from "./data-explorer.js"
import { DevToolsShowcase } from "./dev-tools.js"
import { ScrollShowcase } from "./scroll.js"
import { LayoutFeedbackShowcase } from "./layout-feedback.js"
import { FocusShowcase } from "./focus.js"
import { TextInputShowcase } from "./text-input.js"
import { ThemeExplorerShowcase } from "./theme-explorer.js"

/** Registry mapping demo names to showcase components. */
export const SHOWCASES: Record<string, () => JSX.Element> = {
  dashboard: DashboardShowcase,
  "coding-agent": CodingAgentShowcase,
  kanban: KanbanShowcase,
  "cli-wizard": CLIWizardShowcase,
  "dev-tools": DevToolsShowcase,
  "data-explorer": DataExplorerShowcase,
  scroll: ScrollShowcase,
  "layout-feedback": LayoutFeedbackShowcase,
  focus: FocusShowcase,
  "text-input": TextInputShowcase,
  "theme-explorer": ThemeExplorerShowcase,
}
