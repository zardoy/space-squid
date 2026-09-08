import { afterEach, describe, expect, it, vi } from 'vitest'
import { entity as installEffects } from '../src/lib/modules/effects'

describe('timer replacement bounty reproduction', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const install = () => {
    const target: any = { type: 'mob' }
    const server: any = { getNearby: () => [], _writeArray: () => {} }
    installEffects(target, server)
    return target
  }

  it('keeps a replacement alive until its own deadline', () => {
    vi.useFakeTimers()
    const target = install()

    target.addEffect(1, { duration: 20 })
    vi.advanceTimersByTime(250)
    target.addEffect(1, { duration: 60, override: true })

    expect(target.effects[1]).not.toBeNull()
    vi.advanceTimersByTime(750)
    expect(target.effects[1]).not.toBeNull()
    vi.advanceTimersByTime(2250)
    expect(target.effects[1]).toBeNull()
  })

  it('cancels the replaced timer when the replacement is removed explicitly', () => {
    vi.useFakeTimers()
    const target = install()

    target.addEffect(1, { duration: 20 })
    target.addEffect(1, { duration: 60, override: true })
    target.removeEffect(1)
    vi.advanceTimersByTime(5000)

    expect(target.effects[1]).toBeNull()
  })

  it('does not replace a stronger effect or its deadline', () => {
    vi.useFakeTimers()
    const target = install()

    target.addEffect(1, { amplifier: 2, duration: 20 })
    expect(target.addEffect(1, { amplifier: 3, duration: 60 })).toBe(false)
    vi.advanceTimersByTime(1000)

    expect(target.effects[1]).toBeNull()
  })

  it('keeps timers for independent effect IDs separate', () => {
    vi.useFakeTimers()
    const target = install()

    target.addEffect(1, { duration: 20 })
    target.addEffect(2, { duration: 60 })
    vi.advanceTimersByTime(1000)

    expect(target.effects[1]).toBeNull()
    expect(target.effects[2]).not.toBeNull()
  })
})
