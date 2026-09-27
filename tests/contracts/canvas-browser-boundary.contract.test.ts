/**
 * @failure Canvas browser bundles retain Node or terminal-only modules.
 * @level package entry
 * @consumer Browser Canvas renderer
 */
import { isAbsolute } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { rolldown } from "rolldown"

const canvasEntry = fileURLToPath(
  new URL("../../packages/ag-react/src/ui/canvas/index.ts", import.meta.url),
)

function isThirdPartyPackage(id: string): boolean {
  if (id === "silvery" || id.startsWith("@silvery/")) return false
  return !id.startsWith(".") && !isAbsolute(id)
}

describe("canvas browser boundary", () => {
  test("the canvas entry emits no Node or terminal imports", async () => {
    const bundle = await rolldown({
      input: canvasEntry,
      external: isThirdPartyPackage,
      onLog(level, log, handler) {
        if (log.code === "INEFFECTIVE_DYNAMIC_IMPORT") return
        handler(level, log)
      },
    })

    try {
      const result = await bundle.generate({ format: "esm" })
      const chunks = result.output.filter((item) => item.type === "chunk")
      const externalImports = chunks
        .flatMap((chunk) => [...chunk.imports, ...chunk.dynamicImports])
        .filter((id) => id.startsWith("node:") || id.startsWith("@termless/"))
        .sort()
      const generatedCode = chunks.map((chunk) => chunk.code).join("\n")
      // Rolldown can load a barrel while tree shaking every import it leads to.
      // Lazy, guarded Node diagnostics may leave string literals in live code;
      // the browser boundary is whether a Node/Termless module is imported.
      const directNodeLoads = generatedCode.match(
        /\b(?:import|require)\s*\(\s*["'](?:node:|@termless\/)[^"']+["']\s*\)/g,
      )

      expect(externalImports).toEqual([])
      expect(directNodeLoads).toBeNull()
    } finally {
      await bundle.close()
    }
  })
})
