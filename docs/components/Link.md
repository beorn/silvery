# Link

Renders link text for URLs or app-owned actions. When `href` is present, the text is wrapped in an OSC 8 hyperlink for supporting terminals (iTerm2, Ghostty, Kitty, etc.).

## Import

```tsx
import { Link } from "silvery"
```

## Props

`LinkProps` extends `TextProps` (excluding `children`).

| Prop          | Type        | Default            | Description                                                  |
| ------------- | ----------- | ------------------ | ------------------------------------------------------------ |
| `href`        | `string`    | --                 | Optional OSC 8 URL; omit for an app-owned action             |
| `children`    | `ReactNode` | --                 | Link text content                                            |
| `color`       | `string`    | `"$fg-link"`       | Link text color                                              |
| `revealColor` | `string`    | `"$fg-link-hover"` | Brighter color used while hovered                            |
| `underline`   | `boolean`   | --                 | Explicit stable choice; otherwise underline appears on hover |

All `TextProps` style props (bold, italic, etc.) are also accepted.

## Usage

```tsx
<Link href="https://example.com">Visit Example</Link>

// Internal link with custom handler
<Link
  href="app://node/abc123"
  onClick={(event) => {
    event.preventDefault()
    navigate("abc123")
  }}
>
  Internal Link
</Link>

// App-owned action with no OSC 8 destination
<Link onClick={() => navigateBack()}>
  Back
</Link>
```

## Behavior

- Plain hover brightens the text with `$fg-link-hover` and adds an underline.
  An explicit `underline` value remains stable and overrides that default.
- Role still derives activation policy: a URL link opens on Cmd/Super-click;
  an action-only link delegates activation to its `onClick` handler.
- The `onClick` callback runs first. If it calls `preventDefault()`, it owns the
  activation; otherwise a revealed click emits `"link:open"` through the app
  event chain when `href` is present. An action-only Link with no `href` never
  emits `"link:open"` or paints an OSC 8 destination.

## See Also

- [Text](./Text.md) -- base text component
