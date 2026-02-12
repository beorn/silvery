# Inkx: Test-Driven Development Strategy

## Philosophy

Since Inkx targets API compatibility with Ink and Chalk, we have a **golden specification**: their existing test suites. Rather than writing tests from scratch, we leverage their tests as our compatibility contract.

**Core principle**: If Ink's tests pass, we're compatible. If they don't, we know exactly what's broken.

---

## 1. Test Suite Architecture

```
inkx/
├── tests/
│   ├── compat/                 # Compatibility tests (from Ink/Chalk)
│   │   ├── ink/               # Ink test suite (adapted)
│   │   │   ├── flex.test.tsx
│   │   │   ├── render.test.tsx
│   │   │   ├── components.test.tsx
│   │   │   └── ... (31 test files)
│   │   └── chalk/             # Chalk test suite (adapted)
│   │       ├── chalk.test.ts
│   │       ├── level.test.ts
│   │       └── ... (6 test files)
│   │
│   ├── visual/                # Visual regression tests
│   │   ├── snapshots/         # Reference screenshots/outputs
│   │   ├── terminals/         # Terminal-specific tests
│   │   │   ├── xterm.test.ts
│   │   │   ├── iterm.test.ts
│   │   │   ├── kitty.test.ts
│   │   │   └── vscode.test.ts
│   │   └── visual.test.ts     # Cross-terminal visual tests
│   │
│   ├── perf/                  # Performance benchmarks
│   │   ├── render.bench.ts
│   │   ├── layout.bench.ts
│   │   ├── diff.bench.ts
│   │   └── memory.bench.ts
│   │
│   └── unit/                  # Inkx-specific unit tests
│       ├── layout-hook.test.ts
│       ├── two-phase.test.ts
│       └── ...
```

---

## 2. Compatibility Testing Strategy

### 2.1 Ink Test Suite Triage

Ink has 31 test files. We triage them into categories based on feasibility:

#### Tier 1: Must Pass (MVP Blockers) - 14 files

| File                            | Tests | Notes                       |
| ------------------------------- | ----- | --------------------------- |
| `flex.test.tsx`                 | 12    | Core flexbox                |
| `flex-direction.test.tsx`       | 4     | Row/column                  |
| `flex-justify-content.test.tsx` | 5     | Main axis alignment         |
| `flex-align-items.test.tsx`     | 5     | Cross axis alignment        |
| `flex-align-self.test.tsx`      | 4     | Override alignment          |
| `flex-wrap.test.tsx`            | 3     | Wrapping                    |
| `text.test.tsx`                 | 8     | Text rendering              |
| `text-width.test.tsx`           | 4     | Text width calculation      |
| `render.test.tsx`               | 15    | Core render API             |
| `components.test.tsx`           | 10    | Box, Text, Newline, Spacer  |
| `hooks.test.tsx`                | 8     | useInput, useApp, useStdout |
| `width-height.test.tsx`         | 6     | Dimension props             |
| `margin.test.tsx`               | 4     | Spacing                     |
| `padding.test.tsx`              | 4     | Spacing                     |

**Total: 92 tests must pass**

#### Tier 2: Should Pass (1.0 Blockers) - 10 files

| File                       | Tests | Notes                   |
| -------------------------- | ----- | ----------------------- |
| `borders.test.tsx`         | 8     | Border styles           |
| `background.test.tsx`      | 3     | Background colors       |
| `display.test.tsx`         | 4     | Display none            |
| `overflow.test.tsx`        | 3     | Overflow handling       |
| `gap.test.tsx`             | 3     | Flex gap                |
| `focus.test.tsx`           | 12    | Focus management        |
| `measure-element.test.tsx` | 5     | measureElement() compat |
| `measure-text.test.tsx`    | 4     | Text measurement        |
| `static.test.tsx`          | 6     | Static component        |
| `exit.test.tsx`            | 4     | App exit                |

**Total: 52 tests should pass**

#### Tier 3: Nice to Have (Post 1.0) - 5 files

| File                       | Tests | Notes                  |
| -------------------------- | ----- | ---------------------- |
| `errors.test.tsx`          | 5     | Error boundaries       |
| `log-update.test.tsx`      | 3     | Log update integration |
| `terminal-resize.test.tsx` | 4     | Resize handling        |
| `screen-reader.test.tsx`   | 3     | Accessibility          |
| `reconciler.test.tsx`      | 8     | Internal reconciler    |

