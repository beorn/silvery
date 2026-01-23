# Contributing to Inkx

Thank you for your interest in contributing to Inkx! This guide covers everything you need to get started.

## Development Setup

### Prerequisites

- [Bun](https://bun.sh/) v1.0 or later
- Node.js 18+ (for compatibility testing)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/beorn/inkx.git
cd inkx

# Install dependencies
bun install

# Run tests to verify setup
bun test tests/
```

### Available Scripts

| Script                       | Description                                 |
| ---------------------------- | ------------------------------------------- |
| `bun test tests/`            | Run all unit tests                          |
| `bun run test:fast`          | Run tests with 5s timeout (faster feedback) |
| `bun run test:compat`        | Run Ink compatibility tests                 |
| `bun run test:visual`        | Run Playwright visual regression tests      |
| `bun run test:visual:update` | Update visual regression snapshots          |
| `bun run typecheck`          | TypeScript type checking                    |
| `bun run lint`               | Run Biome linter                            |
| `bun run fix`                | Auto-fix lint and format issues             |
| `bun run bench`              | Run performance benchmarks                  |
| `bun run build`              | Build for distribution                      |

### Running Examples

```bash
bun run example:dashboard
bun run example:task-list
bun run example:kanban
bun run example:scroll
```

## Testing

### Running Tests

```bash
# Run all tests
bun test tests/

# Run specific test file
bun test tests/hooks.test.tsx

# Run tests in watch mode
bun test tests/ --watch

# Run with timeout (useful for debugging)
bun run test:fast
```

### Test File Conventions

- Test files are located in `tests/`
- Test files use the naming pattern `*.test.ts` or `*.test.tsx`
- Use `bun:test` for test utilities (`describe`, `test`, `expect`)

### Using createTestRenderer

Inkx provides a testing library with auto-cleanup between renders:

```tsx
import { createTestRenderer } from "inkx/testing";
import { Box, Text } from "inkx";

// Create a render function (default: 80 columns, 24 rows)
const render = createTestRenderer();

// Or with custom dimensions
const wideRender = createTestRenderer({ columns: 120, rows: 40 });

test("renders text", () => {
  const { lastFrame, rerender, stdin } = render(
    <Box>
      <Text>Hello</Text>
    </Box>,
  );

  expect(lastFrame()).toContain("Hello");

  // Send input to components using useInput
  stdin.write("q");

  // Re-render with new props
  rerender(
    <Box>
      <Text>World</Text>
    </Box>,
  );
});

test("another test", () => {
  // Previous render is auto-cleaned when render() is called again
  const { lastFrame } = render(<Text>Fresh start</Text>);
  expect(lastFrame()).toContain("Fresh start");
});

// Per-render dimension overrides
test("wide render", () => {
  const { lastFrame } = render(
    <Box width={100}>
      <Text>Wide</Text>
    </Box>,
    { columns: 120, rows: 24 },
  );
});
```

### Testing Utilities

```tsx
import {
  createTestRenderer,
  stripAnsi,
  normalizeFrame,
  waitFor,
} from "inkx/testing";

// Strip ANSI codes for easier assertions
const plainText = stripAnsi("\u001B[32mGreen\u001B[39m");
// => 'Green'

// Normalize frame output (strips ANSI, trims whitespace)
const normalized = normalizeFrame(frame);

// Wait for async conditions
await waitFor(() => lastFrame().includes("loaded"), { timeout: 1000 });
```

## Code Style

### Biome Configuration

This project uses [Biome](https://biomejs.dev/) for linting and formatting:

```bash
# Check for issues
bun run lint

# Auto-fix issues
bun run fix
```

Key style rules:

- **Indentation**: Tabs
- **Line width**: 100 characters
- **Quotes**: Single quotes
- **Semicolons**: Always required

### TypeScript

- Strict mode is enabled
- Avoid `any` types where possible
- Use `@ts-expect-error` with explanatory comments when necessary

### React Patterns

- Use functional components with hooks
- Prefer `useCallback` and `useMemo` for performance-critical paths
- Follow React's rules of hooks

```tsx
// Good: Clear hook usage
function MyComponent() {
  const { width } = useLayout();
  const [selected, setSelected] = useState(0);

  useInput((input, key) => {
    if (key.downArrow) setSelected((s) => s + 1);
  });

  return <Text>Width: {width}</Text>;
}
```

## Pull Request Process

### 1. Fork and Branch

```bash
# Fork the repo on GitHub, then:
git clone https://github.com/YOUR_USERNAME/inkx.git
cd inkx
git checkout -b feature/my-feature
```

### 2. Write Tests

- Add tests for new functionality
- Ensure existing tests still pass
- Aim for test coverage on public APIs

### 3. Run Quality Checks

```bash
# Must pass before submitting
bun run lint
bun run typecheck
bun test tests/
```

### 4. Commit Guidelines

Write clear, descriptive commit messages:

```
Add useLayout hook for dimension feedback

- Implements layout subscription system
- Components receive {width, height, x, y}
- Auto-unsubscribes on unmount
```

### 5. Open Pull Request

- Provide a clear description of changes
- Reference any related issues
- Include before/after screenshots for visual changes
- Describe how to test the changes

## Issue Reporting

### Bug Reports

When reporting bugs, please include:

1. **Description**: Clear explanation of the issue
2. **Reproduction steps**: Minimal code to reproduce
3. **Expected behavior**: What should happen
4. **Actual behavior**: What actually happens
5. **Environment**: Node/Bun version, OS, terminal

Example:

````markdown
## Bug: Text truncation breaks with emoji

### Reproduction

```tsx
<Box width={10}>
  <Text>Hello 👋 World</Text>
</Box>
```
````

### Expected

Text truncated to fit 10 columns with ellipsis

### Actual

Layout breaks, text overflows container

### Environment

- Bun 1.1.0
- macOS 14.0
- iTerm2 3.5

```

### Feature Requests

For feature requests, please include:

1. **Use case**: Why is this feature needed?
2. **Proposed API**: How would it work?
3. **Alternatives**: Other approaches considered

## Project Structure

```

inkx/
├── src/
│ ├── components/ # Box, Text, Newline, Spacer, Static
│ ├── hooks/ # useLayout, useInput, useApp, etc.
│ ├── testing/ # Test utilities (createTestRenderer)
│ ├── reconciler.ts # React reconciler
│ ├── pipeline.ts # Render pipeline
│ ├── buffer.ts # Terminal buffer
│ └── index.ts # Public exports
├── tests/
│ ├── compat/ # Ink compatibility tests
│ └── \*.test.tsx # Unit tests
├── examples/ # Example applications
├── docs/ # Documentation
└── e2e/ # Visual regression tests

```

## Getting Help

- Check existing [issues](https://github.com/beorn/inkx/issues)
- Read the [documentation](docs/)
- Look at [examples](examples/) for usage patterns

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
```
