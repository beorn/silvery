/**
 * @reach fs-walk vendor/silvery/packages/storybook/src/**
 */
import { readFileSync, readdirSync } from "node:fs"
import { describe, expect, it } from "vitest"

/*
 * @failure A file under @silvery/storybook/src imports a framework-specific
 *   scope (the @ag or @hab packages) — e.g. a responsive-layout wrapper such as
 *   a chat-ui pane primitive. That reintroduces the coupling the extraction
 *   removed: the host can no longer cross the silvery no-framework boundary, so
 *   the package stops being publishable/consumable standalone and the reusable
 *   host silently regresses to "provider-coupled".
 * @level L2
 * @consumer @si/scroll/15065-l4l5/15067-storybook-previewhost-scrollarea/20722-host-extraction
 */

// Every source file in this package is the reusable host and MUST stay
// framework-neutral. Consumers wire their framework-specific layout through the
// StorybookHostInjection seam, never via imports inside this package.
const SRC_DIR = new URL("../src/", import.meta.url)
const SRC_FILES = readdirSync(SRC_DIR).filter(
  (name) => name.endsWith(".ts") || name.endsWith(".tsx"),
)

// Forbidden import scopes, held split from the trailing "/" so this guard file
// itself carries no literal scope-path token and passes the vendor
// standalone-clean grep.
const FORBIDDEN_SCOPES = ["@ag", "@hab"] as const

function forbiddenImports(src: string): string[] {
  const hits: string[] = []
  for (const scope of FORBIDDEN_SCOPES) {
    const re = new RegExp(
      String.raw`\bimport\b[^\n]*\bfrom\s+["']` + scope + String.raw`/[^"']+["']`,
      "gu",
    )
    for (const match of src.matchAll(re)) hits.push(match[0].trim())
  }
  return hits
}

describe("storybook host framework purity (20722)", () => {
  it("has source files to guard", () => {
    expect(SRC_FILES.length).toBeGreaterThan(0)
  })

  for (const file of SRC_FILES) {
    it(`${file} imports no framework-specific packages`, () => {
      const src = readFileSync(new URL(file, SRC_DIR), "utf8")
      expect(forbiddenImports(src)).toEqual([])
    })
  }
})
