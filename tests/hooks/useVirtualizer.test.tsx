import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Text } from "@silvery/ag-react"
import { useVirtualizer } from "../../packages/ag-react/src/hooks/useVirtualizer"

describe("useVirtualizer", () => {
  test("can defer measurement version updates while still recording heights", () => {
    const controls: {
      measure?: (key: string | number, height: number, width?: number) => boolean
      measured?: ReadonlyMap<string, number>
    } = {}

    function Harness({ defer }: { defer: boolean }) {
      const virtualizer = useVirtualizer({
        count: 20,
        estimateHeight: 1,
        viewportHeight: 6,
        getItemKey: (index) => `row-${index}`,
        deferMeasurementUpdates: defer,
      })
      controls.measure = virtualizer.measureItem
      controls.measured = virtualizer.measuredHeights
      return <Text>version:{virtualizer.measurementVersion}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 4 })
    const app = render(<Harness defer />)
    expect(stripAnsi(app.text)).toContain("version:0")

    expect(controls.measure?.("row-0", 3, 40)).toBe(true)
    expect(controls.measured?.get("row-0:40")).toBe(3)

    render(<Harness defer />)
    expect(stripAnsi(app.text)).toContain("version:0")

    render(<Harness defer={false} />)
    expect(stripAnsi(app.text)).toContain("version:1")
  })
})
