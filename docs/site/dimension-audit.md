# Manual Dimension Calculations Audit

**Scope:** `/Users/beorn/Code/pim/km/apps/km-tui/packages/km-ink/src/views/`

This audit identifies manual dimension calculations that could potentially be replaced with flexbox auto-layout.

---

## Summary

| Status       | Count | Description                                                   |
| ------------ | ----- | ------------------------------------------------------------- |
| Acceptable   | 8     | Required for virtualization, centering, or content truncation |
| Refactorable | 3     | Could use flexbox instead                                     |
| Questionable | 2     | May need investigation                                        |

---

## Board.tsx

### 1. Main contentHeight calculation (Lines 1181-1182)

```typescript
const contentHeight = termHeight - TOP_BAR_HEIGHT - BOTTOM_BAR_HEIGHT
```

**Purpose:** Calculates available height between fixed top bar (1 row) and bottom bar (1 row).

**Can use flexbox?** **No** - This is acceptable.

**Reason:** The `contentHeight` value is passed to child components for:

- Virtualized scrolling calculations
- Overlay positioning (modal centering)
- Scroll indicator height

The parent Box does use `flexGrow={1}` but children still need the numeric height for scroll calculations. This is a fundamental limitation: flexbox calculates layout, but components need to know their dimensions for virtualization.

---

### 2. Scroll indicator height (Line 1184)

```typescript
const scrollIndicatorHeight = contentHeight - 1
```

**Purpose:** Scroll indicators are 1 row shorter to avoid overlapping the header row.

**Can use flexbox?** **Questionable**

**Reason:** This creates a visual offset so scroll indicators don't overlap column headers. Could potentially be restructured so the scroll indicators are in a flex container that naturally excludes the header row.

---

### 3. Loading indicator empty box (Line 1249)

```typescript
<Box height={termHeight} width={termWidth} />
```

**Purpose:** Render empty screen during initialization to prevent flash/scroll artifacts.

**Can use flexbox?** **No** - This is acceptable.

**Reason:** This is a fullscreen placeholder. Using `flexGrow={1}` wouldn't guarantee the same size as the final board, which could cause visual jumps.

---

### 4. Project picker positioning (Lines 1373-1380)

```typescript
marginTop={Math.floor(contentHeight / 2)}
width={Math.floor(termWidth / 2)}
height={Math.floor(contentHeight / 2)}
```

**Purpose:** Center the project picker modal on screen.

**Can use flexbox?** **Yes, partially**

**Reason:** The centering could use `justifyContent="center"` and `alignItems="center"` on a fullscreen overlay. However, the explicit width/height for the modal itself is acceptable - it's defining the modal's intrinsic size, not working around layout limitations.

**Recommendation:** Wrap in a centered flexbox container:

```tsx
<Box position="absolute" width="100%" height="100%" justifyContent="center" alignItems="center">
  <ProjectPicker width={Math.floor(termWidth / 2)} height={Math.floor(contentHeight / 2)} />
</Box>
```

---

### 5. New item dialog positioning (Lines 1389-1397)

```typescript
marginTop={Math.floor(contentHeight / 3)}
width={Math.floor(termWidth / 2)}
height={10}
```

**Purpose:** Position the new item dialog modal.

**Can use flexbox?** **Yes, partially** (same as above)

**Reason:** The `height={10}` is an intrinsic size choice (the dialog is always 10 rows). The positioning could use centered flexbox.

---

### 6. Test wrapper contentHeight (Line 1644)

```typescript
const testContentHeight = termHeight - TOP_BAR_HEIGHT - BOTTOM_BAR_HEIGHT
```

**Purpose:** Same as main contentHeight but for test wrapper.

**Can use flexbox?** **No** - Duplicates production logic for testing.

---

## ColumnsView.tsx

### 7. Scroll indicator height (Line 166)

```typescript
const scrollIndicatorHeight = height - 1
```

**Purpose:** Same pattern as Board.tsx - scroll indicators skip the header row area.

**Can use flexbox?** **Questionable**

**Reason:** Same analysis as Board.tsx scroll indicator. Could potentially restructure to have scroll indicators in a container that excludes headers.

---

## HelpOverlay.tsx

### 8. Box height calculation (Lines 78-80)

```typescript
const boxHeight = Math.min(
  shortcuts.reduce((acc, cat) => acc + cat.keys.length + 3, 4),
  height - 6,
)
```

**Purpose:** Calculate help overlay height based on content, capped at available space minus margins.

