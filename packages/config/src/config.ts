import { existsSync, type FSWatcher, watch as fsWatch } from "node:fs"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { computed, signal as createSignal } from "alien-signals"
import { cosmiconfig, defaultLoaders, type PublicExplorer } from "cosmiconfig"
import { Document, parseDocument } from "yaml"
import type { ZodSchema } from "zod"
import { buildRegistry } from "./registry.ts"
import type {
  ChangeListener,
  Config,
  ConfigEntry,
  Kind,
  LoadOpts,
  ReadSignal,
  Registry,
  Signal,
} from "./types.ts"

type Scope = "global" | "local"

interface Source {
  path: string
  doc: Document.Parsed | Document
  raw: Record<string, unknown>
}

/**
 * Load a config with multi-source discovery + atomic writes + reactive signals.
 *
 * Discovery order (most specific wins):
 *   1. opts.path                       — single explicit file (treated as global)
 *   2. opts.globalPath                 — explicit global path override
 *   3. KM_CONFIG / SILVERCODE_CONFIG-style env (caller passes via opts)
 *   4. Project: cosmiconfig walk-up    — `.<appName>/config.{yaml,yml}`
 *   5. Global: ${XDG_CONFIG_HOME:-~/.config}/<appName>/config.{yaml,yml}
 *
 * Reads return the merged view (project ∪ global, project takes precedence).
 * Writes default to global; pass `scope: "local"` for project.
 *
 * - Atomic writes: serialize → write to `.tmp.<random>` → rename
 * - Mode 0o600 (configs may carry sensitive paths)
 * - YAML preserves comments and key order across load → mutate → save via
 *   `doc.setIn` / `doc.deleteIn`, with intermediate maps created via
 *   `doc.createNode({})` (real YAMLMap nodes — `setIn(path, {})` would store
 *   plain JS objects that break subsequent recursion)
 */
