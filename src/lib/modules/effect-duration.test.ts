import { afterEach, expect, test, vi } from 'vitest'
import { entity as installEffects, unknownEffectMessage } from './effects'
import { DEFAULT_EFFECT_SECONDS, normalizeEffectTicks, ticksFromEffectSeconds } from './effect-duration'

test('ticksFromEffectSeconds keeps an explicit 0 instead of falling back to the default', () => {
  expect(ticksFromEffectSeconds(0)).toBe(0)
  expect(ticksFromEffectSeconds(5)).toBe(100)
  expect(ticksFromEffectSeconds(-1)).toBe(-20)
  expect(ticksFromEffectSeconds(undefined)).toBe(DEFAULT_EFFECT_SECONDS * 20)
  expect(ticksFromEffectSeconds(Number.NaN)).toBe(DEFAULT_EFFECT_SECONDS * 20)
})

test('normalizeEffectTicks keeps 0 (immediate expiry) and -1 (infinite)', () => {
  expect(normalizeEffectTicks(0)).toBe(0)
  expect(normalizeEffectTicks(-1)).toBe(-1)
  expect(normalizeEffectTicks(100)).toBe(100)
  expect(normalizeEffectTicks(undefined)).toBe(DEFAULT_EFFECT_SECONDS * 20)
  expect(normalizeEffectTicks(Number.NaN)).toBe(DEFAULT_EFFECT_SECONDS * 20)
})

test('addEffect with duration 0 expires immediately instead of lasting 30 seconds', () => {
  vi.useFakeTimers()
  const target: any = { type: 'mob' }
  const server: any = { getNearby: () => [], _writeArray: () => {} }
  installEffects(target, server)

  target.addEffect(1, { duration: 0 })
  expect(target.effects[1]).not.toBeNull()
  expect(target.effects[1].duration).toBe(0)
  vi.advanceTimersByTime(1)
  expect(target.effects[1]).toBeNull()
})

test('addEffect with duration -1 is infinite and never schedules removal', () => {
  vi.useFakeTimers()
  const target: any = { type: 'mob' }
  const server: any = { getNearby: () => [], _writeArray: () => {} }
  installEffects(target, server)

  target.addEffect(2, { duration: -1 })
  expect(target.effects[2].duration).toBe(-1)
  expect(target.effects[2].timeout).toBeUndefined()
  vi.advanceTimersByTime(60_000)
  expect(target.effects[2]).not.toBeNull()
})

test('addEffect without a duration keeps the 30 second default', () => {
  const target: any = { type: 'mob' }
  const server: any = { getNearby: () => [], _writeArray: () => {} }
  installEffects(target, server)

  target.addEffect(3)
  expect(target.effects[3].duration).toBe(DEFAULT_EFFECT_SECONDS * 20)
})

test('addEffect respects particles: false instead of coercing it to true', () => {
  const target: any = { type: 'mob' }
  const server: any = { getNearby: () => [], _writeArray: () => {} }
  installEffects(target, server)

  target.addEffect(4, { duration: -1, particles: false })
  expect(target.effects[4].particles).toBe(false)
})

test('unknownEffectMessage has no stray closing brace', () => {
  expect(unknownEffectMessage('speed')).toBe('Unknown effect speed')
  expect(unknownEffectMessage('speed').endsWith('}')).toBe(false)
})

afterEach(() => {
  vi.useRealTimers()
})