**Total: 23 tests nice to have**

#### Tier 4: Won't Pass (By Design) - 2 files

| File                 | Tests | Reason                        |
| -------------------- | ----- | ----------------------------- |
| `transform.test.tsx` | 4     | Different internal model      |
| `key.test.tsx`       | 3     | React key handling (internal) |

**Total: 7 tests won't pass**

### 2.2 Clone and Adapt Process

```bash
# Fetch Ink's test suite
git clone --depth=1 https://github.com/vadimdemedes/ink.git /tmp/ink
cp -r /tmp/ink/test/* tests/compat/ink/

# Adapt imports
find tests/compat/ink -name "*.tsx" -exec sed -i '' \
  's/from '\''ink'\''/from '\''inkx'\''/g' {} \;
```

### 2.3 Track Compatibility Progress

```typescript
// tests/compat/ink/compat-status.ts
export const COMPAT_STATUS = {
  // Tier 1 - Must pass (MVP)
  "flex.test.tsx": "passing",
  "flex-direction.test.tsx": "passing",
  "flex-justify-content.test.tsx": "passing",
  "text.test.tsx": "partial", // 6/8 passing
  "render.test.tsx": "partial", // 12/15 passing

  // Tier 2 - Should pass (1.0)
  "borders.test.tsx": "pending",
  "focus.test.tsx": "pending",

  // Tier 3 - Nice to have
  "screen-reader.test.tsx": "skipped",

  // Tier 4 - Won't pass
  "transform.test.tsx": "wont-pass",
} as const
```

**Step 3: CI Dashboard**

```yaml
# .github/workflows/compat.yml
- name: Run Ink compatibility tests
  run: |
    bun test tests/compat/ink --reporter=json > ink-compat.json
    node scripts/compat-report.js ink-compat.json
```

Output:

```
Ink Compatibility Report
========================
Flexbox Layout:    ████████████████████ 100% (6/6 files)
Components:        ████████████░░░░░░░░  60% (3/5 files)
Hooks:             ██████░░░░░░░░░░░░░░  30% (1/3 files)
Overall:           ████████████░░░░░░░░  65% (20/31 files)
```

### 2.2 Chalk Compatibility

Chalk tests are simpler - pure ANSI output assertions:

```typescript
// tests/compat/chalk/chalk.test.ts
import { test, expect } from 'bun:test';
import chalk from 'chalk';
import { Text, renderToString } from 'inkx';

test('chalk.red produces correct ANSI', () => {
  const output = renderToString(<Text>{chalk.red('foo')}</Text>);
  expect(output).toBe('\u001B[31mfoo\u001B[39m');
});

test('nested styles close correctly', () => {
  const output = renderToString(
    <Text>{chalk.red.bgGreen.underline('foo')}</Text>
  );
  expect(output).toBe('\u001B[4m\u001B[42m\u001B[31mfoo\u001B[39m\u001B[49m\u001B[24m');
});
```

### 2.3 Running Original Test Suites

For maximum confidence, run the **original** Ink/Chalk tests:

```bash
# Create test harness that aliases inkx → ink
mkdir -p node_modules/ink
echo 'export * from "inkx";' > node_modules/ink/index.js

# Run Ink's original tests
cd /tmp/ink && npm test

# Run Chalk's original tests
cd /tmp/chalk && npm test
```

---

## 3. Visual Testing Strategy

### 3.1 Snapshot-Based Visual Testing

Use inkx testing API with text snapshots:

```typescript
// tests/visual/visual.test.ts
import { createRenderer } from 'inkx/testing';
import { Box, Text } from 'inkx';

const render = createRenderer({ cols: 80, rows: 24 });

test('basic layout renders correctly', () => {
  const app = render(
    <Box flexDirection="column" width={40}>
      <Text color="green">Header</Text>
      <Box flexDirection="row">
        <Text>Left</Text>
        <Text>Right</Text>
      </Box>
    </Box>
  );

  expect(app.text).toMatchSnapshot();
});
```

Snapshot format (with ANSI codes visible):

```
// __snapshots__/visual.test.ts.snap
exports[`basic layout renders correctly 1`] = `
"\u001B[32mHeader\u001B[39m
Left                Right               "
`;
```

### 3.2 Cross-Terminal Visual Testing

Different terminals render ANSI differently. Use PTY-based testing:

