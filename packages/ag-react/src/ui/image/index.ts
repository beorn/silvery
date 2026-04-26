/**
 * Image rendering support for silvery.
 *
 * Provides encoders for the Kitty graphics protocol and Sixel protocol,
 * plus a React component for rendering images in terminal UIs.
 */

export { encodeKittyImage, deleteKittyImage, isKittyGraphicsSupported } from "./kitty-graphics"
export type { KittyImageOptions } from "./kitty-graphics"

export { encodeSixel, decodePngToRgba, isSixelSupported } from "./sixel-encoder"
export type { SixelImageData } from "./sixel-encoder"

export { Image } from "./Image"
export type { ImageProps } from "./Image"
