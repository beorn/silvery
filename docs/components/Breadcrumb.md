# Breadcrumb

Navigation breadcrumb trail with configurable separators. Highlights the last item as the current/active page.

## Import

```tsx
import { Breadcrumb } from "silvery"
```

## Props

| Prop        | Type               | Default      | Description                       |
| ----------- | ------------------ | ------------ | --------------------------------- |
| `items`     | `BreadcrumbItem[]` | **required** | Breadcrumb items (left to right)  |
| `separator` | `string`           | `"/"`        | Separator character between items |

### BreadcrumbItem

```ts
interface BreadcrumbItem {
  label: string
}
```

## Rendering

The last item is rendered in bold `$fg` as the current location. Preceding items are rendered in `$muted`.

## Usage

```tsx
<Breadcrumb
  items={[{ label: "Home" }, { label: "Settings" }, { label: "Profile" }]}
  separator=">"
/>
// Renders: Home > Settings > Profile
```

## See Also

- [Tabs](./Tabs.md) -- tabbed navigation
