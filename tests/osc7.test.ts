import { test, expect } from "vitest"

// Import the function to verify it's exported
test("reportDirectory is exported from inkx", async () => {
  const inkx = await import("../src/index.ts")
  expect(typeof inkx.reportDirectory).toBe("function")
})