```typescript
// tests/visual/terminals/cross-terminal.test.ts
import { spawn } from "node-pty"
import { toMatchImageSnapshot } from "jest-image-snapshot"

const TERMINALS = [
  { name: "xterm", env: { TERM: "xterm-256color" } },
  { name: "vt100", env: { TERM: "vt100" } },
  { name: "dumb", env: { TERM: "dumb" } },
]

for (const terminal of TERMINALS) {
  test(`renders correctly in ${terminal.name}`, async () => {
    const pty = spawn("node", ["fixtures/test-app.js"], {
      env: { ...process.env, ...terminal.env },
      cols: 80,
      rows: 24,
    })

    const output = await captureOutput(pty, 1000)
    expect(output).toMatchSnapshot(`${terminal.name}`)
  })
}
```

### 3.3 tui-test Integration

Use Microsoft's tui-test for comprehensive E2E testing:

```typescript
// tests/visual/e2e.test.ts
import { Terminal } from "@anthropic-ai/tui-test"

test("interactive app works end-to-end", async () => {
  const terminal = new Terminal({
    command: "node",
    args: ["./fixtures/interactive-app.js"],
    cols: 80,
    rows: 24,
  })

  await terminal.waitForText("Select an option:")
  await terminal.write("j") // Move down
  await terminal.write("\r") // Enter

  await expect(terminal).toMatchSnapshot()
})
```

### 3.4 Visual Diff Tool

Create a visual diff utility for manual inspection:

```bash
# Compare Inkx output vs Ink output side-by-side
bun run visual-diff tests/fixtures/complex-layout.tsx

┌─────────────────────────────────────┬─────────────────────────────────────┐
│ Ink (reference)                     │ Inkx (current)                      │
├─────────────────────────────────────┼─────────────────────────────────────┤
│ ┌────────────────────────────────┐  │ ┌────────────────────────────────┐  │
│ │ Header                         │  │ │ Header                         │  │
│ ├────────────────────────────────┤  │ ├────────────────────────────────┤  │
│ │ Content here                   │  │ │ Content here                   │  │
│ └────────────────────────────────┘  │ └────────────────────────────────┘  │
└─────────────────────────────────────┴─────────────────────────────────────┘
                                        ✓ MATCH
```

---

## 4. Performance Testing Strategy

### 4.1 Benchmark Suite

```typescript
// tests/perf/render.bench.ts
import { bench, group, run } from 'mitata';
import { render as inkRender } from 'ink';
import { render as inkxRender } from 'inkx';
import { ComplexLayout } from './fixtures/complex-layout';

group('Initial render', () => {
  bench('Ink', () => inkRender(<ComplexLayout />));
  bench('Inkx', () => inkxRender(<ComplexLayout />));
});

group('Re-render (state change)', () => {
  // Setup: render once, then benchmark updates
  const { rerender } = inkxRender(<ComplexLayout count={0} />);

  bench('Inkx rerender', () => {
    rerender(<ComplexLayout count={Math.random()} />);
  });
});

group('Layout computation', () => {
  bench('Yoga layout (100 nodes)', () => {
    computeLayout(buildTree(100));
  });

  bench('Yoga layout (1000 nodes)', () => {
    computeLayout(buildTree(1000));
  });
});

await run({ avg: true, json: true });
```

### 4.2 Performance Targets

| Metric                   | Target | Ink Baseline |
| ------------------------ | ------ | ------------ |
| Initial render (simple)  | < 5ms  | 3ms          |
| Initial render (complex) | < 20ms | 15ms         |
| Re-render (diff)         | < 2ms  | 2ms          |
| Layout (100 nodes)       | < 1ms  | 0.5ms        |
| Memory (idle)            | < 10MB | 8MB          |
| Memory (1000 nodes)      | < 50MB | 40MB         |

### 4.3 Performance Regression Detection

```yaml
# .github/workflows/perf.yml
- name: Run benchmarks
  run: bun run bench --json > bench-results.json

- name: Compare with baseline
  run: |
    bun run scripts/compare-bench.js \
      bench-results.json \
      baseline/bench-results.json \
      --threshold=1.2  # 20% regression threshold
```

### 4.4 Continuous Performance Monitoring

