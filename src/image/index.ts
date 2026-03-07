/**
 * Image rendering support for hightea.
 *
 * Provides encoders for the Kitty graphics protocol and Sixel protocol,
 * plus a React component for rendering images in terminal UIs.
 */

export { encodeKittyImage, deleteKittyImage, isKittyGraphicsSupported } from "./kitty-graphics.js"
export type { KittyImageOptions } from "./kitty-graphics.js"

export { encodeSixel, isSixelSupported } from "./sixel-encoder.js"
export type { SixelImageData } from "./sixel-encoder.js"

export { Image } from "./Image.js"
export type { ImageProps } from "./Image.js"
