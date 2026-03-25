# Table

Data grid display component with column alignment, auto-sizing, and optional box-drawing borders.

## Import

```tsx
import { Table } from "silvery"
```

## Usage

```tsx
const columns = [
  { key: "name", header: "Name", width: 20 },
  { key: "status", header: "Status", width: 10, align: "center" },
  { key: "count", header: "Count", width: 8, align: "right" },
]

const data = [
  { name: "Item 1", status: "active", count: 42 },
  { name: "Item 2", status: "pending", count: 7 },
]

<Table columns={columns} data={data} border />
```

## Props

| Prop      | Type                             | Default    | Description                           |
| --------- | -------------------------------- | ---------- | ------------------------------------- |
| `columns` | `TableColumn[]`                  | _required_ | Column definitions                    |
| `data`    | `Array<Record<string, unknown>>` | _required_ | Data rows to display                  |
| `border`  | `boolean`                        | `false`    | Show box-drawing borders around cells |

### TableColumn

```ts
interface TableColumn {
  /** Key in data objects to display */
  key: string
  /** Header text */
  header: string
  /** Fixed column width (auto-calculated from content if omitted) */
  width?: number
  /** Text alignment within the column */
  align?: "left" | "center" | "right"
}
```

## Output

Without borders:

```
Name                Status      Count
Item 1              active         42
Item 2              pending         7
```

With `border`:

```
┌──────────────────────┬────────────┬──────────┐
│ Name                 │   Status   │    Count │
├──────────────────────┼────────────┼──────────┤
│ Item 1               │   active   │       42 │
│ Item 2               │   pending  │        7 │
└──────────────────────┴────────────┴──────────┘
```

Values longer than the column width are truncated with an ellipsis character.

## Examples

### Auto-Sized Columns

```tsx
const columns = [
  { key: "file", header: "File" },
  { key: "size", header: "Size", align: "right" },
]

<Table
  columns={columns}
  data={[
    { file: "README.md", size: "2.4 KB" },
    { file: "package.json", size: "1.1 KB" },
  ]}
/>
```

When `width` is omitted, columns auto-size to fit the widest content in each column.

### Bordered Data Table

```tsx
<Table
  columns={[
    { key: "name", header: "Package", width: 25 },
    { key: "version", header: "Version", width: 10 },
    { key: "license", header: "License", width: 10, align: "center" },
  ]}
  data={packages}
  border
/>
```
