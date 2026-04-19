/**
 * Built-in CLI types — Standard Schema v1 validators for common CLI argument patterns.
 *
 * Zero dependencies — validation is manual, no Zod/Valibot/ArkType required.
 * Each type implements Standard Schema v1 for interop with any schema library,
 * plus standalone `.parse()` and `.safeParse()` convenience methods.
 *
 * @example
 * ```ts
 * import { Command, port, csv } from "@silvery/commander"
 *
 * new Command("deploy")
 *   .option("-p, --port <n>", "Port", port)           // number (1-65535)
 *   .option("-r, --retries <n>", "Retries", int)      // number (integer)
 *   .option("--tags <t>", "Tags", csv)                // string[]
 *   .option("-e, --env <e>", "Env", ["dev", "staging", "prod"])
 *
 * // Standalone usage (outside Commander)
 * port.parse("3000")       // 3000
 * port.safeParse("abc")    // { success: false, issues: [{ message: "..." }] }
 * ```
 */

/**
 * Standard Schema v1 interface — the universal schema interop protocol.
 * Supports any schema library that implements Standard Schema (Zod >=3.24,
 * Valibot >=1.0, ArkType >=2.0, etc.).
 *
 * Inlined to avoid any dependency on @standard-schema/spec.
 * See: https://github.com/standard-schema/standard-schema
 */
export interface StandardSchemaV1<T = unknown> {
  readonly "~standard": {
    readonly version: 1
    readonly vendor: string
    readonly validate: (
      value: unknown,
    ) =>
      | { value: T }
      | { issues: ReadonlyArray<{ message: string; path?: ReadonlyArray<unknown> }> }
  }
}

/** A Standard Schema v1 CLI type with standalone parse/safeParse methods. */
export interface CLIType<T> extends StandardSchemaV1<T> {
  /** Parse and validate a value, throwing on failure. */
  parse(value: unknown): T
  /** Parse and validate a value, returning a result object. */
  safeParse(
    value: unknown,
  ): { success: true; value: T } | { success: false; issues: Array<{ message: string }> }
}

function createType<T>(vendor: string, validate: (value: unknown) => T): CLIType<T> {
  const schema: CLIType<T> = {
    "~standard": {
      version: 1,
      vendor,
      validate: (value) => {
        try {
          return { value: validate(value) }
        } catch (e: any) {
          return { issues: [{ message: e.message }] }
        }
      },
    },
    parse(value: unknown): T {
      const result = schema["~standard"].validate(value)
      if ("issues" in result) throw new Error(result.issues[0]?.message ?? "Validation failed")
      return result.value
    },
    safeParse(value: unknown) {
      const result = schema["~standard"].validate(value)
      if ("issues" in result) return { success: false as const, issues: [...result.issues] }
      return { success: true as const, value: result.value }
    },
  }
  return schema
}

const VENDOR = "@silvery/commander"

/** Integer (coerced from string). */
export const int = createType<number>(VENDOR, (v) => {
  const s = String(v).trim()
  if (s === "") throw new Error(`Expected integer, got "${v}"`)
  const n = Number(s)
  if (!Number.isInteger(n)) throw new Error(`Expected integer, got "${v}"`)
  return n
})

/** Unsigned integer (>= 0, coerced from string). */
export const uint = createType<number>(VENDOR, (v) => {
  const s = String(v).trim()
  if (s === "") throw new Error(`Expected unsigned integer (>= 0), got "${v}"`)
  const n = Number(s)
  if (!Number.isInteger(n) || n < 0) throw new Error(`Expected unsigned integer (>= 0), got "${v}"`)
  return n
})

/** Float (coerced from string). */
export const float = createType<number>(VENDOR, (v) => {
  const s = String(v).trim()
  if (s === "" || s === "NaN") throw new Error(`Expected number, got "${v}"`)
  const n = Number(s)
  if (Number.isNaN(n)) throw new Error(`Expected number, got "${v}"`)
  return n
})

/** Port number (1-65535). */
export const port = createType<number>(VENDOR, (v) => {
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1 || n > 65535)
    throw new Error(`Expected port (1-65535), got "${v}"`)
  return n
})

/** URL (validated via URL constructor). */
export const url = createType<string>(VENDOR, (v) => {
  const s = String(v)
  try {
    new URL(s)
    return s
  } catch {
    throw new Error(`Expected valid URL, got "${v}"`)
  }
})

/** File path (non-empty string). */
export const path = createType<string>(VENDOR, (v) => {
  const s = String(v)
  if (!s) throw new Error("Expected non-empty path")
  return s
})

/** Comma-separated values to string[]. */
export const csv = createType<string[]>(VENDOR, (v) => {
  return String(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
})

/** JSON string to parsed value. */
export const json = createType<unknown>(VENDOR, (v) => {
  try {
    return JSON.parse(String(v))
  } catch {
    throw new Error(`Expected valid JSON, got "${v}"`)
  }
})

/** Boolean string ("true"/"false"/"1"/"0"/"yes"/"no"). */
export const bool = createType<boolean>(VENDOR, (v) => {
  const s = String(v).toLowerCase()
  if (["true", "1", "yes", "y"].includes(s)) return true
  if (["false", "0", "no", "n"].includes(s)) return false
  throw new Error(`Expected boolean (true/false/yes/no/1/0), got "${v}"`)
})

/** Date string to Date object. */
export const date = createType<Date>(VENDOR, (v) => {
  const d = new Date(String(v))
  if (isNaN(d.getTime())) throw new Error(`Expected valid date, got "${v}"`)
  return d
})

/** Email address (basic validation). */
export const email = createType<string>(VENDOR, (v) => {
  const s = String(v)
  if (!s.includes("@") || !s.includes(".")) throw new Error(`Expected email address, got "${v}"`)
  return s
})

/** Regex pattern string to RegExp. */
export const regex = createType<RegExp>(VENDOR, (v) => {
  try {
    return new RegExp(String(v))
  } catch {
    throw new Error(`Expected valid regex, got "${v}"`)
  }
})

/** Integer with min/max bounds (factory). */
export function intRange(min: number, max: number): CLIType<number> {
  return createType<number>(VENDOR, (v) => {
    const n = Number(v)
    if (!Number.isInteger(n) || n < min || n > max)
      throw new Error(`Expected integer ${min}-${max}, got "${v}"`)
    return n
  })
}
