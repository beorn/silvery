# inkx - Terminal UI React Framework

React-based terminal UI framework with layout feedback. Ink-compatible API with components that know their size.

## Imports

All exports are **named exports**:

```tsx
// Components
import { Box, Text, Newline, Spacer, Static, Console } from 'inkx'

// Hooks
import { useContentRect, useScreenRect, useInput, useApp, useTerm, useConsole } from 'inkx'

// Render functions
import { render, renderSync, renderString, setLayoutEngine, initYogaEngine, createFlexxEngine } from 'inkx'

// Term primitives (re-exported from @beorn/chalkx)
import { createTerm, patchConsole, type Term, type PatchedConsole } from 'inkx'

// Testing
import { createTestRenderer, bufferToText, stripAnsi, keyToAnsi, debugTree } from 'inkx/testing'
```

## Common Patterns

### Basic App with Term

```tsx
import { render, Box, Text, useInput, useApp, useTerm, createTerm } from 'inkx'

function App() {
  const { exit } = useApp()
  const term = useTerm()

  useInput((input, key) => {
    if (input === 'q' || key.escape) exit()
  })

  return (
    <Box flexDirection="column">
      <Text>{term.green('Press q to quit')}</Text>
    </Box>
  )
}

// NewWay: render with term
using term = createTerm()
await render(term, <App />)
```

### Console Capture

```tsx
import { render, Box, Text, Console, createTerm, patchConsole, type PatchedConsole } from 'inkx'

function App({ console: patched }: { console: PatchedConsole }) {
  return (
    <Box flexDirection="column">
      <Console console={patched} />
      <Text>Status: running</Text>
    </Box>
  )
}

{
  using term = createTerm()
  using patched = patchConsole(console)
  using app = await render(term, <App console={patched} />)

  // Console.log calls now appear in <Console />
  console.log('This appears above the status line')

  await app.run()
}
```

### Static Rendering (No Terminal)

For one-shot CLI output, CI, or piped output where you don't need a terminal:

```tsx
import { renderString, Box, Text } from 'inkx'

// Basic usage - returns string with ANSI codes
const output = await renderString(<Summary stats={stats} />)
console.log(output)

// Plain text (no ANSI codes) for piped output
const plain = await renderString(<Report />, { plain: true })

// Custom width for layout
const wide = await renderString(<Table />, { width: 120 })
```

### Layout Feedback (Main Feature)

```tsx
import { Box, Text, useContentRect } from 'inkx'

function ResponsiveCard() {
  // Components know their size - no width prop threading needed
  const { width, height } = useContentRect()
  return <Text>{`Size: ${width}x${height}`}</Text>
}
```

### Access Term in Components

```tsx
import { useTerm } from 'inkx'

function ColoredOutput() {
  const term = useTerm()

  // Use term's capabilities
  if (term.hasColor()) {
    return <Text>{term.green('✓')} Passed</Text>
  }
  return <Text>[OK] Passed</Text>
}
```

### Testing Components (App API)

```tsx
import { createTestRenderer } from 'inkx/testing'
import { Text, Box } from 'inkx'

const render = createTestRenderer({ columns: 80, rows: 24 })

test('renders content', () => {
  const app = render(
    <Box testID="main">
      <Text>Hello</Text>
    </Box>
  )

  // Plain text (no ANSI)
  expect(app.text).toContain('Hello')

  // Auto-refreshing locators (no stale locator problem!)
  expect(app.getByText('Hello').count()).toBe(1)
  expect(app.getByTestId('main').boundingBox()?.width).toBe(80)

  // Debug output
  app.debug()
})
```

### Keyboard Input Testing

Use `app.press()` for Playwright-style keyboard input:

```tsx
import { createTestRenderer } from 'inkx/testing'

const render = createTestRenderer({ columns: 80, rows: 24 })

test('handles keyboard input', async () => {
  const app = render(<MyComponent />)

  // Single keys (awaitable, chainable)
  await app.press('Enter')
  await app.press('Escape')
  await app.press('ArrowUp')
  await app.press('ArrowDown')
  await app.press('Tab')

  // Modifier combinations
  await app.press('Control+c')
  await app.press('Control+d')
  await app.press('Shift+Tab')

  expect(app.text).toContain('expected result')
})
```

### Auto-refreshing Locators

The key innovation: locators re-evaluate on every access, eliminating stale locator bugs:

```tsx
test('locators auto-refresh after input', async () => {
  const app = render(<Board />)
  const cursor = app.locator('[data-cursor]')

  // Same locator object, but result updates after state change
  expect(cursor.textContent()).toBe('item1')
  await app.press('j')
  expect(cursor.textContent()).toBe('item2')  // Auto-refreshed!
})
```

### Terminal Access

```tsx
test('inspect terminal buffer', () => {
  const app = render(<MyComponent />)

  // Screen-space access via app.term
  const cell = app.term.cell(10, 5)
  const node = app.term.nodeAt(10, 5)

  console.log(app.term.text)
  console.log(app.term.columns, app.term.rows)
})
```

### Debugging Tests

```tsx
import { createTestRenderer, debugTree } from 'inkx/testing'

const render = createTestRenderer({ columns: 80, rows: 24 })

test('debugging example', () => {
  const app = render(<MyComponent />)

  // Print current frame
  app.debug()

  // Get screenshot
  console.log(app.screenshot())
})
```

## Anti-Patterns

### Wrong: Not passing term to render

```tsx
// WRONG - useTerm() will throw
await render(<App />)

// RIGHT - pass term first
using term = createTerm()
await render(term, <App />)
```

### Wrong: Mixing chalk backgrounds with Box backgroundColor

```tsx
// WRONG - causes visual artifacts, inkx throws by default
<Box backgroundColor="cyan">
  <Text>{chalk.bgBlack('text')}</Text>
</Box>

// RIGHT - use bgOverride from @beorn/chalkx if intentional
import { bgOverride } from '@beorn/chalkx'
<Box backgroundColor="cyan">
  <Text>{bgOverride(chalk.bgBlack('text'))}</Text>
</Box>
```

### Wrong: Not awaiting async render

```tsx
// WRONG - render() is async
render(term, <App />)

// RIGHT
await render(term, <App />)
```

### Wrong: Using old createLocator pattern

```tsx
// WRONG - stale locators, manual refresh needed
const { getContainer } = render(<App />)
const locator = createLocator(getContainer())
stdin.write('j')
const freshLocator = createLocator(getContainer())  // Must manually refresh!

// RIGHT - auto-refreshing locators
const app = render(<App />)
const cursor = app.locator('[data-cursor]')
await app.press('j')
expect(cursor.textContent()).toBe('item2')  // Same locator, fresh result!
```

## Key Exports

| Export | Description |
|--------|-------------|
| `render(term, element)` | Render with Term - NewWay |
| `renderSync(term, element)` | Sync render with Term |
| `renderString(element, opts)` | Static render to string (no terminal needed) |
| `Console` | Renders captured console output |
| `useTerm()` | Access Term in components |
| `useConsole(patched)` | Subscribe to console entries |
| `Box`, `Text`, etc | UI components |
| `useContentRect()` | Get component dimensions |
| `useInput()` | Keyboard input |

## Key Differences from Ink

1. **Term-first rendering**: `render(term, <App />)` - term is required
2. **Layout feedback**: `useContentRect()` / `useScreenRect()` give actual dimensions
3. **Term context**: `useTerm()` provides terminal capabilities to components
4. **Console capture**: `<Console />` component displays captured output
5. **Named exports only**: No default export
