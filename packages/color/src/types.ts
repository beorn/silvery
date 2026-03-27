/** HSL color: [hue: 0-360, saturation: 0-1, lightness: 0-1] */
export type HSL = [number, number, number]

/** Result of a contrast check between two colors. */
export interface ContrastResult {
  /** The contrast ratio (1:1 to 21:1), expressed as a single number (e.g. 4.5). */
  ratio: number
  /** Whether the ratio meets WCAG AA for normal text (>= 4.5:1). */
  aa: boolean
  /** Whether the ratio meets WCAG AAA for normal text (>= 7:1). */
  aaa: boolean
}
