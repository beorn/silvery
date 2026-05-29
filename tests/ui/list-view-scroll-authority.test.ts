import { describe, expect, test } from "vitest"
import {
  resolveGestureScrollWindow,
  resolveListViewBoxScrollTo,
  resolveListViewRenderScrollRow,
  resolveListViewViewportFrame,
} from "../../packages/ag-react/src/ui/components/list-view/scroll-authority"

describe("ListView scroll authority", () => {
  test("row-space wheel scroll renders from scrollRow before anchoring", () => {
    const resolved = resolveListViewRenderScrollRow({
      declarativeScrollRow: null,
      followPinnedTopRow: null,
      scrollRow: 120,
      followDisengageTopRow: null,
      maintainedTopRow: 126,
    })

    expect(resolved).toEqual({
      row: 120,
      authority: "wheel-row",
    })
  })

  test("declarative row-space scroll keeps Box child identity for hidden-count math", () => {
    const resolved = resolveListViewRenderScrollRow({
      declarativeScrollRow: 42,
      followPinnedTopRow: null,
      scrollRow: null,
      followDisengageTopRow: null,
      maintainedTopRow: null,
    })

    expect(resolved).toEqual({
      row: 42,
      authority: "declarative-row",
    })
    expect(
      resolveListViewBoxScrollTo({
        scrollAuthority: resolved.authority,
        selectedBoxScrollTo: 7,
      }),
    ).toBe(7)
  })

  test("suppresses Box scrollTo while wheel row-space owns the viewport", () => {
    expect(
      resolveListViewBoxScrollTo({
        scrollAuthority: "wheel-row",
        selectedBoxScrollTo: 7,
      }),
    ).toBeUndefined()
  })

  test("falls back to Box scrollTo when layout owns the viewport", () => {
    expect(
      resolveListViewBoxScrollTo({
        scrollAuthority: "layout",
        selectedBoxScrollTo: 7,
      }),
    ).toBe(7)
  })

  test("commits exactly one viewport writer for every authority combination", () => {
    const candidates = [null, 0, 7]

    for (const declarativeScrollRow of candidates) {
      for (const followPinnedTopRow of candidates) {
        for (const scrollRow of candidates) {
          for (const followDisengageTopRow of candidates) {
            for (const maintainedTopRow of candidates) {
              const frame = resolveListViewViewportFrame({
                declarativeScrollRow,
                followPinnedTopRow,
                scrollRow,
                followDisengageTopRow,
                maintainedTopRow,
              })
              const committed = frame.candidates.filter((candidate) => candidate.committed)
              const active = frame.candidates.filter((candidate) => candidate.active)

              expect(committed).toHaveLength(1)
              expect(committed[0]).toMatchObject({
                authority: frame.authority,
                row: frame.row,
              })
              expect(frame.suppressedWriters).toEqual(
                active.filter((candidate) => !candidate.committed),
              )
              expect(frame.suppressedWriters).not.toContainEqual(committed[0])
            }
          }
        }
      }
    }
  })

  test("active upward flick keeps virtual window start monotonic", () => {
    const latestLogStarts = [
      1218, 1217, 1216, 1215, 1214, 1213, 1212, 1212, 1210, 1209, 1208, 1210, 1207,
    ]
    const resolved: number[] = []
    let previousStartIndex = latestLogStarts[0]!

    for (const startIndex of latestLogStarts) {
      const window = resolveGestureScrollWindow({
        startIndex,
        endIndex: 1271,
        previousStartIndex,
        gestureDirection: "up",
      })
      resolved.push(window.startIndex)
      previousStartIndex = window.startIndex
    }

    expect(resolved).toEqual([
      1218, 1217, 1216, 1215, 1214, 1213, 1212, 1212, 1210, 1209, 1208, 1208, 1207,
    ])
  })

  // detectGestureRenderScrollViolation tests removed in 15332 Wave 2 —
  // the detect-only logger was deleted (silvery 659f7ef00) along with the
  // ListView consumer block. The render-scroll-violation invariant is no
  // longer enforced at runtime; if the invariant returns, re-add the
  // detector + tests together.
})
