import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, test } from "vitest"

const repoRoot = resolve(import.meta.dirname, "../..")

const userFacingFiles = [
  "docs/reference/hooks.md",
  "docs/reference/components.md",
  "docs/reference/components-hooks.md",
  "docs/guides/terminal-apps.md",
  "docs/guides/state-management.md",
  "examples/apps/panes/index.tsx",
  "examples/apps/vterm-demo/index.tsx",
]

describe("docs import conventions", () => {
  test.each(userFacingFiles)(
    "%s uses the public silvery barrels for app-facing imports",
    (file) => {
      const text = readFileSync(resolve(repoRoot, file), "utf8")

      expect(text).not.toMatch(/from ["']@silvery\/ag-term(?:\/runtime)?["']/)
      expect(text).not.toMatch(/from ["']@silvery\/ag-react["']/)
    },
  )
})
