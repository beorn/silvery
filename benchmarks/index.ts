/**
 * Inkx Render Pipeline Benchmarks
 *
 * Run: bun run bench
 */

import { bench, group, run } from "mitata";
import { initYogaEngine } from "../src/adapters/yoga-adapter.js";
import { TerminalBuffer, cellEquals, styleEquals } from "../src/buffer.js";
import { getLayoutEngine, setLayoutEngine } from "../src/layout-engine.js";
import {
  contentPhase,
  executeRender,
  layoutPhase,
  measurePhase,
  outputPhase,
} from "../src/pipeline.js";
import type { BoxProps, InkxNode, TextProps } from "../src/types.js";
import {
  displayWidth,
  parseAnsiText,
  splitGraphemes,
  stripAnsi,
} from "../src/unicode.js";

// Initialize layout engine
const layoutEngine = await initYogaEngine();
setLayoutEngine(layoutEngine);

// Helper to create mock InkxNode
function createMockNode(
  type: InkxNode["type"],
  props: BoxProps | TextProps,
  children: InkxNode[] = [],
  textContent?: string,
): InkxNode {
  const engine = getLayoutEngine();
  const layoutNode = engine.createNode();

  if (type === "inkx-box" || type === "inkx-text") {
    const boxProps = props as BoxProps;
    if (typeof boxProps.width === "number") layoutNode.setWidth(boxProps.width);
    if (typeof boxProps.height === "number")
      layoutNode.setHeight(boxProps.height);
  }

  const node: InkxNode = {
    type,
    props,
    children,
    parent: null,
    layoutNode,
    contentRect: null,
    screenRect: null,
    prevLayout: null,
    layoutDirty: true,
    contentDirty: true,
    layoutSubscribers: new Set(),
    isRawText: false,
    textContent,
  };

  for (let i = 0; i < children.length; i++) {
    children[i]!.parent = node;
    if (children[i]!.layoutNode) {
      layoutNode.insertChild(children[i]!.layoutNode!, i);
    }
  }

  return node;
}

// ============================================================================
// Buffer Benchmarks
// ============================================================================

group("TerminalBuffer", () => {
  bench("create 80x24", () => {
    new TerminalBuffer(80, 24);
  });

  bench("create 200x50", () => {
    new TerminalBuffer(200, 50);
  });

  const buffer = new TerminalBuffer(80, 24);
  bench("setCell single", () => {
    buffer.setCell(40, 12, {
      char: "A",
      fg: 1,
      bg: null,
      attrs: {},
      wide: false,
      continuation: false,
    });
  });

  bench("getCell single", () => {
    buffer.getCell(40, 12);
  });

  bench("fill 80x24", () => {
    buffer.fill(0, 0, 80, 24, { char: " ", bg: 4 });
  });

  const buffer2 = new TerminalBuffer(80, 24);
  buffer2.setCell(10, 5, { char: "X" });
  bench("cellEquals (equal)", () => {
    cellEquals(buffer.getCell(10, 5), buffer.getCell(10, 5));
  });

  bench("cellEquals (different)", () => {
    cellEquals(buffer.getCell(10, 5), buffer2.getCell(10, 5));
  });
});

// ============================================================================
// Unicode Benchmarks
// ============================================================================

group("Unicode", () => {
  const asciiText =
    "Hello World, this is a test string with normal characters.";
  const emojiText = "Hello 😀 World 🎉 Test 🚀";
  const cjkText = "中文字符串测试";
  const mixedText = "Hello 中文 😀 World";
  const ansiText = "\x1b[31mRed\x1b[0m \x1b[1;34mBlue Bold\x1b[0m Normal";

  bench("splitGraphemes ASCII", () => {
    splitGraphemes(asciiText);
  });

  bench("splitGraphemes emoji", () => {
    splitGraphemes(emojiText);
  });

  bench("splitGraphemes CJK", () => {
    splitGraphemes(cjkText);
  });

  bench("displayWidth ASCII", () => {
    displayWidth(asciiText);
  });

  bench("displayWidth mixed", () => {
    displayWidth(mixedText);
  });

  bench("stripAnsi", () => {
    stripAnsi(ansiText);
  });

  bench("parseAnsiText", () => {
    parseAnsiText(ansiText);
  });
});

