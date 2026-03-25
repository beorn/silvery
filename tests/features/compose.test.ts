/**
 * Tests for the plugin composition system — era2a Phase 5.
 *
 * Verifies create() + pipe() + withAg() + withTerm() work together.
 */

import { describe, test, expect } from "vitest"
import { create, pipe, withAg, withTerm } from "@silvery/ag-term/compose"
import { createTerm } from "@silvery/ag-term"

describe("plugin composition", () => {
  describe("create()", () => {
    test("creates a base app with dispatch/apply/defer/dispose", () => {
      const app = create()
      expect(typeof app.dispatch).toBe("function")
      expect(typeof app.apply).toBe("function")
      expect(typeof app.defer).toBe("function")
      expect(typeof app[Symbol.dispose]).toBe("function")
    })

    test("defer runs cleanups in reverse order", () => {
      const order: number[] = []
      const app = create()
      app.defer(() => order.push(1))
      app.defer(() => order.push(2))
      app.defer(() => order.push(3))
      app[Symbol.dispose]()
      expect(order).toEqual([3, 2, 1])
    })

    test("dispose is idempotent", () => {
      let count = 0
      const app = create()
      app.defer(() => count++)
      app[Symbol.dispose]()
      app[Symbol.dispose]()
      expect(count).toBe(1)
    })
  })

  describe("pipe()", () => {
    test("composes plugins left-to-right", () => {
      const app = pipe(
        { value: 1 },
        (a: any) => ({ ...a, doubled: a.value * 2 }),
        (a: any) => ({ ...a, tripled: a.value * 3 }),
      )
      expect(app.value).toBe(1)
      expect(app.doubled).toBe(2)
      expect(app.tripled).toBe(3)
    })
  })

  describe("withAg()", () => {
    test("adds ag to the app", () => {
      const app = pipe(create(), withAg())
      expect(app.ag).toBeDefined()
      expect(app.ag.root).toBeDefined()
      expect(typeof app.ag.layout).toBe("function")
      expect(typeof app.ag.render).toBe("function")
    })
  })

  describe("withTerm()", () => {
    test("adds term and render to the app", () => {
      const term = createTerm({ cols: 80, rows: 24 })
      const app = pipe(create(), withAg(), withTerm(term))
      expect(app.term).toBe(term)
      expect(typeof app.render).toBe("function")
    })

    test("headless term has run() (events generator blocks until dispose)", () => {
      const term = createTerm({ cols: 80, rows: 24 })
      const app = pipe(create(), withAg(), withTerm(term))
      // Headless term has events() (blocks until disposed), so run exists
      expect(typeof app.run).toBe("function")
    })
  })

  describe("full composition", () => {
    test("create + withAg + withTerm(headless) works end-to-end", () => {
      const term = createTerm({ cols: 40, rows: 10 })
      const app = pipe(create(), withAg(), withTerm(term))

      expect(app.ag).toBeDefined()
      expect(app.term).toBe(term)
      expect(typeof app.render).toBe("function")
      expect(typeof app.dispatch).toBe("function")
    })
  })
})
