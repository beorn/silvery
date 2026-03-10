# Smart ANSI Layering

Silvery does not pass ANSI escape sequences through to the terminal verbatim. Instead, it parses pre-styled text (chalk, hyperlinks, any ANSI source) into structured cell properties, then reconstructs optimal ANSI output during the output phase. This cell-buffer architecture is a key differentiator.

## How It Works

### Cell Buffer

Every cell in the terminal buffer stores structured style data:

```typescript
interface Cell {
  char: string; // The grapheme at this position
  fg: Color; // Foreground color (256-color index, RGB, or null)
  bg: Color; // Background color (separate from fg)
  underlineColor: Color; // Independent underline color (SGR 58)
  attrs: CellAttrs; // bold, dim, italic, underline, strikethrough, etc.
  wide: boolean; // CJK/emoji double-width flag
  hyperlink?: string; // OSC 8 hyperlink URL
}
```

### Parse Phase

When text containing ANSI sequences reaches the render pipeline, `parseAnsiText()` decomposes it into `StyledSegment` objects -- each with explicit fg, bg, bold, italic, underline style, underline color, and hyperlink URL. These properties are written into individual cells in the buffer.

### Output Phase

The output phase reads the cell buffer and produces minimal ANSI escape sequences. It diffs the current buffer against the previous frame's buffer, emitting only changed cells. Style transitions between adjacent cells use cached SGR sequences -- with ~15-50 unique styles per TUI, all `(oldStyle, newStyle)` transition strings are cached after the first few frames.

## Benefits

### 1. Style Composition

Pre-styled text (chalk, kleur, etc.) composes with silvery's style props automatically. Each cell's properties are resolved independently -- no manual reset management.

```tsx
import chalk from "chalk";

// chalk.red applies to "red", silvery blue applies to "and blue"
<Text color="blue">{chalk.red("red")} and blue</Text>;
```

The parser extracts chalk's red SGR into the cell's `fg` property for "red", then silvery's `color="blue"` sets `fg` for "and blue". No reset codes leak between them.

```tsx
// Nested styles compose without conflict
<Text bold>{chalk.italic("both")} just bold</Text>
// "both" gets bold (from Text) + italic (from chalk)
// "just bold" gets bold only
```

### 2. Background Independence

Foreground and background are separate cell properties that compose independently. Parent backgrounds cascade to children automatically through the render tree -- not through ANSI state.

```tsx
<Box backgroundColor="blue">
  <Text color="white">White on blue</Text>
  <Text color="yellow">Yellow on blue</Text>
  {/* Both inherit blue bg from the Box */}
</Box>
```

Background inheritance uses `findInheritedBg()` to walk the render tree, not buffer reads. This means backgrounds are deterministic regardless of render order or incremental rendering state.

### 3. Overlapping Elements

Absolute-positioned boxes override underlying styles cell-by-cell. The buffer stores the final composited state at each position.

```tsx
<Box position="relative" width={40} height={5}>
  <Box backgroundColor="gray">
    <Text>Background content behind the overlay</Text>
  </Box>
  <Box position="absolute" backgroundColor="red">
    <Text color="white">Overlay</Text>
  </Box>
</Box>
```

The overlay's cells replace the background's cells at their positions. No manual z-index or ANSI state management needed.

### 4. Minimal Output

Diff rendering only re-emits changed cells. Pre-styled text participates fully in the diff -- if chalk-styled text did not change between frames, zero bytes are emitted for those cells.

| Scenario                | Full Render | Incremental | Reduction |
| ----------------------- | ----------- | ----------- | --------- |
| 10 rows, 1 cell changed | 1,196 bytes | 42 bytes    | 28x       |
| 30 rows, 1 cell changed | 3,540 bytes | 33 bytes    | 107x      |
| 50 rows, 1 cell changed | 6,324 bytes | 33 bytes    | 192x      |

This works because the diff operates on structured cells, not raw ANSI strings. Two cells with the same fg, bg, attrs, and character are equal regardless of how many different ANSI code sequences could produce the same visual result.

### 5. No Double-Encoding

Pre-styled text is normalized to canonical cell properties during parsing. The output phase generates a single, optimal ANSI representation. There are no duplicate resets, redundant color codes, or nested SGR sequences in the terminal output.

```tsx
// chalk produces: \x1b[31mhello\x1b[39m
// silvery parses to: [{text: "hello", fg: red}]
// output phase emits: \x1b[31mhello\x1b[0m (canonical form)
```

Style transitions between cells use cached SGR transition strings. With ~15-50 unique styles per TUI, the cache covers all ~2,500 possible `(old, new)` pairs after the first few frames -- eliminating per-cell string construction entirely.

### 6. Hyperlinks

OSC 8 hyperlinks are first-class cell properties, not opaque escape sequences. They compose with colors, bold, underline, and all other styles:

```tsx
import { hyperlink } from "silvery"

// Hyperlink composes with silvery styles
<Text color="cyan" underline>
  {hyperlink("https://silvery.dev", "silvery.dev")}
</Text>

// Hyperlink composes with chalk styles
<Text>{chalk.bold(hyperlink("https://example.com", "Bold link"))}</Text>
```

The parser extracts OSC 8 URLs into the cell's `hyperlink` property. The output phase wraps affected cells in OSC 8 open/close sequences, correctly interleaved with SGR codes.

## Cell-Buffer vs Raw Passthrough

Some terminal libraries pass ANSI sequences through unchanged. This preserves the exact byte sequence the author wrote, but breaks composition.

| Capability               | Raw Passthrough                                | Cell-Buffer (Silvery)                         |
| ------------------------ | ---------------------------------------------- | --------------------------------------------- |
| Pre-styled text fidelity | Exact bytes preserved                          | Full fidelity via structured styles           |
| Style composition        | Broken -- nested sequences conflict            | Automatic -- cell properties merge            |
| Background cascade       | Manual -- each component manages resets        | Automatic -- inherited from render tree       |
| Incremental diff         | Broken -- can't diff opaque sequences          | Full participation -- cells are comparable    |
| Overflow clipping        | Broken -- clipping mid-sequence corrupts state | Clean -- clip at cell boundary                |
| Cursor positioning       | Fragile -- escape sequences shift positions    | Correct -- chars and escapes are separated    |
| Hyperlinks               | Opaque -- can't combine with other styles      | First-class -- compose with everything        |
| Output size              | Verbose -- redundant resets and codes          | Minimal -- cached transitions, canonical form |

The cell-buffer approach means silvery can accept text styled by any library (chalk, kleur, picocolors, raw ANSI) and produce correct, minimal, composable output. The pre-styled text is not degraded -- it is elevated into a structured representation that enables features impossible with raw passthrough.
