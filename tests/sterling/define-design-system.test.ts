/**
 * defineDesignSystem — generic flat-projection contract for any DesignSystem.
 *
 * Covers the three modes of the `flatten` flag:
 *   - `flatten: true`           → default channel-role-state rule (Sterling style)
 *   - `flatten: <FlattenRule>`  → custom per-system rule
 *   - `flatten: false`          → no auto-bake (nested-only output)
 *
 * These tests construct minimal DesignSystems (not Sterling) so the
 * framework-level behaviour is visible independent of Sterling's derivation
 * rules.
 */

import { describe, test, expect } from "vitest"
import { bakeFlat, defaultFlattenRule, type FlattenRule } from "@silvery/ansi"
import { defineDesignSystem } from "@silvery/theme/sterling"
import type { DesignSystem, Theme, ThemeShape } from "@silvery/theme/sterling"

// Minimal nested theme shape — the two pieces `bakeFlat` cares about
// (hex leaves) plus metadata that should NOT be flattened.
const nested = () => ({
  name: "tiny",
  mode: "dark" as const,
  accent: { fg: "#0969da", bg: "#1f6feb", fgOn: "#ffffff" },
  surface: { default: "#0d1117", subtle: "#161b22" },
  cursor: { fg: "#ffffff", bg: "#0969da" },
})

const SHAPE: ThemeShape = {
  flatTokens: [
    "fg-accent",
    "bg-accent",
    "fg-on-accent",
    "bg-surface-default",
    "bg-surface-subtle",
    "fg-cursor",
    "bg-cursor",
  ],
  roles: ["accent", "surface", "cursor"],
  states: [],
}

function makeTiny(flatten: DesignSystem["flatten"]): DesignSystem {
  const raw: DesignSystem = {
    name: "tiny",
    shape: SHAPE,
    flatten,
    defaults: () => nested() as unknown as Theme,
    theme: () => nested() as unknown as Theme,
    deriveFromScheme: () => nested() as unknown as Theme,
    deriveFromColor: () => nested() as unknown as Theme,
    deriveFromPair: () => ({
      light: nested() as unknown as Theme,
      dark: nested() as unknown as Theme,
    }),
    deriveFromSchemeWithBrand: () => nested() as unknown as Theme,
  }
  return defineDesignSystem(raw)
}

describe("defineDesignSystem — flatten flag", () => {
  test("flatten: true populates default channel-role-state flat keys", () => {
    const sys = makeTiny(true)
    const t = sys.defaults() as unknown as Record<string, unknown>

    expect(t["fg-accent"]).toBe("#0969da")
    expect(t["bg-accent"]).toBe("#1f6feb")
    expect(t["fg-on-accent"]).toBe("#ffffff")
    expect(t["bg-surface-default"]).toBe("#0d1117")
    expect(t["bg-surface-subtle"]).toBe("#161b22")
    expect(t["fg-cursor"]).toBe("#ffffff")
    expect(t["bg-cursor"]).toBe("#0969da")
  })

  test("flatten: true — nested and flat reference the SAME string", () => {
    const sys = makeTiny(true)
    const t = sys.defaults() as unknown as Record<string, unknown> & {
      accent: { bg: string }
      surface: { subtle: string }
    }

    expect(t.accent.bg).toBe(t["bg-accent"])
    expect(t.surface.subtle).toBe(t["bg-surface-subtle"])
  })

  test("flatten: true — returned Theme is frozen deeply", () => {
    const sys = makeTiny(true)
    const t = sys.defaults()

    expect(Object.isFrozen(t)).toBe(true)
    expect(Object.isFrozen((t as unknown as { accent: object }).accent)).toBe(true)
    expect(Object.isFrozen((t as unknown as { surface: object }).surface)).toBe(true)
  })

  test("flatten: true — metadata (name, mode) is NOT flattened", () => {
    const sys = makeTiny(true)
    const t = sys.defaults() as unknown as Record<string, unknown>

    expect(t.name).toBe("tiny")
    expect(t.mode).toBe("dark")
    // No stray flat keys for metadata:
    expect(Object.keys(t).filter((k) => k.startsWith("name-") || k.startsWith("mode-"))).toEqual([])
  })

  test("flatten: false — no flat keys populated, nested still works, NOT frozen", () => {
    const sys = makeTiny(false)
    const t = sys.defaults() as unknown as Record<string, unknown> & { accent: { bg: string } }

    // Nested still works:
    expect(t.accent.bg).toBe("#1f6feb")
    // No flat projection:
    expect(t["bg-accent"]).toBeUndefined()
    expect(t["bg-surface-default"]).toBeUndefined()
    expect(t["fg-cursor"]).toBeUndefined()
    // Not frozen:
    expect(Object.isFrozen(t)).toBe(false)
  })

  test("flatten omitted (undefined) behaves like flatten: false", () => {
    const sys = makeTiny(undefined)
    const t = sys.defaults() as unknown as Record<string, unknown>

    expect(t["bg-accent"]).toBeUndefined()
    expect(Object.isFrozen(t)).toBe(false)
  })

  test("flatten: <FlattenRule> — custom rule produces custom flat keys", () => {
    // Material-style: `onPrimary` instead of `fg-on-accent`; camelCase join
    // instead of hyphens. A made-up convention purely to prove the rule runs.
    const materialRule: FlattenRule = (path) => {
      if (path.length < 2) return null
      const [role, ...rest] = path
      const last = rest[rest.length - 1]!
      if (last === "fgOn") return `on${cap(role!)}`
      if (last === "fg" || last === "bg") {
        const prefix = last === "fg" ? "text" : "surface"
        return `${prefix}${cap(role!)}`
      }
      // Surface level names: surfaceDefault, surfaceSubtle
      if (role === "surface") return `surface${cap(last)}`
      return null
    }
    const sys = makeTiny(materialRule)
    const t = sys.defaults() as unknown as Record<string, unknown>

    expect(t["textAccent"]).toBe("#0969da")
    expect(t["surfaceAccent"]).toBe("#1f6feb")
    expect(t["onAccent"]).toBe("#ffffff")
    expect(t["surfaceDefault"]).toBe("#0d1117")
    expect(t["surfaceSubtle"]).toBe("#161b22")
    expect(t["textCursor"]).toBe("#ffffff")
    expect(t["surfaceCursor"]).toBe("#0969da")

    // And default (channel-role-state) keys are NOT present — the custom
    // rule replaced the default.
    expect(t["bg-accent"]).toBeUndefined()
    expect(t["fg-on-accent"]).toBeUndefined()
  })
})