export async function loadConfig(opts: LoadOpts): Promise<Config> {
  const cwd = opts.cwd ?? process.cwd()
  const createIfMissing = opts.createIfMissing ?? true
  const searchProject = opts.searchProject ?? true
  const searchGlobal = opts.searchGlobal ?? true

  if (!opts.path && !opts.appName) {
    throw new Error("loadConfig: provide either `path` or `appName`")
  }

  // ---------------------------------------------------------------------------
  // Resolve paths

  let globalPath: string | null = null
  let projectPath: string | null = null

  if (opts.path) {
    // Single-file mode (legacy / tests). The given path is treated as global.
    globalPath = resolveHome(opts.path)
  } else if (opts.appName) {
    if (searchGlobal) {
      globalPath = opts.globalPath ? resolveHome(opts.globalPath) : defaultGlobalPath(opts.appName)
    }
    if (searchProject) {
      projectPath = await findProjectPath(opts.appName, cwd)
    }
  }

  // ---------------------------------------------------------------------------
  // Load both sources

  const globalSource = globalPath ? await loadOrInitSource(globalPath, createIfMissing) : null
  const projectSource = projectPath
    ? await loadOrInitSource(projectPath, /* createIfMissing */ false)
    : null

  let merged = computeMerged(globalSource, projectSource, opts.defaults)

  if (opts.schema) {
    validateOrThrow(opts.schema, merged, globalPath ?? projectPath ?? "<unknown>")
  }

  // ---------------------------------------------------------------------------
  // Reactivity

  const _version: Signal<number> = createSignal(0)
  const signalCache = new Map<string, ReadSignal<unknown>>()
  function bumpVersion(): void {
    _version(_version() + 1)
  }

  // ---------------------------------------------------------------------------
  // Watch

  const listeners = new Set<ChangeListener>()
  let snapshot = structuredClone(merged)
  const watchers: FSWatcher[] = []
  let watchTimer: ReturnType<typeof setTimeout> | null = null
  const lastSelfSaveAt: Map<string, number> = new Map()
  const SELF_SAVE_GRACE_MS = 200
  const watchDebounceMs = opts.watchDebounceMs ?? 100

  function scheduleWatchReload(): void {
    if (watchTimer) clearTimeout(watchTimer)
    watchTimer = setTimeout(async () => {
      watchTimer = null
      let changed = false
      for (const source of [globalSource, projectSource]) {
        if (!source) continue
        const lastSelf = lastSelfSaveAt.get(source.path) ?? 0
        if (Date.now() - lastSelf < SELF_SAVE_GRACE_MS) continue
        try {
          const text = await readFile(source.path, "utf8")
          source.doc = parseDocument(text, { keepSourceTokens: true })
          source.raw = (source.doc.toJS() as Record<string, unknown> | null) ?? {}
          changed = true
        } catch {
          // File deleted or unreadable; leave state intact.
        }
      }
      if (changed) {
        const before = snapshot
        merged = computeMerged(globalSource, projectSource, opts.defaults)
        diffNotify(before, merged, "", listeners)
        snapshot = structuredClone(merged)
        bumpVersion()
      }
    }, watchDebounceMs)
  }

  function attachWatcher(path: string): void {
    if (!opts.watch) return
    if (!existsSync(path)) return
    try {
      watchers.push(fsWatch(path, { persistent: false }, () => scheduleWatchReload()))
    } catch {
      // fs.watch may fail on some filesystems (NFS, Docker mounts). Continue.
    }
  }

  if (globalSource) attachWatcher(globalSource.path)
  if (projectSource) attachWatcher(projectSource.path)

  // ---------------------------------------------------------------------------
  // API

  // Wrapper for the lazily-created project source. Reads + writes go through
  // `projectMutable.source` so the lazy-init from `sourceForScope("local")` is
  // visible to subsequent get/set/save.
  const projectMutable: { source: Source | null } = { source: projectSource }

  function sourceForScope(scope: Scope): Source {
    if (scope === "local") {
      if (!projectMutable.source) {
        // Lazy-init project source — needed when first --local write happens.
        if (!opts.appName) {
          throw new Error(
            "config: cannot write --local without `appName` (no project path resolvable)",
          )
        }
        const newPath = join(cwd, `.${opts.appName}`, "config.yaml")
        const created: Source = { path: newPath, doc: new Document({}), raw: {} }
        projectMutable.source = created
        attachWatcher(newPath)
        return created
      }
      return projectMutable.source
    }
    if (!globalSource) {
      throw new Error("config: no global path resolved (load with `appName` or explicit `path`)")
    }
    return globalSource
  }

  const config: Config = {
    get globalPath(): string | null {
      return globalSource?.path ?? null
    },
    get projectPath(): string | null {
      return projectMutable.source?.path ?? null
    },
    get path(): string | null {
      return projectMutable.source?.path ?? globalSource?.path ?? null
    },
    get<T = unknown>(key: string): T | undefined {
      return getDeep(merged, key) as T | undefined
    },
    set(key: string, value: unknown, scope: Scope = "global"): void {
      const source = sourceForScope(scope)
      setDeep(source.raw, key, value)
      const parts = splitKey(key)
      ensureMapsAlongPath(source.doc, parts.slice(0, -1))
      source.doc.setIn(parts, value)
      // Recompute merged after the source mutation.
      merged = computeMerged(globalSource, projectMutable.source, opts.defaults)
      bumpVersion()
    },
    unset(key: string, scope: Scope = "global"): void {
      const source = sourceForScope(scope)
      unsetDeep(source.raw, key)
      source.doc.deleteIn(splitKey(key))
      merged = computeMerged(globalSource, projectMutable.source, opts.defaults)
      bumpVersion()
    },
    has(key: string): boolean {
      return hasDeep(merged, key)
    },
    list(opts2?: { pattern?: string }): ConfigEntry[] {
      const all: ConfigEntry[] = []
      walk(merged, "", (k, v) => all.push({ key: k, value: v }))
      if (opts2?.pattern) {
        const re = globToRegExp(opts2.pattern)
        return all.filter((e) => re.test(e.key))
      }
      return all
    },
    async save(saveOpts?: { scope?: Scope }): Promise<void> {
      const scope: Scope = saveOpts?.scope ?? "global"
      const source = sourceForScope(scope)

      if (opts.schema) validateOrThrow(opts.schema, merged, source.path)

      const text = source.doc.toString({ lineWidth: 0, defaultStringType: "PLAIN" })
      await mkdir(dirname(source.path), { recursive: true })
      const tmp = `${source.path}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`
      await writeFile(tmp, text, { encoding: "utf8", mode: 0o600 })
      await rename(tmp, source.path)
      lastSelfSaveAt.set(source.path, Date.now())

      const before = snapshot
      diffNotify(before, merged, "", listeners)
      snapshot = structuredClone(merged)

      // Attach watcher on first save if file didn't exist at load time.
      if (opts.watch) attachWatcher(source.path)
    },
    async reload(): Promise<void> {
      for (const source of [globalSource, projectMutable.source]) {
        if (!source) continue
        if (!existsSync(source.path)) continue
        const text = await readFile(source.path, "utf8")
        source.doc = parseDocument(text, { keepSourceTokens: true })
        source.raw = (source.doc.toJS() as Record<string, unknown> | null) ?? {}
      }
      merged = computeMerged(globalSource, projectMutable.source, opts.defaults)
      snapshot = structuredClone(merged)
      bumpVersion()
    },
    onChange(fn: ChangeListener): () => void {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    registry<S extends ZodSchema>(prefix: string, kind: Kind<S>): Registry<S> {
      return buildRegistry(this, prefix, kind, _version)
    },
    signal<T = unknown>(key: string): ReadSignal<T | undefined> {
      let cached = signalCache.get(key)
      if (!cached) {
        cached = computed<T | undefined>(() => {
          _version()
          return getDeep(merged, key) as T | undefined
        })
        signalCache.set(key, cached as ReadSignal<unknown>)
      }
      return cached as ReadSignal<T | undefined>
    },
    rootSignal(): ReadSignal<Record<string, unknown>> {
      const key = "__root__"
      let cached = signalCache.get(key)
      if (!cached) {
        cached = computed<Record<string, unknown>>(() => {
          _version()
          return { ...merged }
        }) as ReadSignal<unknown>
        signalCache.set(key, cached)
      }
      return cached as ReadSignal<Record<string, unknown>>
    },
    unwatch(): void {
      if (watchTimer) {
        clearTimeout(watchTimer)
        watchTimer = null
      }
      for (const w of watchers) w.close()
      watchers.length = 0
    },
  }

  return config
}

// ---------------------------------------------------------------------------
// Path resolution

function defaultGlobalPath(appName: string): string {
  if (process.platform === "win32") {
    const appData = process.env["APPDATA"] ?? join(homedir(), "AppData", "Roaming")
    return join(appData, appName, "config.yaml")
  }
  // Linux + macOS: XDG-style. macOS users overwhelmingly expect ~/.config/<app>
  // for CLI tools rather than ~/Library/Preferences (which is for GUI apps).
  const xdg = process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config")
  return join(xdg, appName, "config.yaml")
}

let projectExplorer: PublicExplorer | null = null
function getProjectExplorer(appName: string): PublicExplorer {
  // Cache one explorer per process — cosmiconfig's own cache stays disabled
  // (we manage caching via signals/version).
  if (projectExplorer) return projectExplorer
  projectExplorer = cosmiconfig(appName, {
    searchPlaces: [`.${appName}/config.yaml`, `.${appName}/config.yml`],
    searchStrategy: "project",
    loaders: {
      ".yaml": defaultLoaders[".yaml"],
      ".yml": defaultLoaders[".yml"],
    },
    cache: false,
  })
  return projectExplorer
}

async function findProjectPath(appName: string, cwd: string): Promise<string | null> {
  const explorer = getProjectExplorer(appName)
  const result = await explorer.search(cwd)
  return result?.filepath ?? null
}

// ---------------------------------------------------------------------------
// Source loading

async function loadOrInitSource(path: string, createIfMissing: boolean): Promise<Source> {
  if (existsSync(path)) {
    const text = await readFile(path, "utf8")
    const doc = parseDocument(text, { keepSourceTokens: true })
    const raw = (doc.toJS() as Record<string, unknown> | null) ?? {}
    return { path, doc, raw }
  }
  if (!createIfMissing) {
    throw new Error(`config: ${path} does not exist (createIfMissing: false)`)
  }
  return { path, doc: new Document({}), raw: {} }
}

function computeMerged(
  globalSrc: Source | null,
  projectSrc: Source | null,
  defaults: Record<string, unknown> | undefined,
): Record<string, unknown> {
  let out: Record<string, unknown> = defaults ? structuredClone(defaults) : {}
  if (globalSrc) out = deepMerge(out, globalSrc.raw) as Record<string, unknown>
  if (projectSrc) out = deepMerge(out, projectSrc.raw) as Record<string, unknown>
  return out
}

// ---------------------------------------------------------------------------
// Path helpers (dot-keyed deep access on plain JS objects)

function getDeep(obj: Record<string, unknown>, key: string): unknown {
  const parts = splitKey(key)
  let cur: unknown = obj
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[p]
    if (cur === undefined) return undefined
  }
  return cur
}

