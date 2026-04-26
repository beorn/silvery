/**
 * Type declarations for upng-js (used by sixel-encoder.ts to decode PNG → RGBA).
 *
 * The package ships no types of its own. We declare only the surface we use
 * (decode + toRGBA8). This mirrors the analogous declaration in
 * termless/src/animation/upng.d.ts but covers the decode path here.
 */
declare module "upng-js" {
  interface DecodedImage {
    width: number
    height: number
    depth: number
    ctype: number
    frames: Array<{
      rect: { x: number; y: number; width: number; height: number }
      delay: number
      data: ArrayBuffer
    }>
    tabs: Record<string, unknown>
    data: ArrayBuffer
  }

  /** Decode a PNG into UPNG's intermediate representation. */
  export function decode(buf: ArrayBuffer | Uint8Array): DecodedImage

  /** Convert a decoded PNG to one or more frames of 8-bit RGBA pixel data. */
  export function toRGBA8(out: DecodedImage): ArrayBuffer[]

  /** Encode RGBA frames as a PNG / APNG (used by termless, not sixel-encoder). */
  export function encode(
    imgs: ArrayBuffer[],
    w: number,
    h: number,
    cnum: number,
    dels?: number[],
    forbidPlte?: boolean,
  ): ArrayBuffer

  const _default: {
    decode: typeof decode
    toRGBA8: typeof toRGBA8
    encode: typeof encode
  }
  export default _default
}
