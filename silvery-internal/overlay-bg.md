# Overlay Background (default-bg for overlays)

**Bead**: km-silvery.overlay-bg

## Problem

Overlay elements (modal dialogs, dropdowns, tooltips) need opaque backgrounds to cover the content beneath them. Currently, components like `ModalDialog` hardcode `backgroundColor="$surface-bg"` which works but:

1. **Hardcodes a specific token** — `$surface` is slightly elevated from `$bg`, but overlays might want to use the terminal's actual default background, which is whatever the user configured in their terminal emulator (not necessarily any theme token).
2. **Cannot reference "terminal default background"** — The terminal's background is not a color value Silvery knows at render time unless OSC 11 detection was performed. The `$bg` theme token is a _derived_ approximation, not the real terminal background.
3. **Overlays on overlays** — A dropdown inside a dialog should use a different elevation from the dialog itself. There's no elevation system.

## Current State

- `ModalDialog` uses `backgroundColor="$surface-bg"` (hardcoded in the component).
- `$bg` and `$surface` are theme tokens resolved via `resolveThemeColor()`.
- The terminal's true background is the ANSI "default background" — `\x1b[49m`. This is special: it means "whatever the terminal's configured background is", which might be transparent, an image, or a gradient. No hex color can replicate this.
- The rendering pipeline uses `backgroundColor` in the render phase to fill cells with a specific color. An empty/undefined `backgroundColor` means "transparent" (inherit from parent or terminal default).

## Proposed API

### Option A: `backgroundColor="$default"` special token

Add a special token `$default` that resolves to the terminal's default background reset (`\x1b[49m`) rather than a specific color value. This tells the output phase to emit the default-bg escape rather than a 24-bit color.

```tsx
<Box backgroundColor="$default">
  {" "}
  {/* terminal default bg, opaque */}
  <Text>Overlay content</Text>
</Box>
```

**Pros**: Simple, works with existing prop. Theme-independent.
**Cons**: `$default` is not actually a color — it's an instruction. The pipeline would need to handle it specially in the output phase.

### Option B: `opaque` prop on Box

Add an `opaque` boolean prop that forces the node to emit a background-reset for every cell it covers, ensuring content beneath is fully occluded.

```tsx
<Box opaque>
  {" "}
  {/* fills with terminal default bg */}
  <Text>Overlay content</Text>
</Box>
```

**Pros**: Semantically clear. Doesn't overload color semantics.
**Cons**: New prop on Box. Overlaps with `backgroundColor` semantics.

### Option C: Elevation system (shadcn-style)

Add `elevation={0|1|2|3}` to Box, which maps to theme tokens (`$bg`, `$surface`, `$popover`, etc.). Higher elevation = lighter background in dark themes, darker in light themes.

```tsx
<Box elevation={2}>
  {" "}
  {/* $popover background */}
  <Text>Dropdown content</Text>
</Box>
```

**Pros**: Systematic, composes well. Matches design system conventions.
**Cons**: More complex. Requires theme tokens to be ordered by elevation. Still doesn't solve the "terminal default bg" problem.

## Recommended Approach

**Option A (`$default` token)** for the terminal-default case, combined with **Option C (elevation)** as a future enhancement for themed overlays.

### Implementation Plan

1. **Add `$default` to the theme color resolver**:
   - In `resolveThemeColor()`, if token is `$default`, return a sentinel value (e.g., `"\x1b[49m"` or a special string like `__DEFAULT_BG__`).
   - The render phase already handles `backgroundColor` — it would need to recognize the sentinel and emit `\x1b[49m` instead of a 24-bit color sequence.

2. **Update the render phase** (`pipeline/render-text.ts` and `pipeline/render-phase.ts`):
   - When a cell's `bg` is the sentinel, emit `\x1b[49m` (SGR 49 = default background) instead of `\x1b[48;2;R;G;Bm`.
   - This is different from "no background" (transparent) — it actively resets to default.

3. **Update ModalDialog default**:
   - Change from `backgroundColor="$surface-bg"` to `backgroundColor="$surface-bg"` (keep current behavior, but document `$default` as an option).
   - Applications can override: `<ModalDialog borderColor="$border" backgroundColor="$default">`.

### Key Challenges

- **Diff algorithm**: The incremental diff compares cell backgrounds. A "default bg" sentinel must compare correctly — two cells with `$default` are the same, but `$default` differs from any specific color. The sentinel needs a stable identity.
- **Cell storage**: The buffer stores colors as numbers (or undefined for transparent). Default-bg would need a distinct representation from both "transparent" and "specific color".
- **Inheritance**: Children of a `$default` bg parent should inherit the default bg, not transparent. This may already work if the cell is filled during the render phase.

### Effort Estimate

Medium. Requires changes to the theme resolver, buffer cell representation, and output phase. Testing needs to verify the output escape sequences are correct across fullscreen and inline modes.
