/**
 * Popover stability under anchor re-renders and unrelated handler churn —
 * the "flapping popover" class.
 *
 * Real-world report (silvercode 2026-06-10): cmd-hovering the session label
 * in a chrome row that re-renders every second (live metrics) while the
 * transcript streams makes the popover open and close repeatedly.
 *
 * Three defects pinned here:
 *
 * 1. Dwell starvation — `scheduleShow` depended on the `content` object,
 *    which consumers rebuild every render; each parent render restarted the
 *    dwell timer, so a parent ticking faster than HOVER_SHOW_DELAY_MS meant
 *    the popover never opened.
 * 2. Unowned global hide — EVERY `usePopoverHandlers` instance's effects
 *    called `popover.hide()`; a new transcript leaf mounting (streaming!)
 *    closed the popover held by a different anchor, and the still-armed
 *    dwell reopened it: the visible flap.
 * 3. No in-place content refresh — once shown, fresh content from parent
 *    re-renders should update the popover without a hide/show cycle.
 *
 * Note: the root Box pins width/height (the `<Screen>` parity rule from
 * vendor/silvery/AGENTS.md) — without the pin the absolute overlay is
 * clipped by the content-sized root and these tests can't see it.
 */

import React, { useEffect, useState } from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, PopoverProvider, Text, usePopoverHandlers } from "@silvery/ag-react"

const COLS = 80
const ROWS = 14

const settle = (ms = 60) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function sampleVisibility(
  app: { readonly text: string },
  needle: string,
  durationMs: number,
  stepMs = 50,
): Promise<boolean[]> {
  const samples: boolean[] = []
  for (let elapsed = 0; elapsed < durationMs; elapsed += stepMs) {
    await settle(stepMs)
    samples.push(app.text.includes(needle))
  }
  return samples
}

function transitions(samples: readonly boolean[]): number {
  let count = 0
  for (let i = 1; i < samples.length; i++) {
    if (samples[i] !== samples[i - 1]) count++
  }
  return count
}

function flapMessage(samples: readonly boolean[]): string {
  return `popover flapped: visibility series ${samples.map((v) => (v ? "1" : "0")).join("")}`
}

/** Unrelated popover anchor — stands in for a streamed-in transcript leaf. */
function UnrelatedLeaf({ label }: { label: string }): React.ReactElement {
  const popover = usePopoverHandlers({ body: <Text>UNRELATED-POPOVER</Text>, maxWidth: 30 })
  return (
    <Box onMouseEnter={popover.onMouseEnter} onMouseLeave={popover.onMouseLeave}>
      <Text>{label}</Text>
    </Box>
  )
}

/**
 * Anchor whose parent re-renders on a timer, rebuilding the popover content
 * object every render — mirrors silvercode's SessionPaneControlBar (live
 * metrics re-render every second). With `streamLeaves`, each tick also
 * MOUNTS a new unrelated popover-handler row — mirrors transcript leaves
 * streaming in below the chrome.
 */
function TickingHoverTarget({
  tickMs,
  streamLeaves = false,
}: {
  tickMs: number
  streamLeaves?: boolean
}): React.ReactElement {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), tickMs)
    return () => clearInterval(timer)
  }, [tickMs])
  // Fresh content object EVERY render — the consumer-side reality.
  const popover = usePopoverHandlers({
    body: <Text>POPOVER-BODY {tick}</Text>,
    maxWidth: 40,
  })
  const leafCount = streamLeaves ? Math.min(tick, 6) : 0
  return (
    <Box width={COLS} height={ROWS} flexDirection="column">
      <Box flexDirection="row">
        <Text>x</Text>
        <Box onMouseEnter={popover.onMouseEnter} onMouseLeave={popover.onMouseLeave}>
          <Text>____session-label____</Text>
        </Box>
      </Box>
      {Array.from({ length: leafCount }, (_, i) => (
        <UnrelatedLeaf key={i} label={`leaf-${i}`} />
      ))}
      <Text>Other row</Text>
    </Box>
  )
}

describe("popover stays open across anchor re-renders", () => {
  test("parent ticking FASTER than the dwell still opens the popover (no dwell starvation)", async () => {
    const render = createRenderer({ cols: COLS, rows: ROWS, kittyMode: true, autoRender: true })
    const app = render(
      <PopoverProvider>
        <TickingHoverTarget tickMs={200} />
      </PopoverProvider>,
    )

    await app.keyDown("Super")
    await app.hover(10, 0)
    await settle(650)
    expect(app.text).toContain("POPOVER-BODY")
    await app.keyUp("Super")
  })

  test("ticking parent (fresh content object each render) does not flap the popover", async () => {
    const render = createRenderer({ cols: COLS, rows: ROWS, kittyMode: true, autoRender: true })
    const app = render(
      <PopoverProvider>
        <TickingHoverTarget tickMs={200} />
      </PopoverProvider>,
    )

    await app.keyDown("Super")
    await app.hover(10, 0)
    await settle(650)
    expect(app.text).toContain("POPOVER-BODY")

    const samples = await sampleVisibility(app, "POPOVER-BODY", 1200)
    expect(transitions(samples), flapMessage(samples)).toBe(0)
    expect(samples.every(Boolean)).toBe(true)
    // In-place content refresh: the body must carry a recent tick count,
    // not the content captured at show time.
    const match = /POPOVER-BODY (\d+)/.exec(app.text)
    expect(match, app.text).not.toBeNull()
    expect(Number(match![1])).toBeGreaterThanOrEqual(5)

    await app.keyUp("Super")
  })

  test("unrelated popover handlers mounting (streamed leaves) do not close an open popover", async () => {
    const render = createRenderer({ cols: COLS, rows: ROWS, kittyMode: true, autoRender: true })
    const app = render(
      <PopoverProvider>
        <TickingHoverTarget tickMs={200} streamLeaves />
      </PopoverProvider>,
    )

    await app.keyDown("Super")
    await app.hover(10, 0)
    await settle(650)
    expect(app.text).toContain("POPOVER-BODY")

    // New UnrelatedLeaf rows mount on each tick; their handler effects must
    // not hide a popover they don't own.
    const samples = await sampleVisibility(app, "POPOVER-BODY", 1200)
    expect(transitions(samples), flapMessage(samples)).toBe(0)
    expect(samples.every(Boolean)).toBe(true)

    await app.keyUp("Super")
  })

  test("leaving the anchor still closes the popover (owned hide applies to the owner)", async () => {
    const render = createRenderer({ cols: COLS, rows: ROWS, kittyMode: true, autoRender: true })
    const app = render(
      <PopoverProvider>
        <TickingHoverTarget tickMs={200} />
      </PopoverProvider>,
    )

    await app.keyDown("Super")
    await app.hover(10, 0)
    await settle(650)
    expect(app.text).toContain("POPOVER-BODY")

    // Move off the anchor (and off the popover) — must close after the
    // hide grace period.
    await app.hover(70, ROWS - 1)
    await settle(350)
    expect(app.text).not.toContain("POPOVER-BODY")

    await app.keyUp("Super")
  })
})
