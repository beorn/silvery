import type { ZodSchema, z } from "zod"

export type Signal<T> = {
  (): T
  (value: T): void
}

export type ReadSignal<T> = () => T

/**
 * Coercion hint for query-string values. Default for unknown keys is "string".
 */
export type CoerceType = "boolean" | "number" | "string" | "array"

export interface KindOpts<S extends ZodSchema> {
  /** Used in error messages: "ai.acp.foo: invalid <name>". */
  name: string
  schema: S
  /** When set, the URI path-segment maps to this field. E.g. `claude-code?...` → `?agent=claude-code&...`. */
  pathField?: keyof z.infer<S> & string
  /** Entries with these names are rejected by the registry. Default: `["default"]`. */
  reservedKeys?: string[]
  /** Per-key coercion hints for connection-string parsing. */
  coerce?: Record<string, CoerceType>
}

export interface Kind<S extends ZodSchema> {
  readonly name: string
  readonly schema: S
  readonly pathField?: keyof z.infer<S> & string
  readonly reservedKeys: ReadonlySet<string>
  readonly coerce: Readonly<Record<string, CoerceType>>
}

export interface ConfigEntry {
  key: string
  value: unknown
}

export interface RegistryEntry<S extends ZodSchema> {
  name: string
  value: z.infer<S>
}

export interface Config {
  /** Absolute path of the global YAML file (null if not loaded). */
  readonly globalPath: string | null
  /** Absolute path of the project-local YAML file (null if not found). */
  readonly projectPath: string | null
  /** Convenience: prefer projectPath, fall back to globalPath. Useful for `--edit`. */
  readonly path: string | null
  /** Read a value at a dot-path from the merged view (project overrides global). */
  get<T = unknown>(key: string): T | undefined
  /** Write a value at a dot-path. Default scope: "global". "local" writes to project file. */
  set(key: string, value: unknown, scope?: "global" | "local"): void
  /** Remove the leaf at a dot-path. Default scope: "global". */
  unset(key: string, scope?: "global" | "local"): void
  /** Check whether a dot-path exists. */
  has(key: string): boolean
  /** Flat listing of all leaves. Optional pattern: glob-like (`ai.acp.*`). */
  list(opts?: { pattern?: string }): ConfigEntry[]
  /** Persist to disk atomically. Default scope: "global"; "local" writes to project file (creates it if missing). */
  save(opts?: { scope?: "global" | "local" }): Promise<void>
  /** Re-read from disk, discarding in-memory mutations. */
  reload(): Promise<void>
  /** Subscribe to post-save changes. Returns an unsubscribe function. */
  onChange(fn: ChangeListener): () => void
  /** Build a typed registry view over a sub-tree. */
  registry<S extends ZodSchema>(prefix: string, kind: Kind<S>): Registry<S>

  /** Read+subscribe to a deep-key as a callable signal. Re-fires on save() and external watch events when the value at this path changes. */
  signal<T = unknown>(key: string): ReadSignal<T | undefined>
  /** Read+subscribe to the entire config root. */
  rootSignal(): ReadSignal<Record<string, unknown>>
  /** Stop watching the file (no-op if watch wasn't enabled). */
  unwatch(): void
}

export type ChangeListener = (key: string, oldVal: unknown, newVal: unknown) => void

export interface Registry<S extends ZodSchema> {
  /** All entries (excludes reserved keys like `default`). */
  entries(): RegistryEntry<S>[]
  /** Read a single entry. Returns undefined if missing. Throws on reserved key. */
  get(name: string): z.infer<S> | undefined
  /** Resolve a label OR a connection string. Returns null if input is a label that doesn't exist. */
  resolve(input: string): z.infer<S> | null
  /** Format a stored entry as a connection string. Lossy if the entry has unknown extra fields. */
  format(name: string): string
  /** Read the registry's default entry name (from `<prefix>.default`). */
  default(): string | undefined
  /** Set the registry's default entry name. */
  setDefault(name: string): void
  /** Add or replace an entry. Value can be a connection string or an object. */
  add(name: string, value: string | Record<string, unknown>): void
  /** Remove an entry. */
  rm(name: string): void
  /** Check whether an entry exists. */
  has(name: string): boolean

  /** Subscribe to all entries (excludes reserved keys). Re-fires when any entry under prefix changes. */
  signalEntries(): ReadSignal<RegistryEntry<S>[]>
  /** Subscribe to the default entry's value. */
  signalDefault(): ReadSignal<z.infer<S> | undefined>
  /** Subscribe to one named entry. */
  signalGet(name: string): ReadSignal<z.infer<S> | undefined>
}

export interface LoadOpts {
  /**
   * App name for XDG-style config discovery. Resolves global to
   * `${XDG_CONFIG_HOME:-~/.config}/<appName>/config.yaml` (or `.yml`),
   * and project via cosmiconfig walk-up for `.<appName>/config.{yaml,yml}`.
   * One of `appName` or `path` is required.
   */
  appName?: string
  /**
   * Single explicit YAML file path. When set, treated as the global config
   * (no project walk-up). Use for tests or one-off loads.
   * One of `appName` or `path` is required.
   */
  path?: string
  /** Override starting cwd for project walk-up. Default: process.cwd(). */
  cwd?: string
  /** Override the resolved global path (env-var-style: KM_CONFIG analog). */
  globalPath?: string
  /** Skip project walk-up. Default: true (project search enabled). */
  searchProject?: boolean
  /** Skip global load. Default: true (global load enabled). */
  searchGlobal?: boolean
  /** Optional whole-file Zod schema for load-time validation. */
  schema?: ZodSchema
  /** Deep-merged into the parsed config to fill in missing keys. */
  defaults?: Record<string, unknown>
  /** When true, missing files are created empty on first save. Default: true. */
  createIfMissing?: boolean
  /** Watch loaded files for external changes; reload + fire signals automatically. Default: false. */
  watch?: boolean
  /** Debounce window for coalescing watch events (ms). Default: 100. */
  watchDebounceMs?: number
}
