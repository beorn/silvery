import { describe, expect, test } from "vitest"
import {
  resolveActiveScrollWindow,
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
      const window = resolveActiveScrollWindow({
        startIndex,
        endIndex: 1271,
        previousStartIndex,
        activeScrollDirection: "up",
      })
      resolved.push(window.startIndex)
      previousStartIndex = window.startIndex
    }

    expect(resolved).toEqual([
      1218, 1217, 1216, 1215, 1214, 1213, 1212, 1212, 1210, 1209, 1208, 1208, 1207,
    ])
  })
})