```typescript
// scripts/perf-monitor.ts
// Run nightly, track trends over time

const METRICS = ["render_simple_p50", "render_complex_p50", "memory_peak", "layout_100_nodes"]

async function recordMetrics() {
  const results = await runBenchmarks()

  // Store in SQLite or JSON for trending
  await db.insert("perf_metrics", {
    timestamp: new Date(),
    commit: process.env.GITHUB_SHA,
    ...results,
  })

  // Alert if regression detected
  const baseline = await db.getBaseline()
  for (const metric of METRICS) {
    if (results[metric] > baseline[metric] * 1.2) {
      console.error(`REGRESSION: ${metric} is ${results[metric]}ms (was ${baseline[metric]}ms)`)
      process.exit(1)
    }
  }
}
```

---

## 5. Test Infrastructure

### 5.1 inkx-testing-library

Inkx provides a Playwright-inspired testing API with **auto-refreshing locators**:

```typescript
import { createRenderer } from 'inkx/testing';
import { Box, Text } from 'inkx';

const render = createRenderer({ cols: 80, rows: 24 });

test('renders and responds to input', async () => {
  const app = render(
    <Box testID="main">
      <Text>Hello</Text>
    </Box>
  );

  // Plain text assertions (no ANSI)
  expect(app.text).toContain('Hello');

  // Auto-refreshing locators - same object, fresh results
  expect(app.getByTestId('main').boundingBox()?.width).toBe(80)
  expect(app.getByText('Hello').count()).toBe(1);

  // Playwright-style keyboard input
  await app.press('ArrowDown');
  await app.press('Enter');

  // Debug output
  app.debug();
});

test('another test', () => {
  // Previous render is auto-cleaned when render() is called again
  const app = render(<Text>Fresh start</Text>);
  expect(app.text).toContain('Fresh start');
});
```

**Key features:**

- `app.text` — plain text output (no ANSI codes)
- `app.getByTestId()` / `app.getByText()` — auto-refreshing locators
- `app.locator('[selector]')` — CSS-style attribute selectors
- `app.press()` — async keyboard input
- `app.term` — terminal buffer access
- Auto-cleanup: Each `render()` call automatically unmounts the previous render

### 5.2 Test Fixtures

```typescript
// tests/fixtures/index.ts
export { SimpleBox } from "./simple-box"
export { ComplexLayout } from "./complex-layout"
export { NestedFlex } from "./nested-flex"
export { InteractiveForm } from "./interactive-form"
export { LargeList } from "./large-list" // 1000+ items
export { UnicodeContent } from "./unicode-content"
export { ChalkStyledContent } from "./chalk-styled"
```

### 5.3 CI Pipeline

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test tests/unit

  compat-ink:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test tests/compat/ink
      - run: bun run scripts/compat-report.js

  compat-chalk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test tests/compat/chalk

  visual:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test tests/visual
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: visual-diff
          path: tests/visual/__diff__/

  perf:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run bench --json > bench.json
      - run: bun run scripts/compare-bench.js bench.json

  # Matrix test across Node versions and OS
  cross-platform:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: [18, 20, 22]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - run: npm install
      - run: npm test
```

---

## 6. Development Workflow

### 6.1 TDD Cycle

```bash
# 1. Pick a failing Ink test
bun test tests/compat/ink/flex.test.tsx --watch

# 2. Implement until it passes
# ... edit src/components/Box.tsx ...

# 3. Check for regressions
bun test tests/compat/ink

# 4. Update compatibility status
bun run scripts/update-compat-status.js
```

### 6.2 Visual Development Mode

```bash
# Live preview of test fixtures
bun run dev:visual

# Opens split-pane terminal:
# Left: Ink rendering
# Right: Inkx rendering
# Bottom: Diff status
```

### 6.3 Quick Verification Commands

```bash
# Fast feedback loop
bun test:fast           # Unit tests only (~2s)
bun test:compat         # Ink/Chalk compat (~10s)
bun test:visual         # Visual snapshots (~5s)
bun bench               # Performance (~30s)
bun test:all            # Everything (~60s)

