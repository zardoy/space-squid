import { afterEach, expect, test, vi } from 'vitest'
import { entity as installEffects } from './effects'
import { normalizeEffectTicks, ticksFromEffectSeconds } from './effect-duration'

test('ticksFromEffectSeconds keeps an explicit 0 instead of the 30s default', () => {
  expect(ticksFromEffectSeconds(0)).toBe(0)
  expect(ticksFromEffectSeconds(undefined)).toBe(600)
  expect(ticksFromEffectSeconds(Number.NaN)).toBe(600)
  expect(ticksFromEffectSeconds(5)).toBe(100)
})

test('normalizeEffectTicks keeps 0 and -1', () => {
  expect(normalizeEffectTicks(0)).toBe(0)
  expect(normalizeEffectTicks(-1)).toBe(-1)
  expect(normalizeEffectTicks(undefined)).toBe(600)
})

test('addEffect with duration 0 expires immediately', () => {
  vi.useFakeTimers()
  const target: any = { type: 'mob' }
  const server: any = { getNearby: () => [], _writeArray: () => {} }
  installEffects(target, server)

  target.addEffect(1, { duration: 0 })
  expect(target.effects[1]).not.toBeNull()
  expect(target.effects[1].duration).toBe(0)
  vi.advanceTimersByTime(0)
  expect(target.effects[1]).toBeNull()
  vi.useRealTimers()
})

afterEach(() => {
  vi.useRealTimers()
})
