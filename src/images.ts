/**
 * inkx/images -- Image rendering via Kitty graphics and Sixel protocol.
 *
 * ```tsx
 * import { Image } from 'inkx/images'
 *
 * <Image src={pngBuffer} width={40} height={15} fallback="[image]" />
 * ```
 *
 * Auto-detects the best available protocol (Kitty > Sixel > text fallback).
 *
 * @packageDocumentation
 */

export { Image } from "./image/Image.js"
export type { ImageProps } from "./image/Image.js"

export { encodeKittyImage, deleteKittyImage, isKittyGraphicsSupported } from "./image/kitty-graphics.js"
export type { KittyImageOptions } from "./image/kitty-graphics.js"

export { encodeSixel, isSixelSupported } from "./image/sixel-encoder.js"
export type { SixelImageData } from "./image/sixel-encoder.js"
