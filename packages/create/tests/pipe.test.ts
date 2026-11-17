/**
 * pipe() — the one composition primitive (32325 Slice A).
 *
 * @failure  a consumer outside Silvery's app surface can no longer compose typed values from the
 *           standalone subpath, or the subpath quietly grows a runtime dependency and stops being
 *           import-free
 * @level    l1
 * @consumer @i/19-hab-tsx/32298-decide-what-a-hab-module-may/32325-create-habitat-pipe (Slice A: one published silvery pipe)
 * @testonly none
 * @reach    fs-walk vendor/silvery/packages/create/src/pipe.ts
 *
 * `silvery/pipe` is the standalone, import-free subpath: a consumer outside
 * Silvery's app surface pins it by exact version and composes values without
 * importing the app barrel or any UI dependency. The implementation stays in
 * `@silvery/create/pipe` (packages/create/src/pipe.ts), which imports nothing;
 * these tests pin the behaviour, the subpath resolution, and the import-free
 * contract so the published entry cannot silently grow a dependency.
 */

import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"
import { pipe } from "silvery/pipe"

describe("silvery/pipe", () => {
  test("composes left-to-right and returns the base unchanged with no plugins", () => {
    const base = { count: 0 }
    expect(pipe(base)).toBe(base)
    const add =
      (n: number) =>
      (v: { count: number }): { count: number } => ({ count: v.count + n })
    expect(pipe(base, add(2), add(3))).toEqual({ count: 5 })
  })

  test("a plugin sees the previous plugin's additions (typed prerequisites)", () => {
    const withName =
      (name: string) =>
      <T>(v: T): T & { name: string } => ({ ...v, name })
    const greet = (v: { name: string }): { name: string; greeting: string } => ({
      ...v,
      greeting: `hello ${v.name}`,
    })
    expect(pipe({}, withName("hab"), greet)).toEqual({ name: "hab", greeting: "hello hab" })
  })

  test("chains beyond seven plugins typecheck and run (overloads to twelve)", () => {
    const inc = (v: { n: number }): { n: number } => ({ n: v.n + 1 })
    const out = pipe({ n: 0 }, inc, inc, inc, inc, inc, inc, inc, inc, inc)
    expect(out).toEqual({ n: 9 })
  })

  test("the implementation stays import-free", () => {
    const source = readFileSync(new URL("../src/pipe.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/^\s*import\s/m)
    expect(source).not.toContain("require(")
  })
})
