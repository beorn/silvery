# Migrate from Chalk

Silvery includes a Chalk compatibility layer via `silvery/chalk`. If your terminal app uses Chalk for styling, you can switch to Silvery's built-in styling with minimal changes.

## Quick Start

### Step 1: Install Silvery

::: code-group

```bash [bun]
bun add silvery
```

```bash [npm]
npm install silvery
```

```bash [pnpm]
pnpm add silvery
```

```bash [yarn]
yarn add silvery
```

:::

### Step 2: Update Imports

```diff
- import chalk from 'chalk';
+ import chalk from 'silvery/chalk';
```

The `silvery/chalk` module provides a Chalk-compatible API. Your existing chalk-styled strings work unchanged inside Silvery's `<Text>` component:

```tsx
import chalk from "silvery/chalk"
import { Text } from "silvery"

// Chalk-style strings work inside Text
<Text>{chalk.red.bold("Error!")}</Text>

// Or use Text's built-in style props directly
<Text color="red" bold>Error!</Text>
```

## API Compatibility

| Chalk Feature     | silvery/chalk | Notes                        |
| ----------------- | ------------- | ---------------------------- |
| `chalk.red()`     | Supported     | All standard colors          |
| `chalk.bold()`    | Supported     | All modifiers                |
| `chalk.rgb()`     | Supported     | 24-bit color                 |
| `chalk.hex()`     | Supported     | Hex color codes              |
| `chalk.bgRed()`   | Supported     | Background colors            |
| Chaining          | Supported     | `chalk.red.bold.underline()` |
| Template literals | Supported     | `` chalk`{red text}` ``      |

## Why Switch?

- **Zero dependencies** -- Silvery's chalk compat is built-in, no extra package needed
- **Consistent theming** -- Use `$token` colors from `@silvery/theme` alongside chalk-style strings
- **Tree-shakeable** -- Only the styles you use end up in your bundle

## Using Theme Colors Instead

For new code, consider using Silvery's semantic theme tokens instead of hardcoded colors:

```tsx
import { Text, ThemeProvider } from "silvery"
import { presetTheme } from "@silvery/theme"

// Instead of chalk.red("Error")
<Text color="$error">Error!</Text>

// Instead of chalk.dim("secondary text")
<Text color="$mutedfg">Secondary text</Text>
```

Theme tokens adapt to the active palette -- your app looks correct in any theme without changing color values.

## See Also

- [Theming Guide](/guides/theming) -- Full theme system documentation
- [Components Guide](/guides/components) -- Text component styling props
- [Ink/Chalk Compatibility Reference](/reference/compatibility) -- Complete API mapping tables
