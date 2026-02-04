/**
 * Layout Engine Tests
 *
 * Tests that verify both Yoga and Flexx layout engines work correctly
 * and produce consistent results.
 */

import { beforeEach, describe, expect, test } from "vitest"
import { createFlexxZeroEngine } from "../src/adapters/flexx-zero-adapter.js"
import { initYogaEngine } from "../src/adapters/yoga-adapter.js"
import {
  type LayoutEngine,
  type LayoutNode,
  getConstants,
  getLayoutEngine,
  setLayoutEngine,
} from "../src/layout-engine.js"

describe("Layout Engines", () => {
  describe("YogaLayoutEngine", () => {
    let engine: LayoutEngine

    beforeEach(async () => {
      engine = await initYogaEngine()
      setLayoutEngine(engine)
    })

    test("creates nodes", () => {
      const node = engine.createNode()
      expect(node).toBeDefined()
      node.free()
    })

    test("sets and gets dimensions", () => {
      const node = engine.createNode()
      const c = engine.constants

      node.setWidth(100)
      node.setHeight(50)
      node.calculateLayout(100, 50, c.DIRECTION_LTR)

      expect(node.getComputedWidth()).toBe(100)
      expect(node.getComputedHeight()).toBe(50)
      node.free()
    })

    test("calculates layout for parent-child hierarchy", () => {
      const c = engine.constants

      const parent = engine.createNode()
      parent.setWidth(100)
      parent.setHeight(100)
      parent.setFlexDirection(c.FLEX_DIRECTION_COLUMN)

      const child1 = engine.createNode()
      child1.setHeight(30)

      const child2 = engine.createNode()
      child2.setHeight(40)

      parent.insertChild(child1, 0)
      parent.insertChild(child2, 1)

      parent.calculateLayout(100, 100, c.DIRECTION_LTR)

      expect(child1.getComputedTop()).toBe(0)
      expect(child1.getComputedHeight()).toBe(30)
      expect(child2.getComputedTop()).toBe(30)
      expect(child2.getComputedHeight()).toBe(40)

      parent.free()
    })

    test("handles flex grow", () => {
      const c = engine.constants

      const parent = engine.createNode()
      parent.setWidth(100)
      parent.setHeight(100)
      parent.setFlexDirection(c.FLEX_DIRECTION_COLUMN)

      const fixed = engine.createNode()
      fixed.setHeight(20)

      const flexible = engine.createNode()
      flexible.setFlexGrow(1)

      parent.insertChild(fixed, 0)
      parent.insertChild(flexible, 1)

      parent.calculateLayout(100, 100, c.DIRECTION_LTR)

      expect(fixed.getComputedHeight()).toBe(20)
      expect(flexible.getComputedHeight()).toBe(80)

      parent.free()
    })

    test("handles padding", () => {
      const c = engine.constants

      const parent = engine.createNode()
      parent.setWidth(100)
      parent.setHeight(100)
      parent.setPadding(c.EDGE_ALL, 10)

      const child = engine.createNode()
      child.setFlexGrow(1)

      parent.insertChild(child, 0)
      parent.calculateLayout(100, 100, c.DIRECTION_LTR)

      expect(child.getComputedLeft()).toBe(10)
      expect(child.getComputedTop()).toBe(10)
      expect(child.getComputedWidth()).toBe(80) // 100 - 10 - 10
      expect(child.getComputedHeight()).toBe(80)

      parent.free()
    })

    test("exposes correct engine name", () => {
      expect(engine.name).toBe("yoga")
    })
  })

  describe("FlexxLayoutEngine", () => {
    let engine: LayoutEngine

    beforeEach(() => {
      engine = createFlexxZeroEngine()
      setLayoutEngine(engine)
    })

    test("creates nodes", () => {
      const node = engine.createNode()
      expect(node).toBeDefined()
      node.free()
    })

    test("sets and gets dimensions", () => {
      const node = engine.createNode()
      const c = engine.constants

      node.setWidth(100)
      node.setHeight(50)
      node.calculateLayout(100, 50, c.DIRECTION_LTR)

      expect(node.getComputedWidth()).toBe(100)
      expect(node.getComputedHeight()).toBe(50)
      node.free()
    })

    test("calculates layout for parent-child hierarchy", () => {
      const c = engine.constants

      const parent = engine.createNode()
      parent.setWidth(100)
      parent.setHeight(100)
      parent.setFlexDirection(c.FLEX_DIRECTION_COLUMN)

      const child1 = engine.createNode()
      child1.setHeight(30)

      const child2 = engine.createNode()
      child2.setHeight(40)

      parent.insertChild(child1, 0)
      parent.insertChild(child2, 1)

      parent.calculateLayout(100, 100, c.DIRECTION_LTR)

      expect(child1.getComputedTop()).toBe(0)
      expect(child1.getComputedHeight()).toBe(30)
      expect(child2.getComputedTop()).toBe(30)
      expect(child2.getComputedHeight()).toBe(40)

      parent.free()
    })

    test("handles flex grow", () => {
      const c = engine.constants

      const parent = engine.createNode()
      parent.setWidth(100)
      parent.setHeight(100)
      parent.setFlexDirection(c.FLEX_DIRECTION_COLUMN)

      const fixed = engine.createNode()
      fixed.setHeight(20)

      const flexible = engine.createNode()
      flexible.setFlexGrow(1)

      parent.insertChild(fixed, 0)
      parent.insertChild(flexible, 1)

      parent.calculateLayout(100, 100, c.DIRECTION_LTR)

      expect(fixed.getComputedHeight()).toBe(20)
      expect(flexible.getComputedHeight()).toBe(80)

      parent.free()
    })

    test("handles padding", () => {
      const c = engine.constants

      const parent = engine.createNode()
      parent.setWidth(100)
      parent.setHeight(100)
      parent.setPadding(c.EDGE_ALL, 10)

      const child = engine.createNode()
      child.setFlexGrow(1)

      parent.insertChild(child, 0)
      parent.calculateLayout(100, 100, c.DIRECTION_LTR)

      expect(child.getComputedLeft()).toBe(10)
      expect(child.getComputedTop()).toBe(10)
      expect(child.getComputedWidth()).toBe(80) // 100 - 10 - 10
      expect(child.getComputedHeight()).toBe(80)

      parent.free()
    })

    test("exposes correct engine name", () => {
      expect(engine.name).toBe("flexx-zero")
    })
  })

  describe("Engine Interchangeability", () => {
    test("both engines produce same layout for simple box", async () => {
      const yogaEngine = await initYogaEngine()
      const flexxEngine = createFlexxZeroEngine()

      // Create same layout with Yoga
      setLayoutEngine(yogaEngine)
      const yc = yogaEngine.constants
      const yRoot = yogaEngine.createNode()
      yRoot.setWidth(80)
      yRoot.setHeight(24)
      yRoot.setFlexDirection(yc.FLEX_DIRECTION_COLUMN)
      yRoot.setPadding(yc.EDGE_ALL, 2)

      const yChild = yogaEngine.createNode()
      yChild.setHeight(10)
      yRoot.insertChild(yChild, 0)

      yRoot.calculateLayout(80, 24, yc.DIRECTION_LTR)

      // Create same layout with Flexx
      setLayoutEngine(flexxEngine)
      const fc = flexxEngine.constants
      const fRoot = flexxEngine.createNode()
      fRoot.setWidth(80)
      fRoot.setHeight(24)
      fRoot.setFlexDirection(fc.FLEX_DIRECTION_COLUMN)
      fRoot.setPadding(fc.EDGE_ALL, 2)

      const fChild = flexxEngine.createNode()
      fChild.setHeight(10)
      fRoot.insertChild(fChild, 0)

      fRoot.calculateLayout(80, 24, fc.DIRECTION_LTR)

      // Both should produce identical results
      expect(yRoot.getComputedWidth()).toBe(fRoot.getComputedWidth())
      expect(yRoot.getComputedHeight()).toBe(fRoot.getComputedHeight())
      expect(yChild.getComputedLeft()).toBe(fChild.getComputedLeft())
      expect(yChild.getComputedTop()).toBe(fChild.getComputedTop())
      expect(yChild.getComputedWidth()).toBe(fChild.getComputedWidth())
      expect(yChild.getComputedHeight()).toBe(fChild.getComputedHeight())

      yRoot.free()
      fRoot.free()
    })

    test("global setLayoutEngine/getLayoutEngine works", async () => {
      const yogaEngine = await initYogaEngine()
      const flexxEngine = createFlexxZeroEngine()

      setLayoutEngine(yogaEngine)
      expect(getLayoutEngine().name).toBe("yoga")

      setLayoutEngine(flexxEngine)
      expect(getLayoutEngine().name).toBe("flexx-zero")

      // Switch back to yoga for other tests
      setLayoutEngine(yogaEngine)
    })
  })
})
