# Table

A data table with headers, column alignment, and auto-calculated column widths.

## Import

```tsx
import { Table } from "silvery"
```

## Props

| Prop         | Type                                          | Default      | Description            |
| ------------ | --------------------------------------------- | ------------ | ---------------------- |
| `columns`    | `TableColumn[]`                               | **required** | Column definitions     |
| `data`       | `Array<Record<string, unknown> \| unknown[]>` | **required** | Data rows              |
| `showHeader` | `boolean`                                     | `true`       | Show header row        |
| `separator`  | `string`                                      | `" \| "`     | Border between columns |
| `headerBold` | `boolean`                                     | `true`       | Bold header text       |

### TableColumn

```ts
interface TableColumn {
  header: MeasuredContent // string, or { text, node }: renders node, measures text
  key?: string // Key to extract from data row
  width?: number // Column width (auto if omitted)
  align?: "left" | "right" | "center"
  measure?: (item, index) => string // Required when render() returns a node
}

type MeasuredContent = string | { readonly text: string; readonly node: ReactNode }
```

## Usage

```tsx
<Table
  columns={[
    { header: "Name", key: "name" },
    { header: "Age", key: "age", align: "right" },
  ]}
  data={[
    { name: "Alice", age: 30 },
    { name: "Bob", age: 25 },
  ]}
/>
```

Output:

```
Name  | Age
------+----
Alice |  30
Bob   |  25
```

## See Also

- [Box](./Box.md) -- layout container
