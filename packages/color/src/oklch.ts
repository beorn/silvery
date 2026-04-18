/**
 * OKLCH primitives — sRGB ↔ linear RGB ↔ OKLab ↔ OKLCH conversions and gamut mapping.
 *
 * OKLCH is the perceptually-uniform cylindrical form of OKLab (Ottosson, 2020), now
 * standardized in CSS Color Module 4. Unlike HSL, L is perceptually linear — a 10%
 * L increase looks the same whether you start at blue or yellow. This makes blends,
 * lightness adjustments, and hue rotations behave predictably.
 *
 * Conventions:
 *   L ∈ [0, 1]   — lightness (perceptual)
 *   C ∈ [0, ~0.4] — chroma (colorfulness; naturally unbounded but sRGB caps around 0.32)
 *   H ∈ [0, 360)  — hue in degrees
 *
 * All hex strings are uppercase `#RRGGBB`. Invalid hex returns `null` at the parse
 * boundary; downstream functions treat that as "pass through unchanged".
 *
 * @module
 */

/** OKLCH color: perceptually-uniform cylindrical form of OKLab. */
export interface OKLCH {
  /** Lightness in [0, 1]. Perceptually linear. */
  L: number
  /** Chroma in [0, ~0.4]. Natural upper bound depends on display gamut. */
  C: number
  /** Hue in [0, 360) degrees. */
  H: number
}

function parseHex(hex: string): [number, number, number] | null {
  if (hex[0] !== "#") return null
  const h = hex.slice(1)
  if (h.length === 3) {
    const r = parseInt(h[0]! + h[0]!, 16)
    const g = parseInt(h[1]! + h[1]!, 16)
    const b = parseInt(h[2]! + h[2]!, 16)
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
    return [r, g, b]
  }
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
    return [r, g, b]
  }
  return null
}

/** sRGB channel (0–255) → linear RGB (0–1). Inverse gamma. */
export function srgbToLinear(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** Linear RGB (0–1) → sRGB channel (0–255). Forward gamma. */
export function linearToSrgb(c: number): number {
  const clamped = Math.max(0, Math.min(1, c))
  return clamped <= 0.0031308 ? 12.92 * clamped * 255 : (1.055 * clamped ** (1 / 2.4) - 0.055) * 255
}

/** Linear RGB → OKLab (Ottosson 2020 matrix). */
export function linearRgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b

  const lCbrt = Math.cbrt(l)
  const mCbrt = Math.cbrt(m)
  const sCbrt = Math.cbrt(s)

  const L = 0.2104542553 * lCbrt + 0.793617785 * mCbrt - 0.0040720468 * sCbrt
  const a = 1.9779984951 * lCbrt - 2.428592205 * mCbrt + 0.4505937099 * sCbrt
  const bb = 0.0259040371 * lCbrt + 0.7827717662 * mCbrt - 0.808675766 * sCbrt
  return [L, a, bb]
}

/** OKLab → linear RGB (inverse of the above). */
export function oklabToLinearRgb(L: number, a: number, bb: number): [number, number, number] {
  const lCbrt = L + 0.3963377774 * a + 0.2158037573 * bb
  const mCbrt = L - 0.1055613458 * a - 0.0638541728 * bb
  const sCbrt = L - 0.0894841775 * a - 1.291485548 * bb

  const l = lCbrt ** 3
  const m = mCbrt ** 3
  const s = sCbrt ** 3

  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  return [r, g, b]
}

/** Hex (`#RRGGBB`) → OKLCH. Returns `null` for invalid hex. */
export function hexToOklch(hex: string): OKLCH | null {
  const rgb = parseHex(hex)
  if (!rgb) return null
  const [r, g, b] = rgb
  const [lr, lg, lb] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)]
  const [L, a, bb] = linearRgbToOklab(lr, lg, lb)
  const C = Math.sqrt(a * a + bb * bb)
  let H = (Math.atan2(bb, a) * 180) / Math.PI
  if (H < 0) H += 360
  return { L, C, H }
}

/** Check whether linear RGB is inside sRGB gamut (each channel in [0, 1]). */
function inGamut(r: number, g: number, b: number): boolean {
  const e = 1e-5
  return r >= -e && r <= 1 + e && g >= -e && g <= 1 + e && b >= -e && b <= 1 + e
}

/**
 * OKLCH → hex. Gamut-maps out-of-sRGB colors by reducing chroma until in-gamut
 * (preserves L and H — the perceptual anchors). This is the CSS Color 4
 * recommended approach for rendering OKLCH on sRGB displays.
 */