describe("defineDesignSystem — every derivation entry auto-flattens", () => {
  const sys = makeTiny(true)

  test("defaults() flattens", () => {
    const t = sys.defaults() as unknown as Record<string, unknown>
    expect(t["bg-accent"]).toBe("#1f6feb")
  })

  test("theme() flattens", () => {
    const t = sys.theme() as unknown as Record<string, unknown>
    expect(t["bg-accent"]).toBe("#1f6feb")
  })

  test("deriveFromScheme() flattens", () => {
    const scheme = {} as unknown as Parameters<typeof sys.deriveFromScheme>[0]
    const t = sys.deriveFromScheme(scheme) as unknown as Record<string, unknown>
    expect(t["bg-accent"]).toBe("#1f6feb")
  })

  test("deriveFromColor() flattens", () => {
    const t = sys.deriveFromColor("#ff00ff") as unknown as Record<string, unknown>
    expect(t["bg-accent"]).toBe("#1f6feb")
  })

  test("deriveFromPair() flattens both light + dark", () => {
    const scheme = {} as unknown as Parameters<typeof sys.deriveFromPair>[0]
    const pair = sys.deriveFromPair(scheme, scheme)
    expect((pair.light as unknown as Record<string, unknown>)["bg-accent"]).toBe("#1f6feb")
    expect((pair.dark as unknown as Record<string, unknown>)["bg-accent"]).toBe("#1f6feb")
    expect(Object.isFrozen(pair.light)).toBe(true)
    expect(Object.isFrozen(pair.dark)).toBe(true)
  })

  test("deriveFromSchemeWithBrand() flattens", () => {
    const scheme = {} as unknown as Parameters<typeof sys.deriveFromSchemeWithBrand>[0]
    const t = sys.deriveFromSchemeWithBrand(scheme, "#ff00ff") as unknown as Record<string, unknown>
    expect(t["bg-accent"]).toBe("#1f6feb")
  })
})

