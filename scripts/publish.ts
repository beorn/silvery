#!/usr/bin/env bun
/**
 * Publish script for silvery — bumps versions, resolves workspace deps, publishes to npm.
 *
 * Usage:
 *   bun run scripts/publish.ts <version>       # e.g., 0.4.0
 *   bun run scripts/publish.ts <version> --dry-run
 *
 * Publish order (dependency order):
 *   1. @silvery/ag       (no silvery deps)
 *   2. @silvery/theme    (no silvery deps)
 *   3. @silvery/ag-react (depends on ag, theme)
 *   4. @silvery/ag-term  (depends on ag, ag-react, theme)
 *   5. @silvery/ink      (depends on ag-react, ag-term)
 *   6. @silvery/tea      (depends on ag, ag-react, ag-term, ink)
 *   7. @silvery/test     (depends on ag, ag-react, ag-term, tea)
 *   8. silvery           (depends on all above via bundled imports)
 */

import { readFileSync, writeFileSync } from "node:fs"
import { resolve, join } from "node:path"
import { execSync } from "node:child_process"

const ROOT = resolve(import.meta.dir, "..")
const version = process.argv[2]
const dryRun = process.argv.includes("--dry-run")

if (!version) {
  console.error("Usage: bun run scripts/publish.ts <version> [--dry-run]")
  process.exit(1)
}

// All packages in publish order (dependency order)
const packages = [
  { dir: "packages/ag", name: "@silvery/ag" },
  { dir: "packages/theme", name: "@silvery/theme" },
  { dir: "packages/ag-react", name: "@silvery/ag-react" },
  { dir: "packages/ag-term", name: "@silvery/ag-term" },
  { dir: "packages/ink", name: "@silvery/ink" },
  { dir: "packages/tea", name: "@silvery/tea" },
  { dir: "packages/test", name: "@silvery/test" },
  { dir: ".", name: "silvery" },
]

// Step 1: Read all package.json files and store originals
const originals = new Map<string, string>()
for (const pkg of packages) {
  const path = join(ROOT, pkg.dir, "package.json")
  originals.set(path, readFileSync(path, "utf-8"))
}

// Step 2: Update all package.json files
for (const pkg of packages) {
  const path = join(ROOT, pkg.dir, "package.json")
  const json = JSON.parse(readFileSync(path, "utf-8"))

  // Bump version
  json.version = version

  // Remove private flag (all packages need to be publishable)
  delete json.private

  // Ensure publishConfig
  json.publishConfig = { access: "public" }

  // Replace workspace:* with actual version
  for (const depType of ["dependencies", "devDependencies", "peerDependencies"]) {
    if (!json[depType]) continue
    for (const [dep, ver] of Object.entries(json[depType])) {
      if (ver === "workspace:*" && dep.startsWith("@silvery/")) {
        json[depType][dep] = version
      }
    }
  }

  writeFileSync(path, JSON.stringify(json, null, 2) + "\n")
  console.log(`  Updated ${pkg.name} → ${version}`)
}

// Step 3: Publish each package
console.log(`\n${dryRun ? "DRY RUN — " : ""}Publishing ${packages.length} packages...\n`)

for (const pkg of packages) {
  const dir = join(ROOT, pkg.dir)
  const cmd = dryRun ? `npm publish --dry-run` : `npm publish --access public`

  console.log(`Publishing ${pkg.name}@${version}...`)
  try {
    const output = execSync(cmd, { cwd: dir, encoding: "utf-8", stdio: "pipe" })
    console.log(`  ✓ ${pkg.name}@${version}`)
  } catch (e: any) {
    console.error(`  ✗ ${pkg.name}: ${e.stderr?.trim() || e.message}`)
    if (!dryRun) {
      console.error("\nPublish failed. Restoring original package.json files...")
      for (const [path, content] of originals) {
        writeFileSync(path, content)
      }
      process.exit(1)
    }
  }
}

// Step 4: Restore workspace:* (for development)
console.log("\nRestoring workspace:* dependencies...")
for (const [path, content] of originals) {
  const json = JSON.parse(readFileSync(path, "utf-8"))
  const orig = JSON.parse(content)

  // Keep the new version but restore workspace:* deps and private flag
  json.version = version // keep bumped version
  for (const depType of ["dependencies", "devDependencies", "peerDependencies"]) {
    if (!orig[depType]) continue
    for (const [dep, ver] of Object.entries(orig[depType] as Record<string, string>)) {
      if (ver === "workspace:*" && json[depType]?.[dep]) {
        json[depType][dep] = "workspace:*"
      }
    }
  }
  // Restore private flag on internal packages
  if (orig.private) {
    json.private = true
    delete json.publishConfig
  }

  writeFileSync(path, JSON.stringify(json, null, 2) + "\n")
}

console.log(`\nDone! Published ${packages.length} packages at v${version}`)
console.log("Remember to: git add -A && git commit && git tag && git push --tags")