**Can use flexbox?** **No** - This is acceptable.

**Reason:** This is content-based sizing with a maximum constraint. The `-6` accounts for the 3-line margin on top and bottom. This is calculating intrinsic content height, not working around layout.

---

### 9. Centering margins (Lines 84-85)

```typescript
const marginLeft = Math.floor((width - boxWidth) / 2)
const marginTop = Math.floor((height - boxHeight) / 2)
```

**Purpose:** Center the help overlay box.

**Can use flexbox?** **Yes**

**Reason:** This could use a wrapper with `justifyContent="center"` and `alignItems="center"`.

**Recommendation:**

```tsx
<Box position="absolute" width="100%" height="100%"
     justifyContent="center" alignItems="center">
  <Box width={boxWidth} borderStyle="double" ...>
```

---

## ProjectPicker.tsx

### 10. Max visible items (Line 196)

```typescript
const maxVisible = Math.max(1, height - 6)
```

**Purpose:** Calculate how many list items fit in the picker, reserving space for header (1), separator (1), search input (1), hints footer (2), plus padding (1).

**Can use flexbox?** **No** - This is acceptable.

**Reason:** This is virtualization logic - the component needs to know how many items to render for the visible window. Flexbox can't tell you "how many items fit in this space."

---

## DetailPane.tsx

### 11. Content lines calculation (Lines 79-86)

```typescript
const contentLines = Math.max(
  1,
  height -
    estimatedHeaderLines -
    Math.min(subtasks.length, maxSubtasks) -
    Math.min(backlinkNodes.length, maxBacklinks) -
    4,
)
```

**Purpose:** Calculate how many lines of content to show after reserving space for title, fields, subtasks, and backlinks sections.

**Can use flexbox?** **No** - This is acceptable.

**Reason:** This is content truncation logic. The component needs to know how much space is available to decide how much content to display. This is similar to virtualization - you need to know the number, not just let flexbox handle overflow.

---

## NewItemDialog.tsx

### 12. Height capping (Line 152)

```typescript
height={Math.min(height, 10)}
```

**Purpose:** Cap dialog height at 10 rows maximum.

**Can use flexbox?** **Partial** - Could use `maxHeight={10}` instead.

**Reason:** This is intrinsic sizing. Using `maxHeight` would be more semantic but functionally equivalent.

---

## CardColumn.tsx, ListView.tsx, TabsView.tsx

### 13. Fixed-height spacer rows

```typescript
<Box height={1} flexShrink={0}>
```

**Purpose:** Create consistent spacing/headers that don't collapse.

**Can use flexbox?** **These ARE correct flexbox usage.**

**Reason:** Using `height={1}` with `flexShrink={0}` is the correct pattern for fixed-height elements in a flex container. This isn't a manual calculation - it's defining intrinsic size.

---

## tree-node-helpers.ts

### 14. Height estimation function (Lines 262-315)

```typescript
export function estimateTreeNodeHeight(...): number {
  let height = 0;
  // ... accumulate height based on content
}
```

**Purpose:** Pre-calculate the visual height of a tree node for virtualization/scrolling.

**Can use flexbox?** **No** - This is acceptable.

**Reason:** This is virtualization support. You must know item heights before rendering to implement virtual scrolling.

---

## Recommendations

### Should Refactor (Priority 1)

1. **Modal centering** (HelpOverlay, ProjectPicker, NewItemDialog): Replace manual margin calculations with flexbox centering containers.

### Investigate (Priority 2)

2. **Scroll indicator heights** (Board.tsx, ColumnsView.tsx): Consider restructuring so indicators are in containers that naturally exclude headers.

### Acceptable (No Change Needed)

- `contentHeight` calculations for virtualization
- Content truncation logic in DetailPane
- Max visible items in ProjectPicker
- Tree node height estimation
- Loading placeholder dimensions
- Fixed `height={1}` with `flexShrink={0}` for headers

---

## Pattern Reference

### When manual dimensions are necessary:

1. **Virtualization** - Must know how many items fit before rendering
2. **Content truncation** - Must know available lines to truncate text
3. **Fullscreen placeholders** - Must match final size to avoid jumps
4. **Test fixtures** - Must replicate production calculations

### When flexbox should replace manual calculations:

1. **Centering** - Use `justifyContent="center"` + `alignItems="center"`
2. **Filling available space** - Use `flexGrow={1}` instead of `height={parentHeight - N}`
3. **Maximum constraints** - Use `maxHeight` instead of `Math.min(height, N)`