# Check specific compatibility
bun test:ink-flex       # Just flexbox tests
bun test:chalk          # Just Chalk tests
```

---

## 7. Compatibility Dashboard

Create a live dashboard showing test status:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Inkx Compatibility Dashboard                                       v0.1.0  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Ink API Compatibility                                                      │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  Components        [████████████████████] 100%  Box, Text, Newline, Spacer  │
│  Flexbox Layout    [████████████████░░░░]  80%  Missing: flex-wrap         │
│  Hooks             [████████████░░░░░░░░]  60%  useInput, useStdout ✓      │
│  Focus System      [░░░░░░░░░░░░░░░░░░░░]   0%  Not started                │
│                                                                             │
│  Chalk Compatibility                                                        │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  Basic Styles      [████████████████████] 100%  All modifiers work         │
│  Colors            [████████████████████] 100%  16, 256, RGB               │
│  Nesting           [████████████████████] 100%  Proper reset codes         │
│                                                                             │
│  Performance vs Ink                                                         │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  Initial Render    [█████████░░░░░░░░░░░]  0.9x  (Inkx: 4.5ms, Ink: 5ms)   │
│  Re-render         [████████████████████]  1.2x  (Inkx: 1.5ms, Ink: 1.8ms) │
│  Memory            [██████████████░░░░░░]  1.1x  (Inkx: 11MB, Ink: 10MB)   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Additional Test Categories

### 8.1 Unicode Test Suite

Terminal Unicode handling is complex. Test comprehensively:

```typescript
// tests/unicode/unicode.test.ts
import { createRenderer } from 'inkx/testing';
import { Box, Text } from 'inkx';

const render = createRenderer({ cols: 80, rows: 24 });

describe('Unicode handling', () => {
  describe('Wide characters (CJK)', () => {
    test('Chinese characters take 2 cells', () => {
      const app = render(
        <Box width={10}>
          <Text>你好世界</Text>
        </Box>
      );
      // "你好世界" = 8 cells (4 chars × 2)
      expect(app.text).toMatchSnapshot();
    });

    test('Mixed ASCII and CJK', () => {
      const app = render(
        <Box width={10}>
          <Text>Hi你好</Text>
        </Box>
      );
      // "Hi" = 2 cells, "你好" = 4 cells = 6 total
      expect(app.text).toMatchSnapshot();
    });

    test('CJK truncation respects cell width', () => {
      const app = render(
        <Box width={5}>
          <Text>你好世界</Text>
        </Box>
      );
      // Can fit 2 CJK chars (4 cells) + ellipsis
      expect(app.text).toMatchSnapshot();
    });
  });

  describe('Emoji', () => {
    test('Basic emoji', () => {
      const { lastFrame } = render(<Text>Hello 👋</Text>);
      expect(lastFrame()).toContain('👋');
    });

    test('Emoji with skin tone', () => {
      const { lastFrame } = render(<Text>👋🏽</Text>);
      expect(lastFrame()).toMatchSnapshot();
    });

    test('Emoji ZWJ sequence', () => {
      const { lastFrame } = render(<Text>👨‍👩‍👧‍👦</Text>);
      // Family emoji is single grapheme
      expect(lastFrame()).toMatchSnapshot();
    });

    test('Flag emoji', () => {
      const { lastFrame } = render(<Text>🇺🇸🇬🇧</Text>);
      expect(lastFrame()).toMatchSnapshot();
    });
  });

  describe('Combining characters', () => {
    test('Combining acute accent', () => {
      const { lastFrame } = render(<Text>café</Text>);
      // é can be e + combining acute
      expect(lastFrame()).toBe('café');
    });

    test('Multiple combining marks', () => {
      const { lastFrame } = render(<Text>ḁ̴̢̛</Text>);
      // Heavily combined character
      expect(lastFrame()).toMatchSnapshot();
    });
  });

  describe('RTL text', () => {
    test('Arabic text', () => {
      const { lastFrame } = render(<Text>مرحبا</Text>);
      expect(lastFrame()).toMatchSnapshot();
    });

    test('Hebrew text', () => {
      const { lastFrame } = render(<Text>שלום</Text>);
      expect(lastFrame()).toMatchSnapshot();
    });
  });
});
```

### 8.2 Memory Leak Tests

Long-running TUI apps must not leak:

```typescript
// tests/memory/memory.test.ts
import { render } from 'inkx';

