# Toast / useToast

Toast notification system with auto-dismiss capability. `useToast()` returns functions to create and manage notifications. `ToastContainer` renders the notification stack.

## Import

```tsx
import { useToast, ToastContainer, ToastItem } from "silvery"
```

## useToast Hook

```ts
interface UseToastResult {
  toast: (options: ToastOptions) => string // Show a new toast, returns ID
  toasts: ToastData[] // Currently visible toasts
  dismiss: (id: string) => void // Dismiss by ID
  dismissAll: () => void // Dismiss all
}

interface ToastOptions {
  title: string // Toast title text
  description?: string // Optional description
  variant?: ToastVariant // Visual variant (default: "default")
  duration?: number // Auto-dismiss in ms (default: 3000, 0 = no auto-dismiss)
}

type ToastVariant = "default" | "success" | "error" | "warning" | "info"
```

## ToastContainer Props

| Prop         | Type          | Default      | Description            |
| ------------ | ------------- | ------------ | ---------------------- |
| `toasts`     | `ToastData[]` | **required** | Toasts to render       |
| `maxVisible` | `number`      | `5`          | Maximum visible toasts |

## ToastItem Props

| Prop    | Type        | Default      | Description          |
| ------- | ----------- | ------------ | -------------------- |
| `toast` | `ToastData` | **required** | Toast data to render |

### Variant Icons

| Variant   | Icon  | Color Token |
| --------- | ----- | ----------- |
| `default` | `[i]` | `$fg`       |
| `success` | `[+]` | `$fg-success`  |
| `error`   | `[x]` | `$fg-error`    |
| `warning` | `[!]` | `$fg-warning`  |
| `info`    | `[i]` | `$fg-info`     |

## Usage

```tsx
function App() {
  const { toast, toasts } = useToast()

  return (
    <Box flexDirection="column">
      <Button
        label="Save"
        onPress={() => {
          toast({ title: "Saved", variant: "success", duration: 3000 })
        }}
      />
      <ToastContainer toasts={toasts} />
    </Box>
  )
}
```

## See Also

- [Badge](./Badge.md) -- inline status label
