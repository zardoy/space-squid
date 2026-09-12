/** Default /effect duration when the caller omits seconds. */
export const DEFAULT_EFFECT_SECONDS = 30

/** Convert command seconds to ticks. `0` is immediate expiry, not the default. */
export const ticksFromEffectSeconds = (seconds: number | undefined) => {
  if (seconds === undefined || Number.isNaN(seconds)) {
    return DEFAULT_EFFECT_SECONDS * 20
  }
  return seconds * 20
}

/** Normalize addEffect duration in ticks. Keep 0 and -1 (infinite). */
export const normalizeEffectTicks = (ticks: number | undefined) => {
  if (ticks === undefined || Number.isNaN(ticks)) {
    return DEFAULT_EFFECT_SECONDS * 20
  }
  return ticks
}
