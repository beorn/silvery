import { test, expect } from "vitest"

// Import the function to verify it's exported
test("reportDirectory is exported from hightea", async () => {
  const hightea = await import("../src/index.ts")
  expect(typeof hightea.reportDirectory).toBe("function")
})