describe('Memory management', () => {
  test('no leak on rapid re-renders', async () => {
    const initialMemory = process.memoryUsage().heapUsed;

    const { rerender, unmount } = render(<Box><Text>Initial</Text></Box>);

    // Rapid re-renders
    for (let i = 0; i < 10000; i++) {
      rerender(<Box><Text>Render {i}</Text></Box>);
    }

    // Force GC
    if (global.gc) global.gc();

    const finalMemory = process.memoryUsage().heapUsed;
    const growth = finalMemory - initialMemory;

    // Allow some growth, but not unbounded
    expect(growth).toBeLessThan(10 * 1024 * 1024); // 10MB max

    unmount();
  });

  test('no leak on mount/unmount cycles', async () => {
    const initialMemory = process.memoryUsage().heapUsed;

    for (let i = 0; i < 1000; i++) {
      const { unmount } = render(
        <Box>
          <Text>Mount {i}</Text>
          <Box><Text>Nested</Text></Box>
        </Box>
      );
      unmount();
    }

    if (global.gc) global.gc();

    const finalMemory = process.memoryUsage().heapUsed;
    const growth = finalMemory - initialMemory;

    expect(growth).toBeLessThan(5 * 1024 * 1024); // 5MB max

  });

  test('useLayout subscriptions cleaned up', async () => {
    function LayoutUser() {
      const { width } = useLayout();
      return <Text>{width}</Text>;
    }

    const initialMemory = process.memoryUsage().heapUsed;

    for (let i = 0; i < 1000; i++) {
      const { unmount } = render(<LayoutUser />);
      unmount();
    }

    if (global.gc) global.gc();

    const finalMemory = process.memoryUsage().heapUsed;
    const growth = finalMemory - initialMemory;

    expect(growth).toBeLessThan(2 * 1024 * 1024); // 2MB max
  });
});
```

### 8.3 Flicker Tests

Detect visual regressions from double-render:

```typescript
// tests/visual/flicker.test.ts
describe('No visual flicker', () => {
  test('useLayout components render without flicker', async () => {
    const frames: string[] = [];

    function Header() {
      const { width } = useLayout();
      return <Text>{'='.repeat(width || 0)}</Text>;
    }

    const { lastFrame } = render(<Header />, {
      onRender: (frame) => frames.push(frame),
    });

    // Wait for layout
    await new Promise(r => setTimeout(r, 50));

    // First frame might be empty (width=0), but should not be visible
    // Only the final frame should be "painted"
    const visibleFrames = frames.filter(f => f.trim() !== '');

    // Should have exactly one visible frame
    expect(visibleFrames.length).toBe(1);
    expect(visibleFrames[0]).toMatch(/={10,}/);
  });

  test('rapid state changes coalesce', async () => {
    const frames: string[] = [];
    let count = 0;

    function Counter() {
      return <Text>Count: {count}</Text>;
    }

    const { rerender } = render(<Counter />, {
      onRender: (frame) => frames.push(frame),
    });

    // Synchronous rapid updates
    for (let i = 0; i < 100; i++) {
      count = i;
      rerender(<Counter />);
    }

    // Wait for coalescing
    await new Promise(r => setTimeout(r, 50));

    // Should NOT have 100 frames
    expect(frames.length).toBeLessThan(10);

    // Final frame should show 99
    expect(frames[frames.length - 1]).toContain('99');
  });

  test('first render shows content, not zeros', async () => {
    const frames: string[] = [];

    function Card() {
      const { width } = useLayout();
      // Graceful degradation for width=0
      if (width === 0) return null;
      return <Text>{'#'.repeat(width)}</Text>;
    }

    render(
      <Box width={10}>
        <Card />
      </Box>,
      { onRender: (frame) => frames.push(frame) }
    );

    await new Promise(r => setTimeout(r, 50));

    // No frame should show literal "0" from width
    const badFrames = frames.filter(f => f.includes('width: 0') || f === '');
    expect(badFrames.length).toBe(0);
  });
});
```

### 8.4 Long-Running App Tests

Test stability over time:

```typescript
// tests/stability/long-running.test.ts
describe('Long-running stability', () => {
  test('runs for 60 seconds without crash', async () => {
    let ticks = 0;

    function Clock() {
      const [time, setTime] = useState(Date.now());

      useEffect(() => {
        const interval = setInterval(() => {
          setTime(Date.now());
          ticks++;
        }, 100);
        return () => clearInterval(interval);
      }, []);

      return <Text>{new Date(time).toISOString()}</Text>;
    }

    const { unmount } = render(<Clock />);

    // Run for 60 seconds
    await new Promise(r => setTimeout(r, 60000));

    expect(ticks).toBeGreaterThan(500); // Should have ticked ~600 times

    unmount();
  }, 70000); // 70s timeout

  test('handles terminal resize', async () => {
    const { stdout } = render(<Box width="100%"><Text>Resize me</Text></Box>);

    // Simulate resize
    process.stdout.emit('resize');

    await new Promise(r => setTimeout(r, 100));

    // Should not crash
    expect(true).toBe(true);
  });
});
```

---

## 9. Auto-Refreshing Locators

inkx provides Playwright-inspired locators that **auto-refresh on every access**, eliminating stale reference bugs.

### 9.1 Quick Start

```typescript
import { createRenderer } from "inkx/testing";
import { Box, Text } from "inkx";

