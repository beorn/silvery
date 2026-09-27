/**
 * @failure Built legacy and narrow entries hold separate render-adapter singletons.
 * @level published dist entries
 * @consumer Canvas and terminal callers installed from a package
 *
 * Run after: tsdown -W -F '@silvery/ag-term' -F '@silvery/create'
 */
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const packages = join(dirname(fileURLToPath(import.meta.url)), "../../packages")

async function importPublished(packageName, subpath) {
  const packageDir = join(packages, packageName)
  const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"))
  const published = manifest.publishConfig.exports[subpath]
  assert.ok(published, `${packageName}${subpath} has no publish export`)
  const implementation = join(packageDir, published.import)
  const declaration = join(packageDir, published.types)
  assert.ok(existsSync(implementation), `${packageName}${subpath} is missing ${implementation}`)
  assert.ok(existsSync(declaration), `${packageName}${subpath} is missing ${declaration}`)
  return import(pathToFileURL(implementation).href)
}

const narrow = await importPublished("ag-term", "./pipeline/adapter-pipeline")
const legacy = await importPublished("ag-term", "./render-adapter")
const overflow = await importPublished("ag-term", "./pipeline/overflow-indicator")
const runtimeChain = await importPublished("create", "./runtime-chain")

assert.equal(legacy.hasRenderAdapter(), false, "built adapter state initialized eagerly")
const adapter = {
  name: "dist-contract",
  measurer: { measureText: () => ({ width: 0, height: 0 }), getLineHeight: () => 1 },
  createBuffer: () => ({ width: 0, height: 0 }),
  flush: () => undefined,
  getBorderChars: () => ({
    topLeft: "",
    topRight: "",
    bottomLeft: "",
    horizontal: "",
    vertical: "",
  }),
}
narrow.setRenderAdapter(adapter)
assert.equal(
  legacy.getRenderAdapter(),
  adapter,
  "built main and narrow entries split adapter state",
)
await legacy.ensureRenderAdapterInitialized()
assert.equal(legacy.getRenderAdapter(), adapter, "lazy terminal init replaced an installed adapter")
assert.equal(typeof narrow.executeRenderAdapter, "function")
assert.equal(typeof overflow.overflowIndicatorPlacement, "function")
assert.equal(typeof runtimeChain.createBaseApp, "function")