// ============================================================================
// Pipeline Benchmarks
// ============================================================================

group("Pipeline Phases", () => {
  // Simple tree
  const simpleRoot = createMockNode("inkx-box", { width: 80, height: 24 });
  simpleRoot.layoutDirty = true;

  bench("measurePhase (simple)", () => {
    measurePhase(simpleRoot);
  });

  bench("layoutPhase (simple)", () => {
    simpleRoot.layoutDirty = true;
    layoutPhase(simpleRoot, 80, 24);
  });

  // Content phase needs layout first
  simpleRoot.layoutDirty = true;
  layoutPhase(simpleRoot, 80, 24);

  bench("contentPhase (simple)", () => {
    contentPhase(simpleRoot);
  });

  // Complex tree with 100 children
  const children: InkxNode[] = [];
  for (let i = 0; i < 100; i++) {
    const child = createMockNode(
      "inkx-text",
      {},
      [],
      `Item ${i}: Some text content here`,
    );
    children.push(child);
  }
  const complexRoot = createMockNode(
    "inkx-box",
    { width: 80, height: 24 },
    children,
  );
  complexRoot.layoutDirty = true;
  layoutPhase(complexRoot, 80, 24);

  bench("measurePhase (100 children)", () => {
    measurePhase(complexRoot);
  });

  bench("layoutPhase (100 children)", () => {
    complexRoot.layoutDirty = true;
    layoutPhase(complexRoot, 80, 24);
  });

  bench("contentPhase (100 children)", () => {
    contentPhase(complexRoot);
  });
});

// ============================================================================
// Output Phase Benchmarks
// ============================================================================

group("Output Phase (Diff)", () => {
  const buffer1 = new TerminalBuffer(80, 24);
  const buffer2 = new TerminalBuffer(80, 24);

  // Fill with content
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 80; x++) {
      buffer1.setCell(x, y, { char: "A" });
      buffer2.setCell(x, y, { char: "A" });
    }
  }

  bench("outputPhase (no changes)", () => {
    outputPhase(buffer1, buffer2);
  });

  // Make some changes
  const buffer3 = new TerminalBuffer(80, 24);
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 80; x++) {
      buffer3.setCell(x, y, { char: "A" });
    }
  }
  // Change 10% of cells
  for (let i = 0; i < 192; i++) {
    const x = Math.floor(Math.random() * 80);
    const y = Math.floor(Math.random() * 24);
    buffer3.setCell(x, y, { char: "B", fg: 1 });
  }

  bench("outputPhase (10% changes)", () => {
    outputPhase(buffer1, buffer3);
  });

  bench("outputPhase (first render)", () => {
    outputPhase(null, buffer1);
  });
});

// ============================================================================
// Full Pipeline Benchmarks
// ============================================================================

group("Full Pipeline", () => {
  const simpleRoot = createMockNode("inkx-box", { width: 80, height: 24 });

  bench("executeRender (simple, first)", () => {
    simpleRoot.layoutDirty = true;
    executeRender(simpleRoot, 80, 24, null);
  });

  // With previous buffer (diff path)
  simpleRoot.layoutDirty = true;
  const { buffer: prevBuffer } = executeRender(simpleRoot, 80, 24, null);

  bench("executeRender (simple, diff)", () => {
    simpleRoot.layoutDirty = true;
    executeRender(simpleRoot, 80, 24, prevBuffer);
  });

  // Complex tree
  const children: InkxNode[] = [];
  for (let i = 0; i < 50; i++) {
    const child = createMockNode(
      "inkx-text",
      { color: "red" },
      [],
      `Line ${i}: Content`,
    );
    children.push(child);
  }
  const complexRoot = createMockNode(
    "inkx-box",
    { width: 120, height: 40 },
    children,
  );

  bench("executeRender (50 items, first)", () => {
    complexRoot.layoutDirty = true;
    executeRender(complexRoot, 120, 40, null);
  });

  complexRoot.layoutDirty = true;
  const { buffer: prevBuffer2 } = executeRender(complexRoot, 120, 40, null);

  bench("executeRender (50 items, diff)", () => {
    complexRoot.layoutDirty = true;
    executeRender(complexRoot, 120, 40, prevBuffer2);
  });
});

// Run all benchmarks
await run();
