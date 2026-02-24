/**
 * Tests for Layout Engine Abstraction Layer (layout-engine.ts)
 *
 * Tests the global engine management functions: setLayoutEngine, getLayoutEngine,
 * isLayoutEngineInitialized, getConstants, and ensureDefaultLayoutEngine.
 * Also tests the LayoutNode interface contract and engine API surface.
 *
 * Note: The adapter-level tests (Yoga vs Flexx, interchangeability) live in
 * layout-engines.test.ts. These tests focus on the abstraction layer itself.
 */

import { beforeEach, describe, expect, it } from "vitest"
import { createFlexxZeroEngine } from "../src/adapters/flexx-zero-adapter.js"
import { initYogaEngine } from "../src/adapters/yoga-adapter.js"
import {
  type LayoutEngine,
  type LayoutNode,
  ensureDefaultLayoutEngine,
  getConstants,
  getLayoutEngine,
  isLayoutEngineInitialized,
  setLayoutEngine,
} from "../src/layout-engine.js"

// =============================================================================
// Tests: Global Engine Management
// =============================================================================

describe("Layout Engine Abstraction", () => {
  describe("setLayoutEngine / getLayoutEngine", () => {
    it("sets and retrieves the flexx engine", () => {
      const engine = createFlexxZeroEngine()
      setLayoutEngine(engine)

      expect(getLayoutEngine()).toBe(engine)
    })

    it("sets and retrieves the yoga engine", async () => {
      const engine = await initYogaEngine()
      setLayoutEngine(engine)

      expect(getLayoutEngine()).toBe(engine)
    })

    it("swapping engines changes what getLayoutEngine returns", async () => {
      const flexx = createFlexxZeroEngine()
      const yoga = await initYogaEngine()

      setLayoutEngine(flexx)
      expect(getLayoutEngine().name).toBe("flexx-zero")

      setLayoutEngine(yoga)
      expect(getLayoutEngine().name).toBe("yoga")

      setLayoutEngine(flexx)
      expect(getLayoutEngine().name).toBe("flexx-zero")
    })
  })

  describe("isLayoutEngineInitialized", () => {
    it("returns true after setLayoutEngine", () => {
      setLayoutEngine(createFlexxZeroEngine())
      expect(isLayoutEngineInitialized()).toBe(true)
    })

    // Note: We cannot test the false case in isolation because module state
    // persists and the test runner's setup may have already initialized it.
    // The false→true transition is tested implicitly by ensureDefaultLayoutEngine.
  })

  describe("getConstants", () => {
    it("returns constants from current engine", () => {
      const engine = createFlexxZeroEngine()
      setLayoutEngine(engine)

      const constants = getConstants()
      expect(constants).toBe(engine.constants)
    })

    it("has all required flex direction constants", () => {
      setLayoutEngine(createFlexxZeroEngine())
      const c = getConstants()

      expect(c.FLEX_DIRECTION_ROW).toBeDefined()
      expect(c.FLEX_DIRECTION_COLUMN).toBeDefined()
      expect(c.FLEX_DIRECTION_ROW_REVERSE).toBeDefined()
      expect(c.FLEX_DIRECTION_COLUMN_REVERSE).toBeDefined()
    })

    it("has all required alignment constants", () => {
      setLayoutEngine(createFlexxZeroEngine())
      const c = getConstants()

      expect(c.ALIGN_AUTO).toBeDefined()
      expect(c.ALIGN_FLEX_START).toBeDefined()
      expect(c.ALIGN_CENTER).toBeDefined()
      expect(c.ALIGN_FLEX_END).toBeDefined()
      expect(c.ALIGN_STRETCH).toBeDefined()
      expect(c.ALIGN_BASELINE).toBeDefined()
      expect(c.ALIGN_SPACE_BETWEEN).toBeDefined()
      expect(c.ALIGN_SPACE_AROUND).toBeDefined()
    })

    it("has all required justify constants", () => {
      setLayoutEngine(createFlexxZeroEngine())
      const c = getConstants()

      expect(c.JUSTIFY_FLEX_START).toBeDefined()
      expect(c.JUSTIFY_CENTER).toBeDefined()
      expect(c.JUSTIFY_FLEX_END).toBeDefined()
      expect(c.JUSTIFY_SPACE_BETWEEN).toBeDefined()
      expect(c.JUSTIFY_SPACE_AROUND).toBeDefined()
      expect(c.JUSTIFY_SPACE_EVENLY).toBeDefined()
    })

    it("has all required edge constants", () => {
      setLayoutEngine(createFlexxZeroEngine())
      const c = getConstants()

      expect(c.EDGE_LEFT).toBeDefined()
      expect(c.EDGE_TOP).toBeDefined()
      expect(c.EDGE_RIGHT).toBeDefined()
      expect(c.EDGE_BOTTOM).toBeDefined()
      expect(c.EDGE_HORIZONTAL).toBeDefined()
      expect(c.EDGE_VERTICAL).toBeDefined()
      expect(c.EDGE_ALL).toBeDefined()
    })

    it("has display, position, overflow, direction constants", () => {
      setLayoutEngine(createFlexxZeroEngine())
      const c = getConstants()

      expect(c.DISPLAY_FLEX).toBeDefined()
      expect(c.DISPLAY_NONE).toBeDefined()
      expect(c.POSITION_TYPE_RELATIVE).toBeDefined()
      expect(c.POSITION_TYPE_ABSOLUTE).toBeDefined()
      expect(c.OVERFLOW_VISIBLE).toBeDefined()
      expect(c.OVERFLOW_HIDDEN).toBeDefined()
      expect(c.OVERFLOW_SCROLL).toBeDefined()
      expect(c.DIRECTION_LTR).toBeDefined()
    })

    it("has measure mode constants", () => {
      setLayoutEngine(createFlexxZeroEngine())
      const c = getConstants()

      expect(c.MEASURE_MODE_UNDEFINED).toBeDefined()
      expect(c.MEASURE_MODE_EXACTLY).toBeDefined()
      expect(c.MEASURE_MODE_AT_MOST).toBeDefined()
    })

    it("constants are the same object on repeated calls", () => {
      const engine = createFlexxZeroEngine()
      setLayoutEngine(engine)

      const c1 = getConstants()
      const c2 = getConstants()
      expect(c1).toBe(c2)
    })
  })

  // ===========================================================================
  // Tests: ensureDefaultLayoutEngine
  // ===========================================================================

  describe("ensureDefaultLayoutEngine", () => {
    it("does not overwrite an already-initialized engine", async () => {
      const engine = createFlexxZeroEngine()
      setLayoutEngine(engine)

      await ensureDefaultLayoutEngine("yoga")

      // Should still be the flexx engine we set — yoga should NOT have been loaded
      expect(getLayoutEngine()).toBe(engine)
    })

    it("preserves existing engine regardless of argument", async () => {
      const yoga = await initYogaEngine()
      setLayoutEngine(yoga)

      await ensureDefaultLayoutEngine("flexx")

      // Should still be yoga
      expect(getLayoutEngine().name).toBe("yoga")
    })
  })

  // ===========================================================================
  // Tests: Engine API Contract
  // ===========================================================================

  describe("LayoutEngine API contract", () => {
    const engines: Array<{ label: string; getEngine: () => Promise<LayoutEngine> }> = [
      { label: "flexx", getEngine: async () => createFlexxZeroEngine() },
      { label: "yoga", getEngine: async () => await initYogaEngine() },
    ]

    for (const { label, getEngine } of engines) {
      describe(`${label} engine`, () => {
        let engine: LayoutEngine

        beforeEach(async () => {
          engine = await getEngine()
          setLayoutEngine(engine)
        })

        it("has a name property", () => {
          expect(typeof engine.name).toBe("string")
          expect(engine.name.length).toBeGreaterThan(0)
        })

        it("has a constants property", () => {
          expect(engine.constants).toBeDefined()
          expect(typeof engine.constants).toBe("object")
        })

        it("createNode returns a LayoutNode", () => {
          const node = engine.createNode()
          expect(node).toBeDefined()
          expect(typeof node.setWidth).toBe("function")
          expect(typeof node.setHeight).toBe("function")
          expect(typeof node.calculateLayout).toBe("function")
          expect(typeof node.getComputedWidth).toBe("function")
          expect(typeof node.getComputedHeight).toBe("function")
          expect(typeof node.getComputedLeft).toBe("function")
          expect(typeof node.getComputedTop).toBe("function")
          node.free()
        })

        it("node supports tree operations", () => {
          const parent = engine.createNode()
          const child = engine.createNode()

          // insertChild should not throw
          parent.insertChild(child, 0)

          // removeChild should not throw
          parent.removeChild(child)

          parent.free()
          child.free()
        })

        it("node supports measure function", () => {
          const node = engine.createNode()

          // setMeasureFunc should not throw
          node.setMeasureFunc((_w, _wm, _h, _hm) => ({
            width: 10,
            height: 1,
          }))

          node.free()
        })

        it("node supports dimension setters", () => {
          const node = engine.createNode()

          // All dimension setters should not throw
          node.setWidth(100)
          node.setWidthPercent(50)
          node.setWidthAuto()
          node.setHeight(50)
          node.setHeightPercent(25)
          node.setHeightAuto()
          node.setMinWidth(10)
          node.setMinWidthPercent(5)
          node.setMinHeight(5)
          node.setMinHeightPercent(2)
          node.setMaxWidth(200)
          node.setMaxWidthPercent(100)
          node.setMaxHeight(100)
          node.setMaxHeightPercent(100)

          node.free()
        })

        it("node supports flex properties", () => {
          const node = engine.createNode()
          const c = engine.constants

          node.setFlexGrow(1)
          node.setFlexShrink(0)
          node.setFlexBasis(50)
          node.setFlexBasisPercent(25)
          node.setFlexBasisAuto()
          node.setFlexDirection(c.FLEX_DIRECTION_ROW)
          node.setFlexWrap(c.WRAP_WRAP)

          node.free()
        })

        it("node supports alignment properties", () => {
          const node = engine.createNode()
          const c = engine.constants

          node.setAlignItems(c.ALIGN_CENTER)
          node.setAlignSelf(c.ALIGN_FLEX_START)
          node.setAlignContent(c.ALIGN_STRETCH)
          node.setJustifyContent(c.JUSTIFY_CENTER)

          node.free()
        })

        it("node supports spacing properties", () => {
          const node = engine.createNode()
          const c = engine.constants

          node.setPadding(c.EDGE_ALL, 10)
          node.setMargin(c.EDGE_TOP, 5)
          node.setBorder(c.EDGE_LEFT, 1)
          node.setGap(c.GUTTER_ALL, 4)

          node.free()
        })

        it("node supports display and position properties", () => {
          const node = engine.createNode()
          const c = engine.constants

          node.setDisplay(c.DISPLAY_FLEX)
          node.setPositionType(c.POSITION_TYPE_RELATIVE)
          node.setOverflow(c.OVERFLOW_HIDDEN)

          node.free()
        })

        it("node supports markDirty", () => {
          const node = engine.createNode()

          // Need a measure func for markDirty to be meaningful
          node.setMeasureFunc(() => ({ width: 10, height: 1 }))
          node.markDirty()

          node.free()
        })

        it("computes layout for a simple tree", () => {
          const c = engine.constants
          const root = engine.createNode()
          root.setWidth(80)
          root.setHeight(24)
          root.setFlexDirection(c.FLEX_DIRECTION_COLUMN)

          const header = engine.createNode()
          header.setHeight(3)

          const body = engine.createNode()
          body.setFlexGrow(1)

          const footer = engine.createNode()
          footer.setHeight(1)

          root.insertChild(header, 0)
          root.insertChild(body, 1)
          root.insertChild(footer, 2)

          root.calculateLayout(80, 24, c.DIRECTION_LTR)

          // Header: top 3 rows
          expect(header.getComputedTop()).toBe(0)
          expect(header.getComputedHeight()).toBe(3)
          expect(header.getComputedWidth()).toBe(80)

          // Body: fills remaining space (24 - 3 - 1 = 20)
          expect(body.getComputedTop()).toBe(3)
          expect(body.getComputedHeight()).toBe(20)

          // Footer: last row
          expect(footer.getComputedTop()).toBe(23)
          expect(footer.getComputedHeight()).toBe(1)

          root.free()
        })

        it("computes row layout", () => {
          const c = engine.constants
          const root = engine.createNode()
          root.setWidth(100)
          root.setHeight(10)
          root.setFlexDirection(c.FLEX_DIRECTION_ROW)

          const col1 = engine.createNode()
          col1.setWidth(30)

          const col2 = engine.createNode()
          col2.setFlexGrow(1)

          const col3 = engine.createNode()
          col3.setWidth(20)

          root.insertChild(col1, 0)
          root.insertChild(col2, 1)
          root.insertChild(col3, 2)

          root.calculateLayout(100, 10, c.DIRECTION_LTR)

          expect(col1.getComputedLeft()).toBe(0)
          expect(col1.getComputedWidth()).toBe(30)

          expect(col2.getComputedLeft()).toBe(30)
          expect(col2.getComputedWidth()).toBe(50) // 100 - 30 - 20

          expect(col3.getComputedLeft()).toBe(80)
          expect(col3.getComputedWidth()).toBe(20)

          root.free()
        })

        it("applies padding correctly in layout", () => {
          const c = engine.constants
          const root = engine.createNode()
          root.setWidth(100)
          root.setHeight(50)
          root.setPadding(c.EDGE_LEFT, 5)
          root.setPadding(c.EDGE_TOP, 3)
          root.setPadding(c.EDGE_RIGHT, 5)
          root.setPadding(c.EDGE_BOTTOM, 3)

          const child = engine.createNode()
          child.setFlexGrow(1)

          root.insertChild(child, 0)
          root.calculateLayout(100, 50, c.DIRECTION_LTR)

          expect(child.getComputedLeft()).toBe(5)
          expect(child.getComputedTop()).toBe(3)
          expect(child.getComputedWidth()).toBe(90)  // 100 - 5 - 5
          expect(child.getComputedHeight()).toBe(44) // 50 - 3 - 3

          root.free()
        })

        it("handles display:none correctly", () => {
          const c = engine.constants
          const root = engine.createNode()
          root.setWidth(100)
          root.setHeight(100)
          root.setFlexDirection(c.FLEX_DIRECTION_COLUMN)

          const visible = engine.createNode()
          visible.setHeight(20)

          const hidden = engine.createNode()
          hidden.setHeight(30)
          hidden.setDisplay(c.DISPLAY_NONE)

          const afterHidden = engine.createNode()
          afterHidden.setHeight(20)

          root.insertChild(visible, 0)
          root.insertChild(hidden, 1)
          root.insertChild(afterHidden, 2)

          root.calculateLayout(100, 100, c.DIRECTION_LTR)

          expect(visible.getComputedTop()).toBe(0)
          expect(visible.getComputedHeight()).toBe(20)

          // Hidden node takes no space
          expect(hidden.getComputedWidth()).toBe(0)
          expect(hidden.getComputedHeight()).toBe(0)

          // afterHidden should be immediately below visible, not offset by hidden
          expect(afterHidden.getComputedTop()).toBe(20)
          expect(afterHidden.getComputedHeight()).toBe(20)

          root.free()
        })

        it("uses measure function for intrinsic sizing", () => {
          const c = engine.constants
          const root = engine.createNode()
          root.setWidth(80)
          root.setFlexDirection(c.FLEX_DIRECTION_COLUMN)

          const measured = engine.createNode()
          measured.setMeasureFunc((width, _wMode, _height, _hMode) => ({
            width: Math.min(width, 40),
            height: 3,
          }))

          root.insertChild(measured, 0)
          root.calculateLayout(80, 100, c.DIRECTION_LTR)

          expect(measured.getComputedHeight()).toBe(3)

          root.free()
        })
      })
    }
  })

  // ===========================================================================
  // Tests: Constants Consistency Across Engines
  // ===========================================================================

  describe("constants consistency across engines", () => {
    it("both engines define the same constant keys", async () => {
      const flexx = createFlexxZeroEngine()
      const yoga = await initYogaEngine()

      const flexxKeys = Object.keys(flexx.constants).sort()
      const yogaKeys = Object.keys(yoga.constants).sort()

      expect(flexxKeys).toEqual(yogaKeys)
    })
  })
})
