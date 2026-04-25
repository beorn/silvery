/**
 * Regression: km-silvercode.cursor-startup-position
 *
 * The hardware-cursor symptom: at silvercode startup, no
 * `useCursor()` consumer has yet called `setCursorState`, so the
 * cursor store is null and the scheduler's first render emits
 * `CURSOR_HIDE` with no `moveCursor`. The hardware cursor stays
 * parked wherever the prior buffer paint ended (the side-panel
 * quota progress bar). The user sees an invisible-but-mispositioned
 * cursor until typing one key triggers another render that finally
 * emits the cursor positioning ANSI.
 *
 * Root cause: when `useCursor`'s `setCursorState` fires AFTER a render
 * frame has already painted (e.g. on the second commit of a parent
 * Box, when `NodeContext` propagates a non-null AgNode and the
 * useScrollRect callback finally has a rect to report), the scheduler
 * has no signal to re-render. The previous render's `CURSOR_HIDE`
 * stays as the last cursor visibility change.
 *
 * Fix: the scheduler subscribes to cursor-state changes via the
 * existing `cursorAccessors.subscribeCursor` accessor. When
 * `setCursorState` fires, the scheduler queues a render. The next
 * render reads the fresh cursor state and emits
 * `moveCursor + CURSOR_SHOW`. See scheduler.ts constructor.
 *
 * Run: bun vitest run tests/features/cursor-conditional-mount.test.tsx
 */
import { describe, expect, test, vi } from "vitest"
import { RenderScheduler } from "@silvery/ag-term/scheduler"
import { createCursorStore } from "@silvery/ag-react/hooks/useCursor"
import type { AgNode } from "@silvery/ag/types"

/** Minimal mock stdout (non-TTY — keeps cursor-suffix logic out of the way). */
function createMockStdout() {
  const chunks: string[] = []
  const mock = {
    columns: 40,
    rows: 10,
    isTTY: false,
    write(data: string) {
      chunks.push(data)
      return true
    },
    on() {
      return mock
    },
    off() {
      return mock
    },
  }
  return { stream: mock as unknown as NodeJS.WriteStream, chunks }
}

describe("scheduler subscribes to cursor changes (km-silvercode.cursor-startup-position)", () => {
  test("setCursorState() between render frames triggers a scheduleRender", async () => {
    // Construct a minimal scheduler with a real cursor store. We don't
    // run a render pipeline here — we just verify the scheduler wires
    // the subscription correctly. A scheduleRender call is observable
    // via stats.skippedCount (the second call inside the same microtask
    // is skipped) or by waiting for the scheduled microtask to fire and
    // checking renderCount, but doRender requires a valid root tree.
    //
    // The simplest assertion: after wiring, calling setCursorState must
    // increment a counter we control. We swap the scheduler's
    // `scheduleRender` for a spy after construction and trigger a
    // cursor change to verify the subscription is live.
    const stdout = createMockStdout()
    const cursorStore = createCursorStore()

    const scheduler = new RenderScheduler({
      stdout: stdout.stream,
      // Empty root — we never call scheduleRender's microtask payload here.
      root: { type: "silvery-box", children: [], props: {} } as unknown as AgNode,
      cursorAccessors: cursorStore.accessors,
    })

    try {
      // Spy on scheduleRender. The constructor already wired the
      // subscription via `subscribeCursor` BEFORE this spy was
      // installed, so the spy intercepts the same listener fn that
      // was registered (it's a closure inside the constructor that
      // calls `this.scheduleRender()`).
      const scheduleSpy = vi.spyOn(scheduler, "scheduleRender")

      // Bug shape: setCursorState fires AFTER a render frame has
      // already painted. Without a subscription, the scheduler has
      // no reason to re-render and the new cursor state never
      // reaches the terminal. With the fix, this call MUST trigger a
      // scheduleRender.
      cursorStore.setCursorState({ x: 4, y: 0, visible: true })

      expect(scheduleSpy).toHaveBeenCalled()

      // A second cursor update (e.g. typing moves the cursor) must
      // also trigger a re-render — the subscription doesn't auto-
      // unsubscribe on first call.
      scheduleSpy.mockClear()
      cursorStore.setCursorState({ x: 5, y: 0, visible: true })
      expect(scheduleSpy).toHaveBeenCalled()

      // Hiding the cursor (visible→null) is also a state change
      // that must re-render — otherwise an unmounting useCursor
      // leaves a stale CURSOR_SHOW on screen.
      scheduleSpy.mockClear()
      cursorStore.setCursorState(null)
      expect(scheduleSpy).toHaveBeenCalled()
    } finally {
      scheduler.dispose()
    }
  })

  test("scheduler.dispose() unsubscribes from cursor changes", () => {
    const stdout = createMockStdout()
    const cursorStore = createCursorStore()

    const scheduler = new RenderScheduler({
      stdout: stdout.stream,
      root: { type: "silvery-box", children: [], props: {} } as unknown as AgNode,
      cursorAccessors: cursorStore.accessors,
    })

    const scheduleSpy = vi.spyOn(scheduler, "scheduleRender")
    // Sanity: subscription is live before dispose.
    cursorStore.setCursorState({ x: 1, y: 0, visible: true })
    expect(scheduleSpy).toHaveBeenCalled()

    // After dispose: the subscription must be torn down so a stale
    // cursor change doesn't keep the scheduler from being garbage
    // collected.
    scheduler.dispose()
    scheduleSpy.mockClear()
    cursorStore.setCursorState({ x: 2, y: 0, visible: true })
    expect(scheduleSpy).not.toHaveBeenCalled()
  })

  test("scheduler without cursorAccessors falls back to global cursor (no subscription)", () => {
    // Back-compat: scheduler must continue to work when no
    // cursorAccessors are provided (legacy embedders before the
    // per-instance store landed). dispose() must not throw on a
    // null cursorCleanup.
    const stdout = createMockStdout()
    const scheduler = new RenderScheduler({
      stdout: stdout.stream,
      root: { type: "silvery-box", children: [], props: {} } as unknown as AgNode,
      // No cursorAccessors — exercises the global fallback path.
    })
    // Just constructing + disposing must not throw.
    expect(() => scheduler.dispose()).not.toThrow()
  })
})
