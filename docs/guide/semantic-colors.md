# Semantic Color Tokens

Which `$token` to use for which element. Scan for your element type, get the answer.

## Quick Reference

### Text Hierarchy

| Token          | Use for                                     | Example                                            |
| -------------- | ------------------------------------------- | -------------------------------------------------- |
| `$fg`          | Primary content — body text, labels, values | `<Text>File saved</Text>`                          |
| `$muted`       | Secondary — descriptions, metadata, hints   | `<Text color="$muted">3 items</Text>`              |
| `$disabledfg`  | Disabled text, placeholders (~50% contrast) | `<Text color="$disabledfg">No results</Text>`      |
| `$primary`     | Headings, active indicators, brand emphasis | `<Text color="$primary" bold>Settings</Text>`      |
| `$link`        | Hyperlinks, references                      | `<Link href={url}>docs</Link>`                     |
| `$control`     | Interactive chrome — prompts, shortcuts     | `<Text color="$control">❯</Text>`                  |

**Rule of thumb**: If it's the main content, use `$fg` (the default — you don't need to specify it). If it's supporting info, use `$muted`. If it's inactive, use `$disabledfg`. If it needs to draw the eye, use `$primary`.

```tsx
// ✅ Correct hierarchy
<Text bold color="$primary">Project Name</Text>        // heading
<Text>Build succeeded in 2.3s</Text>                    // body ($fg default)
<Text color="$muted">src/index.ts • 142 lines</Text>   // metadata
<Text color="$disabledfg">No changes</Text>             // inactive

// ❌ Wrong
<Text color="$primary">src/index.ts • 142 lines</Text> // metadata isn't primary
<Text color="$muted">Build failed!</Text>               // important info shouldn't be muted
<Text color="$success">Project Name</Text>              // success implies completion, not branding
<Text color="red">Error message</Text>                  // hardcoded color — use $error
```

### Borders

| Token          | Use for                                     | Example                                            |
| -------------- | ------------------------------------------- | -------------------------------------------------- |
| `$border`      | Structural dividers, panel outlines, rules  | `<Box borderStyle="single">`                       |
| `$inputborder` | Input/button borders (unfocused)            | `<TextInput borderStyle="round">`                  |
| `$focusborder` | Focus rings on active inputs (always blue)  | Automatic when `borderStyle` set on TextInput      |
| `$focusring`   | Keyboard focus outline on any element       | `<Box outlineColor="$focusring">`                  |

**Border hierarchy**: structural `$border` → interactive `$inputborder` → focused `$focusborder`.

Components with `borderStyle` automatically use `$inputborder` when unfocused and `$focusborder` when focused. You rarely need to set these explicitly.

```tsx
// ✅ Let components handle focus states
<TextInput borderStyle="round" />  // auto: $inputborder → $focusborder on focus

// ✅ Structural borders
<Box borderStyle="single">         // uses $border by default (structural, not interactive)
  <Text>Panel content</Text>
</Box>

// ❌ Hardcoding focus state
<Box borderColor={focused ? "blue" : "gray"}>  // use component defaults instead
```

### Surfaces & Backgrounds

| Token        | Use for                                     | Pair with       |
| ------------ | ------------------------------------------- | ---------------- |
| `$bg`        | Default app background                      | `$fg`            |
| `$surfacebg` | Elevated panels, dialogs, cards             | `$surface`       |
| `$popoverbg` | Floating content — tooltips, dropdowns      | `$popover`       |
| `$inversebg` | Chrome areas — status bars, title bars      | `$inverse`       |
| `$mutedbg`   | Hover highlights, subtle emphasis           | `$fg` (readable) |

**Always pair**: When you set a background token, use its matching text token for content on that surface.

```tsx
// ✅ Correct pairing
<Box backgroundColor="$surfacebg">
  <Text color="$surface">Dialog content</Text>
</Box>

// ✅ Status bar
<Box backgroundColor="$inversebg">
  <Text color="$inverse">main • 3 files changed</Text>
</Box>

// ❌ Mismatched pair — $fg may not contrast on $surfacebg
<Box backgroundColor="$surfacebg">
  <Text>Content</Text>  // $fg on $surfacebg — might be low contrast
</Box>
```

### Status Colors

| Token      | Use for                          | Pair with      | Icon convention  |
| ---------- | -------------------------------- | -------------- | ---------------- |
| `$success` | Completion, positive outcomes    | `$successfg`   | ✓ ✔ ◆            |
| `$warning` | Caution, pending, unsaved        | `$warningfg`   | ⚠ △              |
| `$error`   | Errors, destructive, failures    | `$errorfg`     | ✗ ✘ ●            |
| `$info`    | Neutral notices, tips            | `$infofg`      | ℹ ○              |

**As text on default background**: use the base token (`$success`, `$error`, etc.) — they're designed to be visible on `$bg`.

**As filled backgrounds**: use the base token for the background and `*fg` for text on it.

