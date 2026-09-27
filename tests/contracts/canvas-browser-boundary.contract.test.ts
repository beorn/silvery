/**
 * @failure Canvas browser bundles retain Node or terminal-only modules.
 * @level l1
 * @consumer Browser Canvas renderer
 * @testonly none
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
  test("the canvas entry loads browser modules and emits no Node or terminal imports", async () => {
    const loadedModules = new Set<string>()
    const bundle = await rolldown({
      input: canvasEntry,
      external: isThirdPartyPackage,
      onLog(level, log, handler) {
        if (log.code === "INEFFECTIVE_DYNAMIC_IMPORT") return
        handler(level, log)
      },
      plugins: [
        {
          name: "capture-canvas-module-graph",
          transform(_code, id) {
            loadedModules.add(id)
          },
        },
      ],
    })

    try {
      const result = await bundle.generate({ format: "esm" })
      const chunks = result.output.filter((item) => item.type === "chunk")
      const externalImports = chunks
        .flatMap((chunk) => [...chunk.imports, ...chunk.dynamicImports])
        .filter((id) => id.startsWith("node:") || id.startsWith("@termless/"))
        .sort()
      const generatedCode = chunks.map((chunk) => chunk.code).join("\n")
      // Lazy, guarded Node diagnostics may leave string literals in live code.
      // Vite resolves modules before final tree shaking, so the loaded source
      // graph must also avoid the terminal barrels that reach native backends.
      const directNodeLoads = generatedCode.match(
        /\b(?:import|require)\s*\(\s*["'](?:node:|@termless\/)[^"']+["']\s*\)/g,
      )
      const forbiddenModuleSuffixes = [
        "/packages/ag-term/src/pipeline/index.ts",
        "/packages/create/src/plugins.ts",
        "/packages/ag-term/src/ansi/index.ts",
        "/packages/ag-term/src/render-adapter.ts",
        "/packages/ag-react/src/render-string.tsx",
      ]
      const requiredModuleSuffixes = [
        "/packages/ag-term/src/pipeline/adapter-pipeline.ts",
        "/packages/ag-term/src/pipeline/overflow-indicator.ts",
        "/packages/ag-term/src/render-adapter-state.ts",
        "/packages/create/src/runtime-chain.ts",
        "/packages/ag-term/src/adapters/canvas-adapter.ts",
      ]
      const loadedForbiddenModules = [...loadedModules]
        .filter((id) => forbiddenModuleSuffixes.some((suffix) => id.endsWith(suffix)))
        .sort()
      const missingRequiredModules = requiredModuleSuffixes.filter(
        (suffix) => ![...loadedModules].some((id) => id.endsWith(suffix)),
      )

      expect(externalImports).toEqual([])
      expect(directNodeLoads).toBeNull()
      expect(loadedForbiddenModules).toEqual([])
      expect(missingRequiredModules).toEqual([])
    } finally {
      await bundle.close()
    }
  })
})
