import { describe, expect, test } from "vitest"

import { createIsland as createIslandSubpath } from "@silvery/ag/island"
import {
  sandbox as sandboxSubpath,
  snapshotGuest as snapshotGuestSubpath,
} from "@silvery/ag/island-guests"
import {
  createCellBuffer as createCellBufferAg,
  createIsland as createIslandAg,
  sandbox as sandboxAg,
  snapshotGuest as snapshotGuestAg,
} from "@silvery/ag"
import {
  Island as IslandFromAgReact,
  createCellBuffer as createCellBufferAgReact,
  createIsland as createIslandAgReact,
  sandbox as sandboxAgReact,
  snapshotGuest as snapshotGuestAgReact,
} from "@silvery/ag-react"
import { Island, createCellBuffer, createIsland, sandbox, snapshotGuest } from "silvery"

describe("Islands public surface", () => {
  test("@silvery/ag root re-exports shipped Island primitives", () => {
    expect(createIslandAg).toBe(createIslandSubpath)
    expect(snapshotGuestAg).toBe(snapshotGuestSubpath)
    expect(sandboxAg).toBe(sandboxSubpath)
  })

  test("app-facing silvery imports match the documented Island guide", () => {
    expect(Island).toBe(IslandFromAgReact)
    expect(createIsland).toBe(createIslandSubpath)
    expect(createIslandAgReact).toBe(createIslandSubpath)
    expect(snapshotGuest).toBe(snapshotGuestSubpath)
    expect(snapshotGuestAgReact).toBe(snapshotGuestSubpath)
    expect(sandbox).toBe(sandboxSubpath)
    expect(sandboxAgReact).toBe(sandboxSubpath)
    expect(createCellBuffer).toBe(createCellBufferAg)
    expect(createCellBufferAgReact).toBe(createCellBufferAg)
  })
})