```tsx
// ✅ Status text on default background
<Text color="$success">✓ Tests passed</Text>
<Text color="$error">✗ Build failed</Text>
<Text color="$warning">⚠ Unsaved changes</Text>

// ✅ Filled status badge
<Box backgroundColor="$error">
  <Text color="$errorfg">ERROR</Text>
</Box>

// ❌ Status color for non-status elements
<Text color="$success">Agent</Text>        // not a completion — use $primary or $fg
<Text color="$error">Delete</Text>         // button labels: fine, but add an icon too
<Box borderColor="$success">               // structural border — use $border
```

**Don't rely on color alone**: Always pair status colors with text labels or icons. Color-blind users and monochrome terminals need redundant signals.

### Accent Pairs

| Token        | Use for                                  |
| ------------ | ---------------------------------------- |
| `$primary`   | Brand accent, primary actions, headings  |
| `$secondary` | Alternate accent, secondary actions      |
| `$accent`    | Extra emphasis (not status, not brand)   |

Each has a `*fg` pair for text on that background:

```tsx
// ✅ Primary action button
<Box backgroundColor="$primary">
  <Text color="$primaryfg">Submit</Text>
</Box>

// ✅ Secondary action
<Box backgroundColor="$secondary">
  <Text color="$secondaryfg">Cancel</Text>
</Box>
```

### Selection & Cursor

| Token          | Use for                              |
| -------------- | ------------------------------------ |
| `$selectionbg` | Selected item/text background        |
| `$selection`   | Text on selected background          |
| `$cursorbg`    | Cursor block color                   |
| `$cursor`      | Text under cursor                    |

These are typically handled by the framework automatically. You rarely set them manually.

### Indexed Palette (`$color0`–`$color15`)

For **categorization** — tags, calendar colors, chart series, syntax highlighting:

```tsx
<Text color="$color1">bug</Text>      // red tag
<Text color="$color4">feature</Text>  // blue tag
<Text color="$color5">docs</Text>     // purple tag
```

Don't use palette colors for UI chrome or status — they're for data categorization only.

## Anti-Patterns

### Hardcoded colors

```tsx
// ❌ Never
<Text color="red">Error</Text>
<Text color="#A3BE8C">Done</Text>
<Box borderColor="gray">

// ✅ Always
<Text color="$error">Error</Text>
<Text color="$success">Done</Text>
<Box borderStyle="single">           // default $border
```

### Using status colors for non-status purposes

```tsx
// ❌ Using $success just because you want green
<Text color="$success">Agent</Text>           // agent name ≠ success
<Box outlineColor="$success">                 // decorative border ≠ success

// ✅ Use semantic meaning
<Text bold color="$primary">Agent</Text>      // brand emphasis
<Box borderStyle="round">                     // default structural border
```

### Over-coloring

Limit your UI to 2-3 accent colors at a time. If everything is colorful, nothing stands out. Use spacing, typography (bold, dim), and layout instead of more colors.

### Wrong text hierarchy

```tsx
// ❌ Everything the same weight
<Text color="$primary">Name</Text>
<Text color="$primary">Description</Text>
<Text color="$primary">Timestamp</Text>

// ✅ Clear hierarchy
<Text color="$primary" bold>Name</Text>       // heading
<Text>Description</Text>                       // body
<Text color="$muted">2 minutes ago</Text>     // metadata
```

### Bypassing component defaults

```tsx
// ❌ Manual focus handling
<Box borderColor={focused ? "$focusborder" : "$inputborder"}>
  <TextInput />
</Box>

// ✅ Let TextInput handle it
<TextInput borderStyle="round" />
```

## Terminal-Specific Notes

- **No transparency**: Every color is solid. Use `$mutedbg` for hover states instead of opacity overlays.
- **dim attribute**: `$muted` may use ANSI dim in 16-color mode. Don't rely on muted text for critical information.
- **16-color fallback**: Status colors may map to the same ANSI color (yellow for both `$primary` and `$warning` in dark mode). Always pair with text labels or icons.
- **Progressive enhancement**: Same token vocabulary works across ANSI 16 → 256 → truecolor. The framework handles the mapping.

## Decision Flowchart

**"What color should this element use?"**

1. **Is it body text?** → `$fg` (default, don't specify)
2. **Is it secondary/supporting?** → `$muted`
3. **Is it disabled or placeholder?** → `$disabledfg`
4. **Is it a heading or brand element?** → `$primary`
5. **Is it a hyperlink?** → `$link`
6. **Is it interactive chrome (prompt, shortcut)?** → `$control`
7. **Does it indicate success/error/warning?** → `$success` / `$error` / `$warning`
8. **Is it a structural border?** → default (don't specify — `$border` is automatic)
9. **Is it an input border?** → use `borderStyle` on the component (auto `$inputborder` / `$focusborder`)
10. **Is it a status/chrome bar?** → `$inversebg` + `$inverse`
11. **Is it a data category (tag, label)?** → `$color0`–`$color15`
12. **None of the above?** → You probably need `$fg` or `$muted`. If neither fits, your design may need a new token.
