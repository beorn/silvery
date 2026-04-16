/**
 * Static example registry — bundled into the CLI.
 *
 * No filesystem discovery. No dynamic imports. Just one big object
 * with every example's main() function. Single tsdown entry, one
 * dist/cli.mjs containing everything.
 *
 * To add a new example: add the import + entry below.
 */

// Components
import { main as counter } from "../components/counter.tsx"
import { main as hello } from "../components/hello.tsx"
import { main as progressBar } from "../components/progress-bar.tsx"
import { main as selectList } from "../components/select-list.tsx"
import { main as spinner } from "../components/spinner.tsx"
import { main as textInput } from "../components/text-input.tsx"
import { main as virtualList } from "../components/virtual-list.tsx"

// Apps
import { main as appTodo } from "../apps/app-todo.tsx"
import { main as asyncData } from "../apps/async-data.tsx"
import { main as cliWizard } from "../apps/cli-wizard.tsx"
import { main as clipboard } from "../apps/clipboard.tsx"
import { main as components } from "../apps/components.tsx"
import { main as dataExplorer } from "../apps/data-explorer.tsx"
import { main as design } from "../apps/design.tsx"
import { main as devTools } from "../apps/dev-tools.tsx"
import { main as explorer } from "../apps/explorer.tsx"
import { main as gallery } from "../apps/gallery.tsx"
import { main as inlineBench } from "../apps/inline-bench.tsx"
import { main as kanban } from "../apps/kanban.tsx"
import { main as layoutRef } from "../apps/layout-ref.tsx"
import { main as outline } from "../apps/outline.tsx"
import { main as pasteDemo } from "../apps/paste-demo.tsx"
import { main as scroll } from "../apps/scroll.tsx"
import { main as searchFilter } from "../apps/search-filter.tsx"
import { main as selection } from "../apps/selection.tsx"
import { main as spatialFocusDemo } from "../apps/spatial-focus-demo.tsx"
import { main as taskList } from "../apps/task-list.tsx"
import { main as terminalCapsDemo } from "../apps/terminal-caps-demo.tsx"
import { main as terminal } from "../apps/terminal.tsx"
import { main as textSelectionDemo } from "../apps/text-selection-demo.tsx"
import { main as textarea } from "../apps/textarea.tsx"
import { main as theme } from "../apps/theme.tsx"
import { main as transform } from "../apps/transform.tsx"
import { main as virtual10k } from "../apps/virtual-10k.tsx"
import { main as aichat } from "../apps/aichat/index.tsx"

// Layout
import { main as dashboard } from "../layout/dashboard.tsx"
import { main as liveResize } from "../layout/live-resize.tsx"
import { main as overflow } from "../layout/overflow.tsx"
import { main as textLayout } from "../layout/text-layout.tsx"

export interface RegistryEntry {
  name: string
  main: () => Promise<void> | void
  category: string
  description?: string
}

export const REGISTRY: RegistryEntry[] = [
  // Components
  { name: "counter", main: counter, category: "Components" },
  { name: "hello", main: hello, category: "Components" },
  { name: "progress bar", main: progressBar, category: "Components" },
  { name: "select list", main: selectList, category: "Components" },
  { name: "spinner", main: spinner, category: "Components" },
  { name: "text input", main: textInput, category: "Components" },
  { name: "virtual list", main: virtualList, category: "Components" },

  // Apps
  { name: "aichat", main: aichat, category: "Apps", description: "AI Coding Agent demo" },
  { name: "app todo", main: appTodo, category: "Apps" },
  { name: "async data", main: asyncData, category: "Apps" },
  { name: "cli wizard", main: cliWizard, category: "Apps" },
  { name: "clipboard", main: clipboard, category: "Apps" },
  { name: "components", main: components, category: "Apps" },
  { name: "data explorer", main: dataExplorer, category: "Apps" },
  { name: "design", main: design, category: "Apps", description: "Design system workbench — formula + tokens + components" },
  { name: "dev tools", main: devTools, category: "Apps" },
  { name: "explorer", main: explorer, category: "Apps" },
  { name: "gallery", main: gallery, category: "Apps" },
  { name: "inline bench", main: inlineBench, category: "Apps" },
  { name: "kanban", main: kanban, category: "Apps" },
  { name: "layout ref", main: layoutRef, category: "Apps" },
  { name: "outline", main: outline, category: "Apps" },
  { name: "paste demo", main: pasteDemo, category: "Apps" },
  { name: "scroll", main: scroll, category: "Apps" },
  { name: "search filter", main: searchFilter, category: "Apps" },
  { name: "selection", main: selection, category: "Apps" },
  { name: "spatial focus demo", main: spatialFocusDemo, category: "Apps" },
  { name: "task list", main: taskList, category: "Apps" },
  { name: "terminal caps demo", main: terminalCapsDemo, category: "Apps" },
  { name: "terminal", main: terminal, category: "Apps" },
  { name: "text selection demo", main: textSelectionDemo, category: "Apps" },
  { name: "textarea", main: textarea, category: "Apps" },
  { name: "theme", main: theme, category: "Apps" },
  { name: "transform", main: transform, category: "Apps" },
  { name: "virtual 10k", main: virtual10k, category: "Apps" },

  // Layout
  { name: "dashboard", main: dashboard, category: "Layout" },
  { name: "live resize", main: liveResize, category: "Layout" },
  { name: "overflow", main: overflow, category: "Layout" },
  { name: "text layout", main: textLayout, category: "Layout" },
]
