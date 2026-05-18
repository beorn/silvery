import { describe, expect, test } from "vitest"
import {
  detectGestureRenderScrollViolation,
  resolveGestureScrollWindow,
  resolveListViewBoxScrollTo,
  resolveListViewRenderScrollRow,
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

  test("detects render scroll moving opposite an upward wheel gesture", () => {
    expect(
      detectGestureRenderScrollViolation({
        gestureDirection: "up",
        previousRenderScrollRow: 4,
        renderScrollRow: 8,
      }),
    ).toMatchObject({
      gestureDirection: "up",
      previousRenderScrollRow: 4,
      renderScrollRow: 8,
      deltaRows: 4,
    })
  })

  test("allows render scroll to move with an upward wheel gesture", () => {
    expect(
      detectGestureRenderScrollViolation({
        gestureDirection: "up",
        previousRenderScrollRow: 4,
        renderScrollRow: 2,
      }),
    ).toBeNull()
  })

  test("detects render scroll moving opposite a downward wheel gesture", () => {
    expect(
      detectGestureRenderScrollViolation({
        gestureDirection: "down",
        previousRenderScrollRow: 8,
        renderScrollRow: 4,
      }),
    ).toMatchObject({
      gestureDirection: "down",
      previousRenderScrollRow: 8,
      renderScrollRow: 4,
      deltaRows: -4,
    })
  })

  test("allows tiny render-scroll rounding drift during a wheel gesture", () => {
    expect(
      detectGestureRenderScrollViolation({
        gestureDirection: "up",
        previousRenderScrollRow: 4,
        renderScrollRow: 4.005,
        toleranceRows: 0.01,
      }),
    ).toBeNull()
  })

  test("ignores incomplete render-scroll samples", () => {
    expect(
      detectGestureRenderScrollViolation({
        gestureDirection: null,
        previousRenderScrollRow: 4,
        renderScrollRow: 8,
      }),
    ).toBeNull()
    expect(
      detectGestureRenderScrollViolation({
        gestureDirection: "up",
        previousRenderScrollRow: Number.NaN,
        renderScrollRow: 8,
      }),
    ).toBeNull()
  })
})
