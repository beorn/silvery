# Link

Renders clickable hyperlinks using the OSC 8 terminal escape sequence. Text inside `<Link>` is wrapped in OSC 8 sequences, making it clickable in supporting terminals (iTerm2, Ghostty, Kitty, etc.).

## Import

```tsx
import { Link } from "silvery"
```

## Props

`LinkProps` extends `TextProps` (excluding `children`).

| Prop       | Type                                   | Default              | Description                                                           |
| ---------- | -------------------------------------- | -------------------- | --------------------------------------------------------------------- |
| `href`     | `string`                               | **required**         | URL to link to (http/https for external, custom schemes for internal) |
| `children` | `ReactNode`                            | --                   | Link text content                                                     |
| `variant`  | `"arm-on-cmd-hover" \| "arm-on-hover"` | `"arm-on-cmd-hover"` | How the link arms for clicking                                        |
| `color`    | `string`                               | `"$link"`            | Link text color                                                       |

All `TextProps` style props (bold, italic, etc.) are also accepted.

## Usage

```tsx
<Link href="https://example.com">Visit Example</Link>

// Always clickable on hover (no modifier needed)
<Link href="https://example.com" variant="arm-on-hover">Always Clickable</Link>

// Internal link with custom handler
<Link href="app://node/abc123" onClick={(e) => navigate(e)}>Internal Link</Link>
```

## Behavior

- **`arm-on-cmd-hover`** (default): Link underlines and becomes clickable when hovered while holding Cmd/Super.
- **`arm-on-hover`**: Link underlines and becomes clickable on plain hover (no modifier needed).
- On click (when armed), emits a `"link:open"` event via RuntimeContext.

## See Also

- [Text](./Text.md) -- base text component
