# Terminal Styling Library Comparison

How does ansi compare to other terminal styling libraries?

## Feature Matrix

| Feature                 | chalk | ansis | picocolors | colorette | kleur | ansi        |
| ----------------------- | ----- | ----- | ---------- | --------- | ----- | ------------- |
| **Colors**              |
| Basic colors (16)       | ✓     | ✓     | ✓          | ✓         | ✓     | ✓ (via chalk) |
| 256 colors              | ✓     | ✓     | ✗          | ✗         | ✗     | ✓ (via chalk) |
| Truecolor (RGB)         | ✓     | ✓     | ✗          | ✗         | ✗     | ✓ (via chalk) |
| **Modifiers**           |
| Bold, italic, dim       | ✓     | ✓     | ✓          | ✓         | ✓     | ✓ (via chalk) |
| Strikethrough           | ✓     | ✓     | ✓          | ✓         | ✓     | ✓ (via chalk) |
| Standard underline      | ✓     | ✓     | ✓          | ✓         | ✓     | ✓             |
| **Extended Underlines** |
| Curly/wavy              | ✗     | ✗     | ✗          | ✗         | ✗     | ✓             |
| Dotted                  | ✗     | ✗     | ✗          | ✗         | ✗     | ✓             |
| Dashed                  | ✗     | ✗     | ✗          | ✗         | ✗     | ✓             |
| Double                  | ✗     | ✗     | ✗          | ✗         | ✗     | ✓             |
| Underline color         | ✗     | ✗     | ✗          | ✗         | ✗     | ✓             |
| **Links**               |
| OSC 8 hyperlinks        | ✗     | ✗     | ✗          | ✗         | ✗     | ✓             |
| **Other**               |
| Graceful fallback       | N/A   | N/A   | N/A        | N/A       | N/A   | ✓             |
| Terminal detection      | ✓     | ✓     | ✓          | ✓         | ✓     | ✓             |
| Chaining API            | ✓     | ✓     | ✗          | ✗         | ✓     | ✓ (via chalk) |

## Why the Gap?

### chalk

The chalk maintainer's position on extended underlines ([GitHub Issue #604](https://github.com/chalk/chalk/issues/604)):

> "No. It's not widely supported in terminals... We'll consider adding it, but I'd like to see some more terminal adoption first."

As of 2025, support has expanded significantly:

- Ghostty, Kitty, WezTerm, iTerm2, Foot, VTE-based terminals

ansi fills this gap while remaining a thin layer on chalk.

### Other Libraries

picocolors, colorette, and kleur focus on **size and speed** over features. They intentionally omit advanced styling to minimize bundle size.

ansis focuses on **performance** and API ergonomics but hasn't added extended underlines.

## Size Comparison

| Package    | Size (dist) | Dependencies |
| ---------- | ----------- | ------------ |
| picocolors | ~2 KB       | 0            |
| colorette  | ~3 KB       | 0            |
| kleur      | ~4 KB       | 0            |
| ansis      | ~3 KB       | 0            |
| chalk      | ~5 KB       | 0            |
| ansi     | ~4 KB       | 1 (chalk)    |

ansi adds minimal overhead (~4 KB) on top of chalk.

## Performance

ansi performance is essentially chalk's performance because:

- Extended underlines are simple string concatenation
- Terminal detection is cached (runs once)
- No runtime overhead for standard chalk operations

For performance-critical applications with millions of style operations, consider using chalk directly for colors and ansi only for extended features.

## When to Use ansi

**Use ansi when you need:**

- Curly underlines (spell check, error highlighting)
- Colored underlines (semantic highlighting)
- Clickable hyperlinks in terminal output
- All of chalk's features plus extensions

**Use chalk alone when:**

- You only need colors and basic modifiers
- You're not targeting modern terminals

**Use picocolors/colorette when:**

- Bundle size is critical
- You only need basic colors
- Performance is more important than features

## Migration from chalk

ansi is a drop-in extension of chalk:

```ts
// Before
import chalk from "chalk"
console.log(chalk.red("error"))

// After (option 1: add features, keep chalk imports)
import chalk from "chalk"
import { curlyUnderline } from "@hightea/ansi"
console.log(chalk.red("error"))
console.log(curlyUnderline("misspelled"))

// After (option 2: single import)
import { chalk, curlyUnderline } from "@hightea/ansi"
console.log(chalk.red("error"))
console.log(curlyUnderline("misspelled"))
```

No breaking changes. Add ansi alongside chalk and use extended features as needed.