export function oklchToHex(c: OKLCH): string {
  const L = Math.max(0, Math.min(1, c.L))
  const H = ((c.H % 360) + 360) % 360
  const Crad = (H * Math.PI) / 180

  // Chroma-reduction gamut map: binary search the largest C ≤ c.C that stays in sRGB.
  let lo = 0
  let hi = Math.max(0, c.C)

  // Quick path: if c.C is already in gamut, skip the search.
  const aHi = hi * Math.cos(Crad)
  const bbHi = hi * Math.sin(Crad)
  let [rHi, gHi, bHi] = oklabToLinearRgb(L, aHi, bbHi)
  if (inGamut(rHi, gHi, bHi)) {
    const r = linearToSrgb(rHi)
    const g = linearToSrgb(gHi)
    const b = linearToSrgb(bHi)
    return rgbToHexInternal(r, g, b)
  }

  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    const a = mid * Math.cos(Crad)
    const bb = mid * Math.sin(Crad)
    const [rr, gg, bbLin] = oklabToLinearRgb(L, a, bb)
    if (inGamut(rr, gg, bbLin)) lo = mid
    else hi = mid
  }

  const a = lo * Math.cos(Crad)
  const bb = lo * Math.sin(Crad)
  ;[rHi, gHi, bHi] = oklabToLinearRgb(L, a, bb)
  return rgbToHexInternal(linearToSrgb(rHi), linearToSrgb(gHi), linearToSrgb(bHi))
}

function rgbToHexInternal(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`.toUpperCase()
}

/** Shortest-arc hue interpolation (handles the 359° ↔ 1° wrap). */
export function lerpHue(h1: number, h2: number, t: number): number {
  const diff = ((h2 - h1 + 540) % 360) - 180
  const h = h1 + diff * t
  return ((h % 360) + 360) % 360
}

/**
 * Linear interpolate in OKLCH space (polar — interpolates L, C, H separately).
 * Good for hue rotations; can produce surprising results when blending a
 * near-neutral (tiny C) with a chromatic color because the hue of the neutral
 * endpoint is effectively meaningless.
 */
export function lerpOklch(a: OKLCH, b: OKLCH, t: number): OKLCH {
  return {
    L: a.L + (b.L - a.L) * t,
    C: a.C + (b.C - a.C) * t,
    H: lerpHue(a.H, b.H, t),
  }
}

/**
 * Linear interpolate in OKLab (rectangular — a, b, L interpolated directly).
 *
 * CSS Color Module 4's default interpolation space. Avoids the hue-arc
 * weirdness of `lerpOklch` when one endpoint is near-neutral (its H is
 * effectively undefined). Produces the expected "tinted surface" when blending
 * `bg` with an accent color.
 */
export function lerpOklabHex(aHex: string, bHex: string, t: number): string | null {
  const aOk = hexToOklch(aHex)
  const bOk = hexToOklch(bHex)
  if (!aOk || !bOk) return null

  // OKLCH → OKLab
  const aRad = (aOk.H * Math.PI) / 180
  const bRad = (bOk.H * Math.PI) / 180
  const aA = aOk.C * Math.cos(aRad)
  const aB = aOk.C * Math.sin(aRad)
  const bA = bOk.C * Math.cos(bRad)
  const bB = bOk.C * Math.sin(bRad)

  // Lerp in OKLab
  const L = aOk.L + (bOk.L - aOk.L) * t
  const A = aA + (bA - aA) * t
  const B = aB + (bB - aB) * t

  // OKLab → OKLCH → hex
  const C = Math.sqrt(A * A + B * B)
  let H = (Math.atan2(B, A) * 180) / Math.PI
  if (H < 0) H += 360
  return oklchToHex({ L, C, H })
}

/**
 * ΔE in OKLCH (≈ ΔE₀₀ quality in practice — OKLCH was designed to make Euclidean
 * distance perceptually meaningful). Hue is weighted by chroma so near-neutral
 * colors don't produce spurious large ΔH contributions.
 */
export function deltaE(a: OKLCH, b: OKLCH): number {
  const dL = a.L - b.L
  const dC = a.C - b.C
  const dh = (((a.H - b.H + 540) % 360) - 180) * (Math.PI / 180)
  const chromaMean = (a.C + b.C) / 2
  const dH = 2 * Math.sqrt(a.C * b.C) * Math.sin(dh / 2)
  // Weighted hue by chroma presence — neutrals contribute less H distance.
  void chromaMean // kept for readability; the 2*sqrt(Ca*Cb)*sin term already weights by chroma
  return Math.sqrt(dL * dL + dC * dC + dH * dH)
}
