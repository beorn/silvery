/**
 * Pipeline Tests
 *
 * Tests for the render pipeline phases: measure, layout, content, output.
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { initYogaEngine } from "../src/adapters/yoga-adapter.js";
import { TerminalBuffer } from "../src/buffer.js";
import {
  type LayoutEngine,
  type LayoutNode,
  getConstants,
  getLayoutEngine,
  setLayoutEngine,
} from "../src/layout-engine.js";
import {
  type CellChange,
  contentPhase,
  executeRender,
  layoutEqual,
  layoutPhase,
  measurePhase,
  outputPhase,
  screenRectPhase,
  scrollPhase,
} from "../src/pipeline.js";
import type {
  BoxProps,
  ComputedLayout,
  InkxNode,
  TextProps,
} from "../src/types.js";

// Initialize layout engine before tests run
let layoutEngine: LayoutEngine;

beforeAll(async () => {
  layoutEngine = await initYogaEngine();
  setLayoutEngine(layoutEngine);
});

// Helper to create mock InkxNode
async function createMockNode(
  type: InkxNode["type"],
  props: BoxProps | TextProps,
  children: InkxNode[] = [],
  textContent?: string,
): Promise<InkxNode> {
  const engine = getLayoutEngine();
  const c = getConstants();
  const layoutNode = engine.createNode();

  // Apply props to layout node
  if (type === "inkx-box" || type === "inkx-text") {
    const boxProps = props as BoxProps;
    if (typeof boxProps.width === "number") layoutNode.setWidth(boxProps.width);
    if (typeof boxProps.height === "number") {
      layoutNode.setHeight(boxProps.height);
    }
    if (boxProps.flexDirection === "row") {
      layoutNode.setFlexDirection(c.FLEX_DIRECTION_ROW);
    }
    if (boxProps.flexDirection === "column") {
      layoutNode.setFlexDirection(c.FLEX_DIRECTION_COLUMN);
    }
    if (typeof boxProps.padding === "number") {
      layoutNode.setPadding(c.EDGE_ALL, boxProps.padding);
    }
  }

  const node: InkxNode = {
    type,
    props,
    children,
    parent: null,
    layoutNode,
    contentRect: null,
    screenRect: null,
    computedLayout: null,
    prevLayout: null,
    layoutDirty: true,
    contentDirty: true,
    layoutSubscribers: new Set(),
    isRawText: false,
    textContent,
  };

  // Link children
  for (let i = 0; i < children.length; i++) {
    children[i]!.parent = node;
    if (children[i]!.layoutNode) {
      layoutNode.insertChild(children[i]!.layoutNode!, i);
    }
  }

  return node;
}

// Helper to create raw text node (no layout node)
function createRawTextNode(text: string): InkxNode {
  return {
    type: "inkx-text",
    props: {},
    children: [],
    parent: null,
    layoutNode: null,
    contentRect: null,
    screenRect: null,
    computedLayout: null,
    prevLayout: null,
    layoutDirty: false,
    contentDirty: true,
    layoutSubscribers: new Set(),
    isRawText: true,
    textContent: text,
  };
}

// Helper to set layout on a node (sets both contentRect and computedLayout for compatibility)
function setNodeLayout(
  node: InkxNode,
  layout: { x: number; y: number; width: number; height: number },
): void {
  node.contentRect = layout;
  node.computedLayout = layout;
}

describe("Pipeline", () => {
  describe("layoutEqual", () => {
    test("null equals null", () => {
      expect(layoutEqual(null, null)).toBe(true);
    });

    test("null !== non-null", () => {
      const layout: ComputedLayout = { x: 0, y: 0, width: 10, height: 5 };
      expect(layoutEqual(null, layout)).toBe(false);
      expect(layoutEqual(layout, null)).toBe(false);
    });

    test("same layout equals", () => {
      const a: ComputedLayout = { x: 5, y: 10, width: 20, height: 15 };
      const b: ComputedLayout = { x: 5, y: 10, width: 20, height: 15 };
      expect(layoutEqual(a, b)).toBe(true);
    });

    test("different x not equal", () => {
      const a: ComputedLayout = { x: 0, y: 0, width: 10, height: 5 };
      const b: ComputedLayout = { x: 1, y: 0, width: 10, height: 5 };
      expect(layoutEqual(a, b)).toBe(false);
    });

    test("different width not equal", () => {
      const a: ComputedLayout = { x: 0, y: 0, width: 10, height: 5 };
      const b: ComputedLayout = { x: 0, y: 0, width: 11, height: 5 };
      expect(layoutEqual(a, b)).toBe(false);
    });
  });

  describe("measurePhase", () => {
    test("processes fit-content nodes", async () => {
      // Create a box with fit-content width containing text
      const textNode = await createMockNode("inkx-text", {}, [], "Hello");
      const root = await createMockNode(
        "inkx-box",
        { width: "fit-content" as unknown as number },
        [textNode],
      );

      // Should not throw
      measurePhase(root);
    });

    test("skips nodes without layoutNode", async () => {
      const rawText = createRawTextNode("Hello");
      const root = await createMockNode("inkx-box", { width: 20, height: 5 }, [
        rawText,
      ]);

      // Should not throw even though rawText has no layoutNode
      measurePhase(root);
    });
  });

  describe("layoutPhase", () => {
    test("calculates layout for root node", async () => {
      const root = await createMockNode("inkx-box", { width: 80, height: 24 });
      root.layoutDirty = true;

      layoutPhase(root, 80, 24);

      expect(root.computedLayout).not.toBeNull();
      expect(root.computedLayout?.width).toBe(80);
      expect(root.computedLayout?.height).toBe(24);
    });

    test("propagates layout to children", async () => {
      const child = await createMockNode("inkx-box", { width: 20, height: 5 });
      const root = await createMockNode("inkx-box", { width: 80, height: 24 }, [
        child,
      ]);
      root.layoutDirty = true;

      layoutPhase(root, 80, 24);

      expect(child.computedLayout).not.toBeNull();
      expect(child.computedLayout?.width).toBe(20);
    });

    test("skips when no dirty nodes", async () => {
      const root = await createMockNode("inkx-box", { width: 80, height: 24 });
      root.layoutDirty = false;
      setNodeLayout(root, { x: 0, y: 0, width: 80, height: 24 });

      // Should return early without recalculating
      layoutPhase(root, 100, 50);

      // Layout unchanged
      expect(root.contentRect?.width).toBe(80);
    });

    test("handles virtual text nodes (no layoutNode)", async () => {
      const rawText = createRawTextNode("Hello");
      const root = await createMockNode("inkx-box", { width: 80, height: 24 }, [
        rawText,
      ]);
      root.layoutDirty = true;

      layoutPhase(root, 80, 24);

      // Virtual text inherits parent position
      expect(rawText.computedLayout).not.toBeNull();
    });
  });

  describe("contentPhase", () => {
    test("returns buffer with correct dimensions", async () => {
      const root = await createMockNode("inkx-box", { width: 40, height: 10 });
      setNodeLayout(root, { x: 0, y: 0, width: 40, height: 10 });

      const buffer = contentPhase(root);

      expect(buffer.width).toBe(40);
      expect(buffer.height).toBe(10);
    });

    test("throws if layout not computed", async () => {
      const root = await createMockNode("inkx-box", { width: 40, height: 10 });
      // contentRect left as null to test error case

      expect(() => contentPhase(root)).toThrow(
        "contentPhase called before layout phase",
      );
    });

    test("renders text content", async () => {
      const textNode = await createMockNode(
        "inkx-text",
        { color: "red" },
        [],
        "Hello",
      );
      setNodeLayout(textNode, { x: 0, y: 0, width: 10, height: 1 });

      const root = await createMockNode("inkx-box", { width: 40, height: 10 }, [
        textNode,
      ]);
      setNodeLayout(root, { x: 0, y: 0, width: 40, height: 10 });

      const buffer = contentPhase(root);

      expect(buffer.getCell(0, 0).char).toBe("H");
      expect(buffer.getCell(4, 0).char).toBe("o");
    });

    test("renders box with border", async () => {
      const root = await createMockNode("inkx-box", {
        width: 10,
        height: 3,
        borderStyle: "single",
      });
      root.computedLayout = { x: 0, y: 0, width: 10, height: 3 };

      const buffer = contentPhase(root);

      // Top-left corner
      expect(buffer.getCell(0, 0).char).toBe("\u250c"); // ┌
      // Top-right corner
      expect(buffer.getCell(9, 0).char).toBe("\u2510"); // ┐
      // Bottom-left corner
      expect(buffer.getCell(0, 2).char).toBe("\u2514"); // └
      // Horizontal border
      expect(buffer.getCell(1, 0).char).toBe("\u2500"); // ─
    });
  });

  describe("scrollPhase", () => {
    test("calculates scroll state for overflow=scroll containers", async () => {
      const { scrollPhase } = await import("../src/pipeline.js");

      const child1 = await createMockNode("inkx-box", { height: 1 });
      child1.computedLayout = { x: 0, y: 0, width: 10, height: 1 };

      const child2 = await createMockNode("inkx-box", { height: 1 });
      child2.computedLayout = { x: 0, y: 1, width: 10, height: 1 };

      const child3 = await createMockNode("inkx-box", { height: 1 });
      child3.computedLayout = { x: 0, y: 2, width: 10, height: 1 };

      const scrollContainer = await createMockNode(
        "inkx-box",
        { overflow: "scroll", height: 2 } as BoxProps,
        [child1, child2, child3],
      );
      scrollContainer.computedLayout = { x: 0, y: 0, width: 10, height: 2 };

      scrollPhase(scrollContainer);

      expect(scrollContainer.scrollState).toBeDefined();
      expect(scrollContainer.scrollState?.viewportHeight).toBe(2);
      expect(scrollContainer.scrollState?.contentHeight).toBe(3);
      expect(scrollContainer.scrollState?.firstVisibleChild).toBe(0);
      expect(scrollContainer.scrollState?.lastVisibleChild).toBe(1);
      expect(scrollContainer.scrollState?.hiddenBelow).toBe(1);
    });

    test("skips non-scroll containers", async () => {
      const { scrollPhase } = await import("../src/pipeline.js");

      const container = await createMockNode("inkx-box", {
        overflow: "hidden",
      } as BoxProps);
      container.computedLayout = { x: 0, y: 0, width: 10, height: 5 };

      scrollPhase(container);

      expect(container.scrollState).toBeUndefined();
    });

    test("identifies sticky children for rendering", async () => {
      const { scrollPhase } = await import("../src/pipeline.js");

      // Create a header (sticky) and some content
      const stickyHeader = await createMockNode("inkx-box", {
        height: 1,
        position: "sticky",
        stickyTop: 0,
      } as BoxProps);
      stickyHeader.computedLayout = { x: 0, y: 0, width: 10, height: 1 };

      const item1 = await createMockNode("inkx-box", { height: 1 });
      item1.computedLayout = { x: 0, y: 1, width: 10, height: 1 };

      const item2 = await createMockNode("inkx-box", { height: 1 });
      item2.computedLayout = { x: 0, y: 2, width: 10, height: 1 };

      const item3 = await createMockNode("inkx-box", { height: 1 });
      item3.computedLayout = { x: 0, y: 3, width: 10, height: 1 };

      const scrollContainer = await createMockNode(
        "inkx-box",
        { overflow: "scroll", height: 3, scrollTo: 2 } as BoxProps,
        [stickyHeader, item1, item2, item3],
      );
      scrollContainer.computedLayout = { x: 0, y: 0, width: 10, height: 3 };

      scrollPhase(scrollContainer);

      expect(scrollContainer.scrollState).toBeDefined();
      expect(scrollContainer.scrollState?.stickyChildren).toBeDefined();
      expect(scrollContainer.scrollState?.stickyChildren?.length).toBe(1);
      expect(scrollContainer.scrollState?.stickyChildren?.[0]?.index).toBe(0);
    });

    test("calculates sticky-top render offset when scrolled past header", async () => {
      const { scrollPhase } = await import("../src/pipeline.js");

      // Header at natural position 0, sticks to top when scrolled
      const stickyHeader = await createMockNode("inkx-box", {
        height: 1,
        position: "sticky",
        stickyTop: 0,
      } as BoxProps);
      stickyHeader.computedLayout = { x: 0, y: 0, width: 10, height: 1 };

      // Many items below it
      const items: InkxNode[] = [stickyHeader];
      for (let i = 1; i <= 10; i++) {
        const item = await createMockNode("inkx-box", { height: 1 });
        item.computedLayout = { x: 0, y: i, width: 10, height: 1 };
        items.push(item);
      }

      // Viewport of 5 rows, scroll to item 5 (near bottom)
      const scrollContainer = await createMockNode(
        "inkx-box",
        { overflow: "scroll", height: 5, scrollTo: 5 } as BoxProps,
        items,
      );
      scrollContainer.computedLayout = { x: 0, y: 0, width: 10, height: 5 };

      scrollPhase(scrollContainer);

      const sticky = scrollContainer.scrollState?.stickyChildren?.[0];
      expect(sticky).toBeDefined();
      // When scrolled down, header should render at top (offset 0)
      expect(sticky?.renderOffset).toBe(0);
    });

    test("sticky header at natural position when not scrolled", async () => {
      const { scrollPhase } = await import("../src/pipeline.js");

      // Header at natural position 0
      const stickyHeader = await createMockNode("inkx-box", {
        height: 1,
        position: "sticky",
        stickyTop: 0,
      } as BoxProps);
      stickyHeader.computedLayout = { x: 0, y: 0, width: 10, height: 1 };

      const item1 = await createMockNode("inkx-box", { height: 1 });
      item1.computedLayout = { x: 0, y: 1, width: 10, height: 1 };

      // Viewport of 5 rows, no scroll (scrollTo first item)
      const scrollContainer = await createMockNode(
        "inkx-box",
        { overflow: "scroll", height: 5, scrollTo: 0 } as BoxProps,
        [stickyHeader, item1],
      );
      scrollContainer.computedLayout = { x: 0, y: 0, width: 10, height: 5 };

      scrollPhase(scrollContainer);

      const sticky = scrollContainer.scrollState?.stickyChildren?.[0];
      expect(sticky).toBeDefined();
      // When not scrolled, header should be at its natural position (offset 0)
      expect(sticky?.renderOffset).toBe(0);
    });

    test("sticky children are always considered visible", async () => {
      const { scrollPhase } = await import("../src/pipeline.js");

      // Header at position 0
      const stickyHeader = await createMockNode("inkx-box", {
        height: 1,
        position: "sticky",
        stickyTop: 0,
      } as BoxProps);
      stickyHeader.computedLayout = { x: 0, y: 0, width: 10, height: 1 };

      // 20 items below it
      const items: InkxNode[] = [stickyHeader];
      for (let i = 1; i <= 20; i++) {
        const item = await createMockNode("inkx-box", { height: 1 });
        item.computedLayout = { x: 0, y: i, width: 10, height: 1 };
        items.push(item);
      }

      // Scroll to bottom (item 18)
      const scrollContainer = await createMockNode(
        "inkx-box",
        { overflow: "scroll", height: 5, scrollTo: 18 } as BoxProps,
        items,
      );
      scrollContainer.computedLayout = { x: 0, y: 0, width: 10, height: 5 };

      scrollPhase(scrollContainer);

      // Even when scrolled to bottom, sticky header should be considered "visible"
      // firstVisibleChild should include index 0 (the sticky header)
      expect(scrollContainer.scrollState?.firstVisibleChild).toBe(0);
    });
  });

  describe("screenRectPhase", () => {
    test("computes screen positions accounting for scroll offset", async () => {
      // Create a child at content y=10
      const child = await createMockNode("inkx-box", { height: 3 });
      child.contentRect = child.computedLayout = {
        x: 0,
        y: 10,
        width: 10,
        height: 3,
      };

      // Create a scroll container scrolled down by 5
      const scrollContainer = await createMockNode(
        "inkx-box",
        { overflow: "scroll", height: 10, scrollTo: 1 } as BoxProps,
        [child],
      );
      scrollContainer.contentRect = scrollContainer.computedLayout = {
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      };

      // Run scroll phase to set scrollState.offset
      scrollPhase(scrollContainer);
      const scrollOffset = scrollContainer.scrollState?.offset ?? 0;

      // Run screen rect phase
      screenRectPhase(scrollContainer);

      // Container screen position equals content position (no parent scroll)
      expect(scrollContainer.screenRect).toEqual({
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      });

      // Child screen position = content position - scroll offset
      expect(child.screenRect).toEqual({
        x: 0,
        y: 10 - scrollOffset,
        width: 10,
        height: 3,
      });
    });

    test("accumulates scroll offsets from nested containers", async () => {
      // Inner child at content y=20
      const innerChild = await createMockNode("inkx-box", { height: 2 });
      innerChild.contentRect = innerChild.computedLayout = {
        x: 0,
        y: 20,
        width: 10,
        height: 2,
      };

      // Inner scroll container scrolled by 5
      const innerScroll = await createMockNode(
        "inkx-box",
        { overflow: "scroll", height: 10 } as BoxProps,
        [innerChild],
      );
      innerScroll.contentRect = innerScroll.computedLayout = {
        x: 0,
        y: 5,
        width: 10,
        height: 10,
      };
      innerScroll.scrollState = {
        offset: 5,
        contentHeight: 30,
        viewportHeight: 10,
        firstVisibleChild: 0,
        lastVisibleChild: 0,
        hiddenAbove: 0,
        hiddenBelow: 0,
      };

      // Outer scroll container scrolled by 3
      const outerScroll = await createMockNode(
        "inkx-box",
        { overflow: "scroll", height: 15 } as BoxProps,
        [innerScroll],
      );
      outerScroll.contentRect = outerScroll.computedLayout = {
        x: 0,
        y: 0,
        width: 10,
        height: 15,
      };
      outerScroll.scrollState = {
        offset: 3,
        contentHeight: 20,
        viewportHeight: 15,
        firstVisibleChild: 0,
        lastVisibleChild: 0,
        hiddenAbove: 0,
        hiddenBelow: 0,
      };

      // Run screen rect phase
      screenRectPhase(outerScroll);

      // Outer container: screen = content (no parent scroll)
      expect(outerScroll.screenRect?.y).toBe(0);

      // Inner container: screen = content(5) - outer scroll(3) = 2
      expect(innerScroll.screenRect?.y).toBe(2);

      // Inner child: screen = content(20) - outer scroll(3) - inner scroll(5) = 12
      expect(innerChild.screenRect?.y).toBe(12);
    });

    test("cross-column visual navigation uses screen Y not content Y", async () => {
      // Simulate two columns with different scroll offsets
      // Column 1: scrolled down, card at content y=50 appears at screen y=10
      const col1Card = await createMockNode("inkx-box", { height: 3 });
      col1Card.contentRect = col1Card.computedLayout = {
        x: 0,
        y: 50,
        width: 20,
        height: 3,
      };

      const col1 = await createMockNode(
        "inkx-box",
        { overflow: "scroll", height: 20 } as BoxProps,
        [col1Card],
      );
      col1.contentRect = col1.computedLayout = {
        x: 0,
        y: 0,
        width: 20,
        height: 20,
      };
      col1.scrollState = {
        offset: 40,
        contentHeight: 100,
        viewportHeight: 20,
        firstVisibleChild: 0,
        lastVisibleChild: 0,
        hiddenAbove: 0,
        hiddenBelow: 0,
      };

      // Column 2: not scrolled, card at content y=10 appears at screen y=10
      const col2Card = await createMockNode("inkx-box", { height: 3 });
      col2Card.contentRect = col2Card.computedLayout = {
        x: 20,
        y: 10,
        width: 20,
        height: 3,
      };

      const col2 = await createMockNode(
        "inkx-box",
        { overflow: "scroll", height: 20 } as BoxProps,
        [col2Card],
      );
      col2.contentRect = col2.computedLayout = {
        x: 20,
        y: 0,
        width: 20,
        height: 20,
      };
      col2.scrollState = {
        offset: 0,
        contentHeight: 50,
        viewportHeight: 20,
        firstVisibleChild: 0,
        lastVisibleChild: 0,
        hiddenAbove: 0,
        hiddenBelow: 0,
      };

      // Root container
      const root = await createMockNode(
        "inkx-box",
        { flexDirection: "row" } as BoxProps,
        [col1, col2],
      );
      root.contentRect = root.computedLayout = {
        x: 0,
        y: 0,
        width: 40,
        height: 20,
      };

      // Run screen rect phase
      screenRectPhase(root);

      // Both cards should have the SAME screen Y despite different content Y
      // col1Card: content y=50, scroll=40 → screen y=10
      // col2Card: content y=10, scroll=0 → screen y=10
      expect(col1Card.screenRect?.y).toBe(10);
      expect(col2Card.screenRect?.y).toBe(10);

      // This is the key invariant for h/l navigation:
      // Cards at the same visual position have matching screenRect.y
      expect(col1Card.screenRect?.y).toBe(col2Card.screenRect?.y);
    });
  });

  describe("outputPhase", () => {
    test("outputs entire buffer on first render", () => {
      const buffer = new TerminalBuffer(10, 2);
      buffer.setCell(0, 0, { char: "H" });
      buffer.setCell(1, 0, { char: "i" });

      const output = outputPhase(null, buffer);

      // Should have cursor home
      expect(output).toContain("\x1b[H");
      // Should have content
      expect(output).toContain("H");
      expect(output).toContain("i");
    });

    test("returns empty string when no changes", () => {
      const buffer = new TerminalBuffer(10, 2);
      buffer.setCell(0, 0, { char: "A" });

      const prev = buffer.clone();
      const output = outputPhase(prev, buffer);

      expect(output).toBe("");
    });

    test("outputs only changed cells", () => {
      const prev = new TerminalBuffer(10, 2);
      prev.setCell(0, 0, { char: "A" });

      const next = new TerminalBuffer(10, 2);
      next.setCell(0, 0, { char: "B" });

      const output = outputPhase(prev, next);

      expect(output).toContain("B");
      expect(output.length).toBeLessThan(outputPhase(null, next).length);
    });
  });

  describe("executeRender", () => {
    test("runs full pipeline", async () => {
      const root = await createMockNode("inkx-box", { width: 20, height: 5 });
      root.layoutDirty = true;

      const { output, buffer } = executeRender(root, 20, 5, null);

      expect(buffer).toBeInstanceOf(TerminalBuffer);
      expect(buffer.width).toBe(20);
      expect(buffer.height).toBe(5);
      expect(typeof output).toBe("string");
    });

    test("diffs against previous buffer", async () => {
      const root = await createMockNode("inkx-box", { width: 20, height: 5 });
      root.layoutDirty = true;

      const { buffer: buffer1 } = executeRender(root, 20, 5, null);

      // Second render with same content
      root.layoutDirty = true;
      const { output: output2 } = executeRender(root, 20, 5, buffer1);

      // Should be minimal or empty (no changes)
      expect(output2.length).toBeLessThanOrEqual(10);
    });

    test("renders text with ANSI escape sequences", async () => {
      // Create a text node with ANSI-styled content (like chalk output)
      const textNode = await createMockNode(
        "inkx-text",
        {},
        [],
        "\x1b[31mred text\x1b[0m",
      );
      textNode.computedLayout = { x: 0, y: 0, width: 20, height: 1 };

      const root = await createMockNode("inkx-box", { width: 20, height: 3 }, [
        textNode,
      ]);
      root.computedLayout = { x: 0, y: 0, width: 20, height: 3 };

      const buffer = contentPhase(root);

      // The text "red text" should be in the buffer (without ANSI codes)
      const cell = buffer.getCell(0, 0);
      expect(cell.char).toBe("r");
      // The foreground color should be set (red = palette index 1)
      expect(cell.fg).toBe(1);
    });

    test("calculates ANSI text width correctly", async () => {
      // ANSI codes should not affect measured text width
      const textNode = await createMockNode(
        "inkx-text",
        {},
        [],
        "\x1b[1;34mhello\x1b[0m",
      );
      textNode.computedLayout = { x: 0, y: 0, width: 20, height: 1 };

      const root = await createMockNode("inkx-box", { width: 20, height: 1 }, [
        textNode,
      ]);
      root.computedLayout = { x: 0, y: 0, width: 20, height: 1 };

      const buffer = contentPhase(root);

      // Should render "hello" (5 chars) not the full ANSI string
      expect(buffer.getCell(0, 0).char).toBe("h");
      expect(buffer.getCell(4, 0).char).toBe("o");
      // Position 5 should be empty (space)
      expect(buffer.getCell(5, 0).char).toBe(" ");
    });

    test("handles emoji width correctly (wide characters)", async () => {
      // Emoji like 😀 take 2 terminal columns
      // Test: "A😀B" should occupy 4 columns: A(1) + 😀(2) + B(1) = 4
      const textNode = await createMockNode("inkx-text", {}, [], "A😀B");
      textNode.computedLayout = { x: 0, y: 0, width: 10, height: 1 };

      const root = await createMockNode("inkx-box", { width: 10, height: 1 }, [
        textNode,
      ]);
      root.computedLayout = { x: 0, y: 0, width: 10, height: 1 };

      const buffer = contentPhase(root);

      // A at position 0
      expect(buffer.getCell(0, 0).char).toBe("A");
      // 😀 at position 1, should be marked as wide
      expect(buffer.getCell(1, 0).char).toBe("😀");
      expect(buffer.getCell(1, 0).wide).toBe(true);
      // Position 2 should be continuation cell for wide emoji
      expect(buffer.getCell(2, 0).continuation).toBe(true);
      // B at position 3
      expect(buffer.getCell(3, 0).char).toBe("B");
    });

    test("handles combining characters correctly (zero-width)", async () => {
      // café with combining acute accent: "cafe\u0301"
      // The e + combining accent should be treated as one grapheme
      // Total: c(1) + a(1) + f(1) + é(1) = 4 columns
      // Note: wrap-ansi normalizes decomposed chars to precomposed form
      const textNode = await createMockNode("inkx-text", {}, [], "cafe\u0301");
      textNode.computedLayout = { x: 0, y: 0, width: 10, height: 1 };

      const root = await createMockNode("inkx-box", { width: 10, height: 1 }, [
        textNode,
      ]);
      root.computedLayout = { x: 0, y: 0, width: 10, height: 1 };

      const buffer = contentPhase(root);

      // c, a, f at positions 0, 1, 2
      expect(buffer.getCell(0, 0).char).toBe("c");
      expect(buffer.getCell(1, 0).char).toBe("a");
      expect(buffer.getCell(2, 0).char).toBe("f");
      // é should be at position 3 (may be precomposed '\u00e9' or decomposed 'e\u0301')
      const eChar = buffer.getCell(3, 0).char;
      expect(eChar === "\u00e9" || eChar === "e\u0301").toBe(true);
      // Position 4 should be space (not the combining accent as separate char)
      expect(buffer.getCell(4, 0).char).toBe(" ");
    });

    test("handles CJK characters correctly (wide)", async () => {
      // CJK characters take 2 columns each
      // 中 (U+4E2D) should be width 2
      const textNode = await createMockNode("inkx-text", {}, [], "中文");
      textNode.computedLayout = { x: 0, y: 0, width: 10, height: 1 };

      const root = await createMockNode("inkx-box", { width: 10, height: 1 }, [
        textNode,
      ]);
      root.computedLayout = { x: 0, y: 0, width: 10, height: 1 };

      const buffer = contentPhase(root);

      // 中 at position 0, wide
      expect(buffer.getCell(0, 0).char).toBe("中");
      expect(buffer.getCell(0, 0).wide).toBe(true);
      // Position 1 is continuation
      expect(buffer.getCell(1, 0).continuation).toBe(true);
      // 文 at position 2, wide
      expect(buffer.getCell(2, 0).char).toBe("文");
      expect(buffer.getCell(2, 0).wide).toBe(true);
      // Position 3 is continuation
      expect(buffer.getCell(3, 0).continuation).toBe(true);
      // Position 4 should be space
      expect(buffer.getCell(4, 0).char).toBe(" ");
    });
  });

  describe("background conflict detection", () => {
    const originalEnv = process.env.INKX_BG_CONFLICT;

    test("throws on chalk bg with inkx Text backgroundColor (throw mode)", async () => {
      process.env.INKX_BG_CONFLICT = "throw";

      // Text with backgroundColor + chalk.bgBlue ANSI code
      const textNode = await createMockNode(
        "inkx-text",
        { backgroundColor: "cyan" } as TextProps,
        [],
        "\x1b[44mconflict\x1b[0m", // chalk.bgBlue output
      );
      textNode.computedLayout = { x: 0, y: 0, width: 20, height: 1 };

      const root = await createMockNode("inkx-box", { width: 20, height: 1 }, [
        textNode,
      ]);
      root.computedLayout = { x: 0, y: 0, width: 20, height: 1 };

      expect(() => contentPhase(root)).toThrow(/Background conflict/);

      process.env.INKX_BG_CONFLICT = originalEnv;
    });

    test("throws on chalk bg with parent Box backgroundColor (throw mode)", async () => {
      process.env.INKX_BG_CONFLICT = "throw";

      // Text without own bg, but parent Box has bg
      const textNode = await createMockNode(
        "inkx-text",
        {} as TextProps,
        [],
        "\x1b[44mconflict\x1b[0m", // chalk.bgBlue output
      );
      textNode.computedLayout = { x: 0, y: 0, width: 20, height: 1 };

      // Parent box with backgroundColor - will fill buffer before text renders
      const root = await createMockNode(
        "inkx-box",
        { width: 20, height: 1, backgroundColor: "cyan" } as BoxProps,
        [textNode],
      );
      root.computedLayout = { x: 0, y: 0, width: 20, height: 1 };

      expect(() => contentPhase(root)).toThrow(/Background conflict/);

      process.env.INKX_BG_CONFLICT = originalEnv;
    });

    test("allows chalk bg when no inkx background (no conflict)", async () => {
      process.env.INKX_BG_CONFLICT = "throw";

      // Text with chalk bg but no inkx backgroundColor anywhere
      const textNode = await createMockNode(
        "inkx-text",
        {} as TextProps,
        [],
        "\x1b[44mno conflict\x1b[0m",
      );
      textNode.computedLayout = { x: 0, y: 0, width: 20, height: 1 };

      const root = await createMockNode("inkx-box", { width: 20, height: 1 }, [
        textNode,
      ]);
      root.computedLayout = { x: 0, y: 0, width: 20, height: 1 };

      // Should not throw
      expect(() => contentPhase(root)).not.toThrow();

      process.env.INKX_BG_CONFLICT = originalEnv;
    });

    test("allows conflict with bgOverride marker (SGR 9999)", async () => {
      process.env.INKX_BG_CONFLICT = "throw";

      // Text with bgOverride marker + chalk bg inside inkx bg
      const textNode = await createMockNode(
        "inkx-text",
        { backgroundColor: "cyan" } as TextProps,
        [],
        "\x1b[9999m\x1b[44mintentional\x1b[0m", // bgOverride + chalk.bgBlue
      );
      textNode.computedLayout = { x: 0, y: 0, width: 20, height: 1 };

      const root = await createMockNode("inkx-box", { width: 20, height: 1 }, [
        textNode,
      ]);
      root.computedLayout = { x: 0, y: 0, width: 20, height: 1 };

      // Should not throw due to bgOverride
      expect(() => contentPhase(root)).not.toThrow();

      process.env.INKX_BG_CONFLICT = originalEnv;
    });

    test("ignore mode allows conflict silently", async () => {
      process.env.INKX_BG_CONFLICT = "ignore";

      const textNode = await createMockNode(
        "inkx-text",
        { backgroundColor: "cyan" } as TextProps,
        [],
        "\x1b[44mignored\x1b[0m",
      );
      textNode.computedLayout = { x: 0, y: 0, width: 20, height: 1 };

      const root = await createMockNode("inkx-box", { width: 20, height: 1 }, [
        textNode,
      ]);
      root.computedLayout = { x: 0, y: 0, width: 20, height: 1 };

      // Should not throw in ignore mode
      expect(() => contentPhase(root)).not.toThrow();

      process.env.INKX_BG_CONFLICT = originalEnv;
    });
  });
});
