# Image

Renders bitmap images in supported terminals using the Kitty graphics protocol (primary) or Sixel (fallback). When neither is supported, displays a text placeholder.

## Import

```tsx
import { Image } from "silvery"
```

## Props

| Prop       | Type                           | Default      | Description                                                  |
| ---------- | ------------------------------ | ------------ | ------------------------------------------------------------ |
| `src`      | `Buffer \| string`             | **required** | PNG image data (Buffer) or file path (string)                |
| `width`    | `number`                       | auto         | Width in terminal columns (uses available width from layout) |
| `height`   | `number`                       | `width / 2`  | Height in terminal rows                                      |
| `fallback` | `string`                       | `"[image]"`  | Text to display when image rendering is not supported        |
| `protocol` | `"kitty" \| "sixel" \| "auto"` | `"auto"`     | Which protocol to use                                        |

## Usage

```tsx
import { readFileSync } from "fs"

const png = readFileSync("photo.png")
<Image src={png} width={40} height={20} />

// With file path
<Image src="/path/to/image.png" width={40} height={20} />

// Auto-detect protocol, fall back to text
<Image src={png} width={40} height={20} fallback="[photo]" />
```

## Behavior

The component operates in two phases:

1. **Layout phase**: Renders a Box that reserves the visual space.
2. **Effect phase**: After render, writes the image escape sequence directly to stdout, positioned over the reserved space.

Protocol detection order (when `protocol="auto"`):

1. Kitty Graphics Protocol (transmits PNG directly)
2. Sixel (limited PNG support)
3. Text fallback

## See Also

- [Box](./Box.md) -- layout container
