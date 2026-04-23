/**
 * Sterling Storybook — entry point.
 *
 * Launch:
 *   bun examples/apps/storybook/index.tsx
 *   # or via the workspace script:
 *   bun run example:storybook
 *
 * See App.tsx for the MVP scope + sterling-storybook-mvp bead.
 */

import React from "react"
import { createTerm } from "silvery"
import { run } from "silvery/runtime"
import type { ExampleMeta } from "../../_banner.tsx"
import { App } from "./App.tsx"

export const meta: ExampleMeta = {
  name: "Sterling Storybook",
  description: "Interactive 3-pane design-system explorer — 84 schemes, live swap, token tree",
  demo: true,
  features: [
    "sterling.deriveFromScheme",
    "derivationTrace",
    "ThemeProvider",
    "builtinPalettes",
    "SelectList",
  ],
}

export async function main(): Promise<void> {
  using term = createTerm()
  // Use `run()` (not `render()`) so SGR mouse tracking is enabled — trackpad
  // and wheel events dispatch to the pane under the pointer instead of
  // falling back to arrow keys that always route to the focused pane.
  // `render()` has no mouse plumbing at all; `run()` defaults mouse:true.
  const handle = await run(<App />, term)
  await handle.waitUntilExit()
}

// Auto-run when invoked directly (bun examples/apps/storybook/index.tsx)
if (import.meta.main) {
  await main()
}