function setDeep(obj: Record<string, unknown>, key: string, value: unknown): void {
  const parts = splitKey(key)
  let cur: Record<string, unknown> = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i] as string
    if (!(p in cur) || typeof cur[p] !== "object" || cur[p] === null || Array.isArray(cur[p])) {
      cur[p] = {}
    }
    cur = cur[p] as Record<string, unknown>
  }
  cur[parts[parts.length - 1] as string] = value
}

function unsetDeep(obj: Record<string, unknown>, key: string): void {
  const parts = splitKey(key)
  let cur: Record<string, unknown> = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i] as string
    const next = cur[p]
    if (next === undefined || next === null || typeof next !== "object" || Array.isArray(next))
      return
    cur = next as Record<string, unknown>
  }
  delete cur[parts[parts.length - 1] as string]
}

function hasDeep(obj: Record<string, unknown>, key: string): boolean {
  const parts = splitKey(key)
  let cur: unknown = obj
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return false
    if (!(p in (cur as Record<string, unknown>))) return false
    cur = (cur as Record<string, unknown>)[p]
  }
  return true
}

function splitKey(key: string): string[] {
  if (key === "") throw new Error("config: empty key")
  return key.split(".")
}

/**
 * Walk a path and ensure each ancestor is a YAML Collection (a real YAMLMap
 * node). Missing ancestors are created via `doc.createNode({})`, which
 * produces a `YAMLMap` rather than a Pair-wrapped plain JS object — the
 * latter breaks subsequent `setIn` because `Collection.setIn` checks for
 * `isCollection(node)` to recurse.
 */
