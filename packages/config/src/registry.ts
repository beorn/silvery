import { computed } from "alien-signals"
import type { ZodSchema, z } from "zod"
import { formatString, parseString } from "./parse.ts"
import type { Config, Kind, ReadSignal, Registry, RegistryEntry, Signal } from "./types.ts"

/**
 * Build a typed registry view over a sub-tree of a Config.
 *
 * The registry treats each leaf under `prefix` as a kind-typed entry, with
 * one reserved leaf (`default`) holding the active entry name. Entries can
 * be stored as strings (parsed via the kind's connection-string grammar) or
 * as objects (validated via the kind's schema).
 *
 * `version` is the master change-counter signal (passed in by `loadConfig`)
 * that all registry-derived signals subscribe to.
 */
export function buildRegistry<S extends ZodSchema>(
  config: Config,
  prefix: string,
  kind: Kind<S>,
  version: Signal<number>,
): Registry<S> {
  const defaultKey = `${prefix}.default`

  function readRaw(): Record<string, unknown> {
    return (config.get<Record<string, unknown>>(prefix) ?? {}) as Record<string, unknown>
  }

  function rejectIfReserved(name: string): void {
    if (kind.reservedKeys.has(name)) {
      throw new Error(
        `${prefix}: "${name}" is a reserved key. Use config.set("${prefix}.${name}", ...) is not allowed.`,
      )
    }
  }

  function parseEntry(rawName: string, raw: unknown): z.infer<S> {
    if (typeof raw === "string") {
      return parseString(raw, kind)
    }
    if (raw !== null && typeof raw === "object") {
      const obj = raw as Record<string, unknown>
      if (typeof obj.base === "string") {
        // Hybrid form: parse `base:` string, then merge other object fields on top.
        const base = parseString(obj.base, kind)
        const { base: _b, ...rest } = obj
        return kind.schema.parse({ ...(base as object), ...rest }) as z.infer<S>
      }
      return kind.schema.parse(raw) as z.infer<S>
    }
    throw new Error(`${prefix}.${rawName}: expected string or object, got ${typeof raw}`)
  }

  return {
    entries(): RegistryEntry<S>[] {
      const root = readRaw()
      const out: RegistryEntry<S>[] = []
      for (const [name, raw] of Object.entries(root)) {
        if (kind.reservedKeys.has(name)) continue
        out.push({ name, value: parseEntry(name, raw) })
      }
      return out
    },

    get(name: string): z.infer<S> | undefined {
      if (kind.reservedKeys.has(name)) return undefined
      const raw = config.get<unknown>(`${prefix}.${name}`)
      if (raw === undefined) return undefined
      return parseEntry(name, raw)
    },

    resolve(input: string): z.infer<S> | null {
      // Heuristic: if the input contains `?` or `=`, treat it as a connection string.
      // Otherwise treat it as a label.
      if (input.includes("?") || input.includes("=") || input.includes("://")) {
        return parseString(input, kind)
      }
      const raw = config.get<unknown>(`${prefix}.${input}`)
      if (raw === undefined) return null
      return parseEntry(input, raw)
    },

    format(name: string): string {
      const value = this.get(name)
      if (value === undefined) throw new Error(`${prefix}.${name}: no such entry`)
      return formatString(value, kind)
    },

    default(): string | undefined {
      const v = config.get<unknown>(defaultKey)
      return typeof v === "string" ? v : undefined
    },

    setDefault(name: string): void {
      // Don't validate that the entry exists — allow setting a "future" default
      // before the entry is added. This matches `kubectl config use-context`.
      config.set(defaultKey, name)
    },

    add(name: string, value: string | Record<string, unknown>): void {
      rejectIfReserved(name)
      // Validate before writing — fail loud on bad input.
      parseEntry(name, value)
      config.set(`${prefix}.${name}`, value)
    },

    rm(name: string): void {
      rejectIfReserved(name)
      config.unset(`${prefix}.${name}`)
    },

    has(name: string): boolean {
      if (kind.reservedKeys.has(name)) return false
      return config.has(`${prefix}.${name}`)
    },

    signalEntries(): ReadSignal<RegistryEntry<S>[]> {
      return computed<RegistryEntry<S>[]>(() => {
        version()
        const root = readRaw()
        const out: RegistryEntry<S>[] = []
        for (const [name, raw] of Object.entries(root)) {
          if (kind.reservedKeys.has(name)) continue
          try {
            out.push({ name, value: parseEntry(name, raw) })
          } catch {
            // Skip invalid entries in the signal view; consumers see clean state.
          }
        }
        return out
      })
    },
    signalDefault(): ReadSignal<z.infer<S> | undefined> {
      return computed<z.infer<S> | undefined>(() => {
        version()
        const v = config.get<unknown>(`${prefix}.default`)
        if (typeof v !== "string") return undefined
        const raw = config.get<unknown>(`${prefix}.${v}`)
        if (raw === undefined) return undefined
        try {
          return parseEntry(v, raw)
        } catch {
          return undefined
        }
      })
    },
    signalGet(name: string): ReadSignal<z.infer<S> | undefined> {
      return computed<z.infer<S> | undefined>(() => {
        version()
        if (kind.reservedKeys.has(name)) return undefined
        const raw = config.get<unknown>(`${prefix}.${name}`)
        if (raw === undefined) return undefined
        try {
          return parseEntry(name, raw)
        } catch {
          return undefined
        }
      })
    },
  }
}
