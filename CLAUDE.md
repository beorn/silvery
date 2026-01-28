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
import { render, renderSync, setLayoutEngine, initYogaEngine, createFlexxEngine } from 'inkx'

// Term primitives (re-exported from @beorn/chalkx)
import { createTerm, patchConsole, type Term, type PatchedConsole } from 'inkx'

// Testing
import { createTestRenderer, createLocator, bufferToText, stripAnsi, normalizeFrame } from 'inkx/testing'
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

### Testing Components

```tsx
import { createTestRenderer, createLocator } from 'inkx/testing'
import { Text, Box } from 'inkx'

const render = createTestRenderer({ columns: 80, rows: 24 })

test('renders content', () => {
  const { lastFrame, lastFrameText, getContainer } = render(
    <Box testID="main">
      <Text>Hello</Text>
    </Box>
  )

  // String assertions
  expect(lastFrameText()).toContain('Hello')

  // DOM-style queries
  const locator = createLocator(getContainer())
  expect(locator.getByText('Hello').count()).toBe(1)
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

## Key Exports

| Export | Description |
|--------|-------------|
| `render(term, element)` | Render with Term - NewWay |
| `renderSync(term, element)` | Sync render with Term |
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