const render = createRenderer({ cols: 80, rows: 24 });

test("locators auto-refresh after state changes", async () => {
  const app = render(
    <Box>
      <Text testID="cursor">Task 1</Text>
      <Text>Task 2</Text>
    </Box>
  );

  // Get a locator (lazy - doesn't query yet)
  const cursor = app.getByTestId("cursor");

  // First access queries the current tree
  expect(cursor.textContent()).toBe("Task 1");

  // After input, same locator queries fresh tree
  await app.press("j");
  expect(cursor.textContent()).toBe("Task 2");  // Auto-refreshed!
});
```

### 9.2 Querying Elements

```tsx
const app = render(
  <Box testID="sidebar">
    <Text testID="header">Tasks</Text>
    <Text testID="task-1" data-status="done">
      Task 1
    </Text>
  </Box>,
)

// By testID
expect(app.getByTestId("sidebar").count()).toBe(1)

// By text content
expect(app.getByText("Task 1").count()).toBe(1)
expect(app.getByText(/Task \d/).count()).toBe(1) // regex

// CSS-style attribute selectors
expect(app.locator('[data-status="done"]').textContent()).toBe("Task 1")
```

### 9.3 Attribute Selectors

CSS-like selectors for flexible querying:

```typescript
// Presence: [attr]
app.locator("[data-selected]")

// Exact match: [attr="value"]
app.locator('[data-status="done"]')

// Prefix: [attr^="prefix"]
app.locator('[testID^="task-"]')

// Suffix: [attr$="suffix"]
app.locator('[testID$="-column"]')

// Contains: [attr*="substring"]
app.locator('[testID*="task"]')
```

### 9.4 Layout Assertions

Use `boundingBox()` for position and size:

```typescript
const sidebar = app.getByTestId("sidebar")
expect(sidebar.boundingBox()?.x).toBe(0) // At left edge
expect(sidebar.boundingBox()?.width).toBe(20) // 20 chars wide
```

### 9.5 AutoLocator API

| Method               | Returns               | Description                            |
| -------------------- | --------------------- | -------------------------------------- |
| `getByText(text)`    | `AutoLocator`         | Find by text content (string or regex) |
| `getByTestId(id)`    | `AutoLocator`         | Find by testID prop                    |
| `locator(selector)`  | `AutoLocator`         | CSS-like attribute selector            |
| `first()`            | `AutoLocator`         | First matching element                 |
| `last()`             | `AutoLocator`         | Last matching element                  |
| `nth(index)`         | `AutoLocator`         | Element at index                       |
| `filter(options)`    | `AutoLocator`         | Filter matches                         |
| `resolve()`          | `InkxNode \| null`    | Get first matching node                |
| `resolveAll()`       | `InkxNode[]`          | Get all matching nodes                 |
| `count()`            | `number`              | Count matches                          |
| `textContent()`      | `string`              | Get text content                       |
| `getAttribute(name)` | `string \| undefined` | Get attribute value                    |
| `boundingBox()`      | `Rect \| null`        | Get {x, y, width, height}              |
| `isVisible()`        | `boolean`             | Check if has dimensions                |

---

## 10. References

- [Ink Test Suite](https://github.com/vadimdemedes/ink/tree/master/test) - 31 test files
- [Ink Testing Library](https://github.com/vadimdemedes/ink-testing-library) - Test utilities
- [Chalk Test Suite](https://github.com/chalk/chalk/tree/main/test) - 6 test files
- [Microsoft tui-test](https://github.com/microsoft/tui-test) - E2E terminal testing
- [xterm-benchmark](https://github.com/xtermjs/xterm-benchmark) - Performance benchmarking
- [AVA](https://github.com/avajs/ava) - Test framework used by Ink/Chalk
- [mitata](https://github.com/evanwashere/mitata) - Benchmarking library
- [Playwright Locators](https://playwright.dev/docs/locators) - Inspiration for InkxLocator API
