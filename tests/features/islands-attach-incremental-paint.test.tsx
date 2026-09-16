/**
 * `@si/render/24649` — an island must paint on the FIRST frame rendered after
 * its guest handle attaches, whatever drove that frame.
 *
 * `guest.init()` resolves in a microtask, so `islandState.handle` flips from
 * null to a live handle BETWEEN frames. That flip changes what the island
 * paints (placeholder blanks → guest cells) while every dirty bit on the node
 * stays clean, and dirty bits are epoch-stamped: a frame driven by unrelated
 * state renders in that window, the fast path skips the island's whole branch
 * without visiting it, and the epoch advance expires any mark that lands
 * afterwards. The blanks painted before the attach then survive in the cloned
 * buffer for as long as nothing else dirties that branch — a permanently empty
 * island body on screen, and `incremental ≠ fresh` under `SILVERY_STRICT`
 * (`MISMATCH … incremental: char=" " fresh: char="h"`, renderIsland →
 * emitOpaqueBlit).
 *
 * The fix is `createIsland`'s `onAttach`: the binding subscribes and marks the
 * host node dirty inside the same statement that assigns the handle, so no
 * frame can be rendered between the two. This test walks a frame through every
 * microtask generation of the init chain, so whichever generation attaches the
 * handle, the very next frame is the one asserted on.
 *
 * Realistic-scale fixture per `pipeline/CLAUDE.md`: a 24-row transcript inside
 * an `overflow="scroll"` container (≈60 nodes), the shape that produced the
 * original report — expanding a completed shell-command row in ag-code.
 */

import React, { type ReactElement, type ReactNode } from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Island, ScopeProvider, Text } from "@silvery/ag-react"
import { createCellBuffer, snapshotGuest } from "@silvery/ag"
import { createScope } from "@silvery/scope"
import type { IslandGuest, IslandHandle } from "@silvery/ag/island-types"
import type { AgNode } from "@silvery/ag/types"

const BODY = "hello-from-the-guest"
const TRANSCRIPT_ROWS = 24
const ISLAND_ROW = 2
/** Generous enough to cover the factory's promise-adoption hops. */
const MAX_GENERATIONS = 16

function bodyGuest(): IslandGuest {
  const buffer = createCellBuffer(BODY.length, 1)
  for (let col = 0; col < BODY.length; col++) {
    buffer.setCell(col, 0, {
      char: BODY[col]!,
      fg: null,
      bg: null,
      attrs: {},
      wide: false,
      continuation: false,
    })
  }
  return snapshotGuest({ buffer })
}

/** A transcript whose header carries the unrelated state that drives frames. */
function Transcript({ tick, guest }: { tick: number; guest: IslandGuest }): ReactElement {
  return (
    <Box flexDirection="column" width={60} height={22}>
      <Text>session {tick}</Text>
      <Box overflow="scroll" height={18} flexDirection="column">
        {Array.from({ length: TRANSCRIPT_ROWS }).map((_, i) => (
          <Box key={i} flexDirection="column">
            <Text>row {i}</Text>
            {i === ISLAND_ROW ? <Island guest={guest} cols={BODY.length} rows={1} /> : null}
          </Box>
        ))}
      </Box>
      <Text>footer</Text>
    </Box>
  )
}

describe("Island — attach must not fall into the incremental skip window", () => {
  test("paints the guest's cells on the first frame after the handle attaches", async () => {
    const render = createRenderer({ cols: 60, rows: 22 })
    // One scope for every render call — re-allocating it would tear the
    // island's state down between frames (see islands-render.test.tsx).
    const scope = createScope("islands-attach-incremental-paint")
    const wrap = (children: ReactNode): ReactElement => (
      <ScopeProvider scope={scope}>{children}</ScopeProvider>
    )
    const guest = bodyGuest()

    const app = render(wrap(<Transcript tick={0} guest={guest} />))
    const islandHandle = (): IslandHandle | null => {
      const node = app.locator("silvery-island").resolve() as AgNode | null
      return node?.islandState?.handle ?? null
    }

    // Chrome is up and the island is still a placeholder.
    expect(app.text).toContain("row 0")
    expect(app.text).toContain("footer")
    expect(app.text).not.toContain(BODY)
    expect(islandHandle()).toBeNull()

    let attachedAtFrame = -1
    let frameAfterAttach = ""
    for (let tick = 1; tick <= MAX_GENERATIONS && attachedAtFrame < 0; tick++) {
      // Let exactly one generation of the init chain run…
      await Promise.resolve()
      // …then render a frame driven by state the island knows nothing about.
      app.rerender(wrap(<Transcript tick={tick} guest={guest} />))
      if (islandHandle() !== null) {
        attachedAtFrame = tick
        frameAfterAttach = app.text
      }
    }

    expect(
      attachedAtFrame,
      `the guest handle never attached within ${MAX_GENERATIONS} microtask generations — ` +
        "the fixture is broken, not the render phase",
    ).toBeGreaterThan(0)
    expect(
      frameAfterAttach,
      `frame #${attachedAtFrame} rendered an island whose handle was already attached, ` +
        `but blitted none of its cells:\n${frameAfterAttach}`,
    ).toContain(BODY)
    // The rest of the transcript still renders — the repaint is scoped to the
    // island, not bought with a full-tree repaint.
    expect(frameAfterAttach).toContain(`session ${attachedAtFrame}`)
    expect(frameAfterAttach).toContain("row 0")
    expect(frameAfterAttach).toContain("footer")
  })
})
