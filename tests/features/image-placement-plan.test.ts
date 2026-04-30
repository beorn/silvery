import { describe, expect, test } from "vitest"
import {
  computeVisibleImagePlacement,
  planKittyImagePlacement,
  withCursorPreserved,
} from "../../packages/ag-react/src/ui/image/image-placement"

describe("Image placement planning", () => {
  test("keeps a fully visible placement unchanged", () => {
    expect(
      computeVisibleImagePlacement({
        rect: { x: 4, y: 2, width: 10, height: 5 },
        imagePixels: { width: 100, height: 50 },
      }),
    ).toEqual({ x: 4, y: 2, width: 10, height: 5 })
  })

  test("clips the top of a partially scrolled image instead of deleting it", () => {
    expect(
      computeVisibleImagePlacement({
        rect: { x: 0, y: -2, width: 10, height: 5 },
        imagePixels: { width: 100, height: 50 },
      }),
    ).toEqual({
      x: 0,
      y: 0,
      width: 10,
      height: 3,
      sourceRect: { x: 0, y: 20, width: 100, height: 30 },
    })
  })

  test("clips the left edge using the same source coordinate system", () => {
    expect(
      computeVisibleImagePlacement({
        rect: { x: -3, y: 1, width: 10, height: 5 },
        imagePixels: { width: 100, height: 50 },
      }),
    ).toEqual({
      x: 0,
      y: 1,
      width: 7,
      height: 5,
      sourceRect: { x: 30, y: 0, width: 70, height: 50 },
    })
  })

  test("clips the right and bottom edges to the viewport", () => {
    expect(
      computeVisibleImagePlacement({
        rect: { x: 8, y: 3, width: 5, height: 4 },
        imagePixels: { width: 100, height: 80 },
        viewport: { width: 10, height: 5 },
      }),
    ).toEqual({
      x: 8,
      y: 3,
      width: 2,
      height: 2,
      sourceRect: { x: 0, y: 0, width: 40, height: 40 },
    })
  })

  test("returns null when the whole placement is below or right of the viewport", () => {
    expect(
      computeVisibleImagePlacement({
        rect: { x: 10, y: 0, width: 5, height: 4 },
        imagePixels: { width: 100, height: 80 },
        viewport: { width: 10, height: 5 },
      }),
    ).toBeNull()

    expect(
      computeVisibleImagePlacement({
        rect: { x: 0, y: 5, width: 5, height: 4 },
        imagePixels: { width: 100, height: 80 },
        viewport: { width: 10, height: 5 },
      }),
    ).toBeNull()
  })

  test("returns null only when the whole placement is above or left of the viewport", () => {
    expect(
      computeVisibleImagePlacement({
        rect: { x: 0, y: -5, width: 10, height: 5 },
        imagePixels: { width: 100, height: 50 },
      }),
    ).toBeNull()

    expect(
      computeVisibleImagePlacement({
        rect: { x: -10, y: 0, width: 10, height: 5 },
        imagePixels: { width: 100, height: 50 },
      }),
    ).toBeNull()
  })

  test("preserves caller-provided source crop while clipping", () => {
    expect(
      computeVisibleImagePlacement({
        rect: { x: 0, y: -1, width: 4, height: 4 },
        imagePixels: { width: 100, height: 100 },
        sourceRect: { x: 10, y: 20, width: 40, height: 80 },
      }),
    ).toEqual({
      x: 0,
      y: 0,
      width: 4,
      height: 3,
      sourceRect: { x: 10, y: 40, width: 40, height: 60 },
    })
  })

  test("wraps protocol writes without leaving the cursor at the image position", () => {
    expect(withCursorPreserved("\x1b[2;3Hpayload")).toBe(
      "\x1b[?25l\x1b7\x1b[2;3Hpayload\x1b8\x1b[?25h",
    )
  })

  test("plans partial top clipping as a visible re-place with source crop", () => {
    expect(
      planKittyImagePlacement({
        rect: { x: 0, y: -2, width: 10, height: 5 },
        imagePixels: { width: 100, height: 50 },
        previousPlacement: null,
        srcChanged: false,
      }),
    ).toEqual({
      kind: "place",
      placement: {
        x: 0,
        y: 0,
        width: 10,
        height: 3,
        sourceRect: { x: 0, y: 20, width: 100, height: 30 },
      },
      placementKey: JSON.stringify({
        placementId: undefined,
        zIndex: undefined,
        pixelOffset: undefined,
        sourceRect: { x: 0, y: 20, width: 100, height: 30 },
        virtualPlacement: undefined,
      }),
      transmit: false,
      deleteImageBeforeTransmit: false,
    })
  })

  test("plans deletion when a previously placed image scrolls fully offscreen", () => {
    expect(
      planKittyImagePlacement({
        rect: { x: 0, y: -5, width: 10, height: 5 },
        imagePixels: { width: 100, height: 50 },
        previousPlacement: {
          x: 0,
          y: -4,
          width: 10,
          height: 1,
          placementKey: "old",
        },
        srcChanged: false,
      }),
    ).toEqual({ kind: "delete-placement" })
  })

  test("plans deletion when a previously placed image moves below the viewport", () => {
    expect(
      planKittyImagePlacement({
        rect: { x: 0, y: 10, width: 10, height: 5 },
        imagePixels: { width: 100, height: 50 },
        viewport: { width: 80, height: 10 },
        previousPlacement: {
          x: 0,
          y: 8,
          width: 10,
          height: 2,
          placementKey: "old",
        },
        srcChanged: false,
      }),
    ).toEqual({ kind: "delete-placement" })
  })

  test("plans no-op when the visible placement is unchanged and source is unchanged", () => {
    const placementKey = JSON.stringify({
      placementId: 2,
      zIndex: 1,
      pixelOffset: undefined,
      sourceRect: undefined,
      virtualPlacement: undefined,
    })
    expect(
      planKittyImagePlacement({
        rect: { x: 3, y: 4, width: 10, height: 5 },
        imagePixels: { width: 100, height: 50 },
        placementId: 2,
        zIndex: 1,
        previousPlacement: { x: 3, y: 4, width: 10, height: 5, placementKey },
        srcChanged: false,
      }),
    ).toEqual({ kind: "noop" })
  })

  test("plans retransmit before place when the source changed", () => {
    expect(
      planKittyImagePlacement({
        rect: { x: 3, y: 4, width: 10, height: 5 },
        imagePixels: { width: 100, height: 50 },
        previousPlacement: { x: 3, y: 4, width: 10, height: 5, placementKey: "old" },
        srcChanged: true,
      }),
    ).toMatchObject({
      kind: "place",
      transmit: true,
      deleteImageBeforeTransmit: true,
      placement: { x: 3, y: 4, width: 10, height: 5 },
    })
  })
})