describe("defaultFlattenRule — channel-role-state", () => {
  test("maps canonical Sterling paths", () => {
    expect(defaultFlattenRule(["accent", "fg"])).toBe("fg-accent")
    expect(defaultFlattenRule(["accent", "bg"])).toBe("bg-accent")
    expect(defaultFlattenRule(["accent", "fgOn"])).toBe("fg-on-accent")
    expect(defaultFlattenRule(["inverse", "muted", "fgOn"])).toBe("fg-on-inverse-muted")
    expect(defaultFlattenRule(["accent", "border"])).toBe("border-accent")
    expect(defaultFlattenRule(["accent", "hover", "bg"])).toBe("bg-accent-hover")
    expect(defaultFlattenRule(["accent", "hover", "fg"])).toBe("fg-accent-hover")
    expect(defaultFlattenRule(["accent", "active", "bg"])).toBe("bg-accent-active")
    expect(defaultFlattenRule(["info", "hover", "bg"])).toBe("bg-info-hover")
    expect(defaultFlattenRule(["surface", "default"])).toBe("bg-surface-default")
    expect(defaultFlattenRule(["surface", "subtle"])).toBe("bg-surface-subtle")
    expect(defaultFlattenRule(["surface", "hover"])).toBe("bg-surface-hover")
    expect(defaultFlattenRule(["border", "default"])).toBe("border-default")
    expect(defaultFlattenRule(["border", "focus"])).toBe("border-focus")
    expect(defaultFlattenRule(["border", "muted"])).toBe("border-muted")
    expect(defaultFlattenRule(["cursor", "fg"])).toBe("fg-cursor")
    expect(defaultFlattenRule(["cursor", "bg"])).toBe("bg-cursor")
    expect(defaultFlattenRule(["muted", "fg"])).toBe("fg-muted")
    expect(defaultFlattenRule(["muted", "bg"])).toBe("bg-muted")
    expect(defaultFlattenRule(["fg"])).toBe("fg-default")
    expect(defaultFlattenRule(["bg"])).toBe("bg-default")
  })

  test("returns null for unflattenable paths", () => {
    expect(defaultFlattenRule(["name"])).toBeNull()
    expect(defaultFlattenRule(["mode"])).toBeNull()
    expect(defaultFlattenRule(["unknown", "weird"])).toBeNull()
  })
})

describe("bakeFlat — generic helper", () => {
  test("projects and deep-freezes a shallow-frozen input without mutating its nested roles", () => {
    // A root-only freeze is not the canonical frozen Theme contract: it has
    // neither the flat aliases nor immutable nested roles.
    const input = Object.freeze({ accent: { fg: "#0969da", bg: "#1f6feb" } })

    const projected = bakeFlat(input) as Record<string, unknown> & { accent: object }

    expect(projected).not.toBe(input)
    expect(projected["fg-accent"]).toBe("#0969da")
    expect(projected["bg-accent"]).toBe("#1f6feb")
    expect(Object.isFrozen(projected)).toBe(true)
    expect(Object.isFrozen(projected.accent)).toBe(true)
    expect(Object.isFrozen(input.accent)).toBe(false)
    expect(() => bakeFlat(Object.freeze({ accent: { fg: "Accent Blue" } }))).toThrow(
      'Invalid color leaf at "accent.fg": "Accent Blue"',
    )
  })

  test("baking twice is safe (idempotent on frozen input)", () => {
    const t = bakeFlat(nested())
    // Already frozen — second bake short-circuits.
    expect(bakeFlat(t)).toBe(t)
    expect((t as unknown as Record<string, unknown>)["bg-accent"]).toBe("#1f6feb")
  })

  test("frozen objects are not evidence that projection or nested freezing already ran", () => {
    // Acceptance: all returned projections are validated, equal, and deeply
    // frozen. The shallow-root case missed a fully frozen but unbaked root,
    // and a frozen intermediate role with a still-mutable grandchild.
    const frozen = Object.freeze({ accent: Object.freeze({ fg: "red" }) })
    expect((bakeFlat(frozen) as unknown as Record<string, unknown>)["fg-accent"]).toBe("red")
    expect(() => bakeFlat(Object.freeze({ accent: Object.freeze({ fg: "not-a-color" }) }))).toThrow(
      'Invalid color leaf at "accent.fg": "not-a-color"',
    )
    const mixed = { accent: Object.freeze({ hover: { fg: "red" } }) }
    expect(Object.isFrozen(bakeFlat(mixed).accent.hover)).toBe(true)
  })

  test("projects the closed terminal color grammar and freezes the result", () => {
    const theme = {
      name: "tiny", // root metadata is not a color leaf
      annotations: { label: "preserved metadata" },
      fg: "blueBright",
      bg: "",
      accent: { fg: "blueBright", bg: 196 },
      surface: { default: "" },
    }
    const t = bakeFlat(theme) as Record<string, unknown>

    expect(t["fg-accent"]).toBe("blueBright")
    expect(t["bg-accent"]).toBe(196)
    expect(t["fg-default"]).toBe("blueBright")
    expect(t["bg-default"]).toBe("")
    expect(t["bg-surface-default"]).toBe("")
    expect(t.annotations).toEqual({ label: "preserved metadata" })
    expect(Object.isFrozen(t)).toBe(true)
    expect(Object.isFrozen(t.accent)).toBe(true)
  })

  test("rejects an unsupported color leaf loudly without treating metadata as color", () => {
    for (const value of ["Accent Blue", "#abcde", "grayBright"]) {
      const theme = {
        name: "tiny",
        annotations: { label: "preserved metadata" },
        accent: { fg: value },
      }

      expect(() => bakeFlat(theme)).toThrow(`Invalid color leaf at "accent.fg": "${value}"`)
    }
  })
})

function cap(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1)
}
