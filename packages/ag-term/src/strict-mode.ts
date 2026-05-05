/**
 * SILVERY_STRICT — single canonical strictness gate.
 *
 * Contract: the `SILVERY_STRICT` env var is the only knob for runtime
 * verification. It accepts a comma-separated list where each entry is
 * either a numeric tier (1/2/3, ascending strictness) or a check slug
 * (e.g. "canary", "residue", "incremental"). Empty / "0" / unset is off.
 *
 *   SILVERY_STRICT=1            // all canonical checks at tier 1
 *   SILVERY_STRICT=2            // tier 1 + every-action checks
 *   SILVERY_STRICT=canary       // only the degenerate-frame canary
 *   SILVERY_STRICT=residue,1    // tier 1 + explicit residue (redundant; same as 1)
 *   SILVERY_STRICT=1,!canary    // tier 1 minus the canary  (per-check skip)
 *
 * The "do NOT add new SILVERY_* enable env vars" rule lives here as code:
 * every check threads through `isStrictEnabled(slug, minTier)`. New checks
 * pick a slug + a tier and inherit the umbrella behavior — `bun run
 * test:fast` (which sets `SILVERY_STRICT=1` by default) gets every new
 * check without anyone touching env config.
 */

export interface StrictModeQuery {
  /** Slug name for this check (e.g. "canary", "residue"). */
  slug: string
  /** Minimum numeric tier at which this check is implicitly enabled. */
  minTier?: number
}

interface ParsedStrict {
  enabledTiers: ReadonlySet<number>
  enabledSlugs: ReadonlySet<string>
  disabledSlugs: ReadonlySet<string>
  raw: string | undefined
}

let cachedRaw: string | undefined = undefined
let cachedParsed: ParsedStrict | null = null

function parseStrict(raw: string | undefined): ParsedStrict {
  if (!raw || raw === "0") {
    return {
      enabledTiers: new Set(),
      enabledSlugs: new Set(),
      disabledSlugs: new Set(),
      raw,
    }
  }
  const tiers = new Set<number>()
  const slugs = new Set<string>()
  const disabled = new Set<string>()
  for (const part of raw.split(",")) {
    const trimmed = part.trim()
    if (!trimmed) continue
    if (trimmed.startsWith("!")) {
      disabled.add(trimmed.slice(1))
      continue
    }
    const n = Number(trimmed)
    if (Number.isFinite(n) && n >= 1) {
      tiers.add(n)
      continue
    }
    slugs.add(trimmed)
  }
  return { enabledTiers: tiers, enabledSlugs: slugs, disabledSlugs: disabled, raw }
}

function getParsed(): ParsedStrict {
  const raw = process.env.SILVERY_STRICT
  if (raw !== cachedRaw || cachedParsed === null) {
    cachedRaw = raw
    cachedParsed = parseStrict(raw)
  }
  return cachedParsed
}

/**
 * Returns true if `slug` should fire under the current `SILVERY_STRICT`.
 *
 * - `!slug` always wins (per-check skip)
 * - explicit slug match wins
 * - any tier >= minTier (default 1) implies the check
 */
export function isStrictEnabled(slug: string, minTier: number = 1): boolean {
  const p = getParsed()
  if (p.disabledSlugs.has(slug)) return false
  if (p.enabledSlugs.has(slug)) return true
  for (const tier of p.enabledTiers) {
    if (tier >= minTier) return true
  }
  return false
}

/** True if SILVERY_STRICT is set to anything that turns checking on. */
export function isStrictAnyEnabled(): boolean {
  const p = getParsed()
  return p.enabledTiers.size > 0 || p.enabledSlugs.size > 0
}

/** Reset the cache — for tests that mutate process.env mid-run. */
export function resetStrictCache(): void {
  cachedRaw = undefined
  cachedParsed = null
}
