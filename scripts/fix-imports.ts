#!/usr/bin/env bun
/**
 * Rewrites all relative imports that cross package boundaries to use @silvery/* paths.
 *
 * How it works:
 * 1. Builds a map of every file's "old src/ path" → "new package location"
 * 2. For each file, resolves relative imports against the old structure
 * 3. If target is in a different package, rewrites to @silvery/<pkg>
 * 4. If target is in the same package, adjusts the relative path
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs"
import { join, relative, dirname, resolve, basename, extname } from "node:path"

const ROOT = resolve(import.meta.dir, "..")
const PACKAGES_DIR = join(ROOT, "packages")

// Map each file's path relative to its package src/ to the package name
// Key: old src/-relative path (e.g., "runtime/run.tsx")
// Value: { pkg: "term", newPath: "packages/term/src/runtime/run.tsx" }
interface FileEntry {
  pkg: string
  srcRelative: string // path relative to packages/<pkg>/src/
  fullPath: string
}

// Build the complete file map
function buildFileMap(): Map<string, FileEntry> {
  const map = new Map<string, FileEntry>()
  const pkgs = readdirSync(PACKAGES_DIR)

  for (const pkg of pkgs) {
    const srcDir = join(PACKAGES_DIR, pkg, "src")
    if (!existsSync(srcDir)) continue

    walkDir(srcDir, (fullPath) => {
      const ext = extname(fullPath)
      if (ext !== ".ts" && ext !== ".tsx") return

      const srcRelative = relative(srcDir, fullPath)

      // Map from the old src/ relative path to the new location
      // Special cases for files that came from different old locations
      let oldSrcPath: string

      if (pkg === "ansi") {
        // ansi was at packages/ansi/ in old repo, not in src/
        // It was imported as @silvery/ansi, not via relative paths
        oldSrcPath = `__ansi__/${srcRelative}`
      } else if (pkg === "compat") {
        // ink.ts was at src/ink.ts
        if (srcRelative === "ink.ts") oldSrcPath = "ink.ts"
        else oldSrcPath = `__compat__/${srcRelative}`
      } else {
        oldSrcPath = srcRelative
      }

      map.set(oldSrcPath, { pkg, srcRelative, fullPath })
    })
  }

  return map
}

function walkDir(dir: string, callback: (path: string) => void) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      walkDir(fullPath, callback)
    } else {
      callback(fullPath)
    }
  }
}

// For a given file, determine its old src/-relative path
function getOldSrcPath(entry: FileEntry): string {
  if (entry.pkg === "ansi") return `__ansi__/${entry.srcRelative}`
  if (entry.pkg === "compat" && entry.srcRelative === "ink.ts") return "ink.ts"
  return entry.srcRelative
}

// Resolve a relative import from a file to its target old src path
function resolveOldImport(fromOldPath: string, importPath: string): string | null {
  // Strip .js extension from import path (ESM convention: import from "./foo.js" → ./foo.ts)
  const cleanImport = importPath.replace(/\.js$/, "")

  const fromDir = dirname(fromOldPath)
  let resolved = resolve("/fake-src", fromDir, cleanImport)
  resolved = resolved.replace("/fake-src/", "")

  // Remove leading slash
  if (resolved.startsWith("/")) resolved = resolved.slice(1)

  return resolved
}

// Try to find a file in the map, trying various extensions
function findInMap(map: Map<string, FileEntry>, oldPath: string): FileEntry | null {
  // Exact match
  if (map.has(oldPath)) return map.get(oldPath)!

  // Try with extensions
  for (const ext of [".ts", ".tsx", ".js", ".jsx"]) {
    if (map.has(oldPath + ext)) return map.get(oldPath + ext)!
  }

  // Try as directory with index
  for (const ext of [".ts", ".tsx", ".js", ".jsx"]) {
    const indexPath = `${oldPath}/index${ext}`
    if (map.has(indexPath)) return map.get(indexPath)!
  }

  return null
}

// Get the @silvery/<pkg> import path for a target file
function getPackageImport(targetEntry: FileEntry, specificPath?: string): string {
  const pkg = targetEntry.pkg
  const importBase = `@silvery/${pkg}`

  // If importing the package root (index.ts), just use @silvery/<pkg>
  if (targetEntry.srcRelative === "index.ts" || targetEntry.srcRelative === "index.tsx") {
    return importBase
  }

  // Otherwise, might need a subpath — for now use the srcRelative path
  // Remove extension
  let subpath = targetEntry.srcRelative.replace(/\.(tsx?|jsx?)$/, "")
  // Remove /index suffix
  subpath = subpath.replace(/\/index$/, "")

  return `${importBase}/${subpath}`
}

// Compute new relative import path between two files in the same package
function getNewRelativePath(fromEntry: FileEntry, targetEntry: FileEntry): string {
  const fromDir = dirname(join("src", fromEntry.srcRelative))
  const targetPath = join("src", targetEntry.srcRelative)
  let rel = relative(fromDir, targetPath)

  // Remove extension
  rel = rel.replace(/\.(tsx?|jsx?)$/, "")
  // Remove /index suffix
  rel = rel.replace(/\/index$/, "")

  // Ensure starts with ./
  if (!rel.startsWith(".")) rel = `./${rel}`

  return rel
}

// Main import rewriting logic
const IMPORT_REGEX = /(?:from\s+['"])(\.{1,2}\/[^'"]+)(?:['"])/g
const IMPORT_REGEX2 = /(?:import\s+['"])(\.{1,2}\/[^'"]+)(?:['"])/g
const SILVERY_IMPORT = /(['"])@silvery\/(term|ansi)(?:\/([^'"]*?))?(['"])/g
const LOGGILY_IMPORT = /(['"])loggily(?:\/([^'"]*?))?(['"])/g
const SWATCH_IMPORT = /(['"])swatch(?:\/([^'"]*?))?(['"])/g

function rewriteFile(entry: FileEntry, map: Map<string, FileEntry>): { changed: boolean; content: string } {
  let content = readFileSync(entry.fullPath, "utf-8")
  let changed = false
  const oldSrcPath = getOldSrcPath(entry)

  // Rewrite @silvery/term imports → @silvery/*
  content = content.replace(SILVERY_IMPORT, (match, q1, pkg, subpath, q2) => {
    changed = true
    if (pkg === "ansi") {
      return subpath ? `${q1}@silvery/ansi/${subpath}${q2}` : `${q1}@silvery/ansi${q2}`
    }
    // @silvery/term subpath imports map to different packages
    if (subpath) {
      const subpathMap: Record<string, string> = {
        runtime: "@silvery/term/runtime",
        testing: "@silvery/test",
        store: "@silvery/tea/store",
        core: "@silvery/tea/core",
        tea: "@silvery/tea/tea",
        canvas: "@silvery/ui/canvas",
        dom: "@silvery/term/dom",
        xterm: "@silvery/term/xterm",
        ink: "@silvery/ink/ink",
        layout: "@silvery/react/layout",
        components: "@silvery/ui/components",
        focus: "@silvery/react/focus",
        input: "@silvery/react/input",
        theme: "@silvery/theme",
        animation: "@silvery/ui/animation",
        images: "@silvery/ui/images",
        plugins: "@silvery/tea/plugins",
        "scroll-utils": "@silvery/term/scroll-utils",
        toolbelt: "@silvery/term/toolbelt",
        hooks: "@silvery/react/hooks",
        react: "@silvery/react/react",
      }
      return `${q1}${subpathMap[subpath] || `@silvery/react/${subpath}`}${q2}`
    }
    return `${q1}@silvery/react${q2}`
  })

  // Rewrite loggily → loggily
  content = content.replace(LOGGILY_IMPORT, (match, q1, subpath, q2) => {
    changed = true
    return subpath ? `${q1}loggily/${subpath}${q2}` : `${q1}loggily${q2}`
  })

  // Rewrite swatch → @silvery/theme
  content = content.replace(SWATCH_IMPORT, (match, q1, subpath, q2) => {
    changed = true
    return subpath ? `${q1}@silvery/theme/${subpath}${q2}` : `${q1}@silvery/theme${q2}`
  })

  // Rewrite relative imports that cross package boundaries
  // Also handle imports that were already partially rewritten (e.g., @silvery/tea/types → still relative from ./types.js)
  const rewriteRelative = (match: string, importPath: string) => {
    // Skip if already an @silvery/ import
    if (importPath.startsWith("@silvery/")) return match

    // Resolve against old src/ path
    const targetOldPath = resolveOldImport(oldSrcPath, importPath)
    if (!targetOldPath) return match

    const targetEntry = findInMap(map, targetOldPath)
    if (!targetEntry) {
      // Can't find target — leave as is (might be external or missing)
      return match
    }

    if (targetEntry.pkg === entry.pkg) {
      // Same package — compute new relative path
      const newRel = getNewRelativePath(entry, targetEntry)
      if (newRel !== importPath) {
        changed = true
        return match.replace(importPath, newRel)
      }
      return match
    }

    // Different package — use @silvery/<pkg> import
    changed = true
    const pkgImport = getPackageImport(targetEntry)
    return match.replace(importPath, pkgImport)
  }

  content = content.replace(IMPORT_REGEX, rewriteRelative)
  content = content.replace(IMPORT_REGEX2, rewriteRelative)

  return { changed, content }
}

// Run
const map = buildFileMap()
console.log(`Found ${map.size} files across packages`)

let changedCount = 0
let errorCount = 0

for (const [, entry] of map) {
  try {
    const { changed, content } = rewriteFile(entry, map)
    if (changed) {
      writeFileSync(entry.fullPath, content)
      changedCount++
      console.log(`  ✓ ${entry.pkg}/${entry.srcRelative}`)
    }
  } catch (err) {
    errorCount++
    console.error(`  ✗ ${entry.pkg}/${entry.srcRelative}: ${err}`)
  }
}

console.log(`\nDone: ${changedCount} files rewritten, ${errorCount} errors`)
