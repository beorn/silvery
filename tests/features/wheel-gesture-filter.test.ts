import { describe, expect, test } from "vitest"
import { createWheelGestureFilter } from "../../packages/ag-react/src/ui/input/wheel-gesture-filter"

const deltas = (samples: Array<{ deltaY: number }>): number[] =>
  samples.map((sample) => sample.deltaY)

describe("WheelGestureFilter", () => {
  test("drops a lone opposite sample during a sustained stream", () => {
    const filter = createWheelGestureFilter()

    for (let i = 0; i < 5; i++) {
      expect(deltas(filter.process({ t: i * 16, deltaY: 1 }))).toEqual([1])
    }

    expect(deltas(filter.process({ t: 100, deltaY: -1 }))).toEqual([])
    expect(deltas(filter.process({ t: 116, deltaY: 1 }))).toEqual([1])
  })

  test("confirms reversal after two consecutive opposite samples", () => {
    const filter = createWheelGestureFilter()

    for (let i = 0; i < 5; i++) filter.process({ t: i * 16, deltaY: 1 })

    expect(deltas(filter.process({ t: 100, deltaY: -1 }))).toEqual([])
    expect(deltas(filter.process({ t: 116, deltaY: -1 }))).toEqual([-1, -1])
  })

  test("release drops an unresolved pending opposite sample", () => {
    const filter = createWheelGestureFilter()

    for (let i = 0; i < 5; i++) filter.process({ t: i * 16, deltaY: 1 })
    expect(deltas(filter.process({ t: 100, deltaY: -1 }))).toEqual([])

    filter.release()

    expect(deltas(filter.process({ t: 220, deltaY: 1 }))).toEqual([1])
  })

  test("idle-spaced alternating tail cannot seed visible back-and-forth", () => {
    const filter = createWheelGestureFilter()
    let position = 0
    const positions: number[] = []

    for (let i = 0; i < 10; i++) {
      for (const sample of filter.process({ t: i * 16, deltaY: -1 })) {
        position += Math.sign(sample.deltaY)
      }
    }

    for (const [i, deltaY] of [1, -1, 1, -1].entries()) {
      for (const sample of filter.process({ t: 400 + i * 220, deltaY })) {
        position += Math.sign(sample.deltaY)
      }
      positions.push(position)
    }

    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeLessThanOrEqual(positions[i - 1]!)
    }
  })

  test("context expiry lets a separate reverse gesture start immediately", () => {
    const filter = createWheelGestureFilter({ contextExpiryMs: 500 })

    expect(deltas(filter.process({ t: 0, deltaY: 1 }))).toEqual([1])
    expect(deltas(filter.process({ t: 600, deltaY: -1 }))).toEqual([-1])
  })
})