function ensureMapsAlongPath(doc: Document.Parsed | Document, parts: string[]): void {
  if (parts.length === 0) return
  if (doc.contents == null) doc.contents = doc.createNode({})
  const path: string[] = []
  for (const part of parts) {
    path.push(part)
    const node = doc.getIn(path, true)
    if (node === undefined) {
      doc.setIn(path, doc.createNode({}))
      continue
    }
    const isCollection =
      node !== null && typeof node === "object" && "items" in (node as Record<string, unknown>)
    if (!isCollection) {
      doc.setIn(path, doc.createNode({}))
    }
  }
}

function walk(obj: unknown, prefix: string, visit: (k: string, v: unknown) => void): void {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    if (prefix !== "") visit(prefix, obj)
    return
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const next = prefix === "" ? k : `${prefix}.${k}`
    walk(v, next, visit)
  }
}

function deepMerge(a: unknown, b: unknown): unknown {
  if (b === undefined) return a
  if (a === null || typeof a !== "object" || Array.isArray(a)) return b
  if (b === null || typeof b !== "object" || Array.isArray(b)) return b
  const out: Record<string, unknown> = { ...(a as Record<string, unknown>) }
  for (const [k, v] of Object.entries(b as Record<string, unknown>)) {
    if (k in out) out[k] = deepMerge(out[k], v)
    else out[k] = v
  }
  return out
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^.]*")
  return new RegExp(`^${escaped}$`)
}

function resolveHome(p: string): string {
  if (p.startsWith("~/") || p === "~") return join(homedir(), p.slice(1))
  return resolve(p)
}

function validateOrThrow(schema: ZodSchema, raw: unknown, path: string): void {
  const r = schema.safeParse(raw)
  if (!r.success) {
    const issues = r.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")
    throw new Error(`config: ${path} failed validation:\n${issues}`)
  }
}

function diffNotify(
  before: unknown,
  after: unknown,
  prefix: string,
  listeners: Set<ChangeListener>,
): void {
  if (listeners.size === 0) return
  walk(before, prefix, (k, v) => {
    const v2 = getDeep(
      after as Record<string, unknown>,
      k.startsWith(prefix) ? k.slice(prefix.length) : k,
    )
    if (!Object.is(v, v2)) {
      for (const fn of listeners) fn(k, v, v2)
    }
  })
  walk(after, prefix, (k, v) => {
    const v2 = getDeep(
      before as Record<string, unknown>,
      k.startsWith(prefix) ? k.slice(prefix.length) : k,
    )
    if (v2 === undefined && v !== undefined) {
      for (const fn of listeners) fn(k, undefined, v)
    }
  })
}
