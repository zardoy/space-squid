/** Default /effect duration (in seconds) when the caller omits seconds. */
export const DEFAULT_EFFECT_SECONDS = 30

/**
 * Convert the /effect seconds argument to ticks.
 * An explicit 0 means immediate expiry (vanilla behavior), not the default,
 * and -1 means infinite. Only a missing/unparseable value falls back to 30s.
 */
export const ticksFromEffectSeconds = (seconds: number | undefined): number => {
  if (seconds === undefined || Number.isNaN(seconds)) {
    return DEFAULT_EFFECT_SECONDS * 20
  }
  return seconds * 20
}

/**
 * Normalize an addEffect duration given in ticks.
 * Keeps 0 (immediate expiry) and negative values (infinite); only a missing
 * or unparseable value falls back to the 30 second default.
 */
export const normalizeEffectTicks = (ticks: number | undefined): number => {
  if (ticks === undefined || Number.isNaN(ticks)) {
    return DEFAULT_EFFECT_SECONDS * 20
  }
  return ticks
}
