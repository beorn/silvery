/**
 * `actionFill` on the public barrel: an app outside the monorepo reaches the
 * action-fill recipes through `silvery`, so a chip is the recipe's fill, not
 * a token pair the app spells by hand.
 */

import { describe, test, expect } from "vitest"
import { actionFill } from "silvery"

describe("actionFill from the silvery barrel", () => {
  test("a filled warning chip rests on $warning with $bg text", () => {
    expect(actionFill("warning", "filled").idle).toEqual({
      color: "$bg",
      backgroundColor: "$warning",
    })
  })
})
