/**
 * silvery/images -- Image rendering via Kitty graphics and Sixel protocol.
 *
 * ```tsx
 * import { Image } from '@silvery/ag-react/ui/images'
 *
 * <Image src={pngBuffer} width={40} height={15} fallback="[image]" />
 * ```
 *
 * Auto-detects the best available protocol (Kitty > Sixel > text fallback).
 *
 * @packageDocumentation
 */

export { Image } from "./image/Image"
export type { ImageProps } from "./image/Image"

export {
  encodeKittyImage,
  deleteKittyImage,
  isKittyGraphicsSupported,
} from "./image/kitty-graphics"
export type { KittyImageOptions } from "./image/kitty-graphics"

export { encodeSixel, isSixelSupported } from "./image/sixel-encoder"
export type { SixelImageData } from "./image/sixel-encoder"
