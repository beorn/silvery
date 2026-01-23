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
    children[i].parent = node;
    if (children[i].layoutNode) {
      layoutNode.insertChild(children[i].layoutNode!, i);
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
    computedLayout: null,
    prevLayout: null,
    layoutDirty: false,
    contentDirty: true,
    layoutSubscribers: new Set(),
    isRawText: true,
    textContent: text,
  };
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
      root.computedLayout = { x: 0, y: 0, width: 80, height: 24 };

      // Should return early without recalculating
      layoutPhase(root, 100, 50);

      // Layout unchanged
      expect(root.computedLayout?.width).toBe(80);
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
      root.computedLayout = { x: 0, y: 0, width: 40, height: 10 };

      const buffer = contentPhase(root);

      expect(buffer.width).toBe(40);
      expect(buffer.height).toBe(10);
    });

    test("throws if layout not computed", async () => {
      const root = await createMockNode("inkx-box", { width: 40, height: 10 });
      root.computedLayout = null;

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
      textNode.computedLayout = { x: 0, y: 0, width: 10, height: 1 };

      const root = await createMockNode("inkx-box", { width: 40, height: 10 }, [
        textNode,
      ]);
      root.computedLayout = { x: 0, y: 0, width: 40, height: 10 };

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
