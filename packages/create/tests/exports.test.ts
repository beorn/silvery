/**
 * Exports map smoke tests — verify all declared subpath imports resolve.
 *
 * The @silvery/create package has a wildcard `"./*": "./src/*.ts"` entry
 * in its exports map. That wildcard resolves .ts files but NOT .tsx. For
 * .tsx entry points (create-app.tsx, create-app-context.tsx), the package
 * has explicit non-wildcard entries ahead of the wildcard.
 *
 * These tests import every declared subpath to catch regressions where a
 * new .tsx module is added without its explicit export entry.
 *
 * Seen in the aichat-v2 spike: `import { createApp } from
 * "@silvery/create/create-app"` silently failed for weeks because the
 * wildcard only covers .ts.
 */

import { describe, expect, test } from "vitest"

describe("@silvery/create subpath exports", () => {
  test("root barrel resolves and exports core API", async () => {
    const mod = await import("@silvery/create")
    expect(typeof mod.pipe).toBe("function")
    expect(typeof mod.withReact).toBe("function")
    expect(typeof mod.createApp).toBe("function")
    expect(typeof mod.createAppContext).toBe("function")
  })

  test("@silvery/create/create-app resolves (.tsx entry)", async () => {
    const mod = await import("@silvery/create/create-app")
    expect(typeof mod.createApp).toBe("function")
  })

  test("@silvery/create/create-app-context resolves (.tsx entry)", async () => {
    const mod = await import("@silvery/create/create-app-context")
    expect(typeof mod.createAppContext).toBe("function")
  })

  test("@silvery/create/core resolves", async () => {
    const mod = await import("@silvery/create/core")
    // `none` is an Effect value, batch/compose/dispatch are functions.
    expect(mod.none).toEqual({ type: "none" })
    expect(typeof mod.batch).toBe("function")
    expect(typeof mod.compose).toBe("function")
    expect(typeof mod.dispatch).toBe("function")
  })

  test("@silvery/create/store resolves", async () => {
    const mod = await import("@silvery/create/store")
    expect(typeof mod.createStore).toBe("function")
  })

  test("@silvery/create/streams resolves", async () => {
    const mod = await import("@silvery/create/streams")
    expect(typeof mod.merge).toBe("function")
    expect(typeof mod.map).toBe("function")
  })

  test("@silvery/create/tea resolves", async () => {
    const mod = await import("@silvery/create/tea")
    expect(typeof mod.tea).toBe("function")
  })

  test("wildcard-covered .ts files resolve (e.g., pipe)", async () => {
    const mod = await import("@silvery/create/pipe")
    expect(typeof mod.pipe).toBe("function")
  })

  test("wildcard-covered .ts files resolve (e.g., effects)", async () => {
    const mod = await import("@silvery/create/effects")
    // fx is a namespace object with delay/interval/cancel helpers.
    expect(mod.fx).toBeTypeOf("object")
    expect(typeof mod.fx.delay).toBe("function")
  })

  test("wildcard-covered .ts files resolve (e.g., with-app)", async () => {
    const mod = await import("@silvery/create/with-app")
    expect(typeof mod.withApp).toBe("function")
  })
})
