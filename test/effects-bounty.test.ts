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
    expect(target.addEffect(1, { amplifier: 1, duration: 60 })).toBe(false)
    vi.advanceTimersByTime(1000)

    expect(target.effects[1]).toBeNull()
  })

  it('replaces a weaker effect, sends its amplifier, and uses the new deadline', () => {
    vi.useFakeTimers()
    const target: any = { type: 'player', id: 42 }
    const server: any = { getNearby: () => [target], _writeArray: vi.fn() }
    installEffects(target, server)

    target.addEffect(5, { amplifier: 0, duration: 20 })
    vi.advanceTimersByTime(250)
    expect(target.addEffect(5, { amplifier: 1, duration: 60 })).toBe(true)

    expect(target.effects[5].amplifier).toBe(1)
    expect(vi.getTimerCount()).toBe(1)
    expect(server._writeArray).toHaveBeenLastCalledWith('entity_effect', {
      entityId: 42,
      effectId: 5,
      amplifier: 1,
      duration: 60,
      hideParticles: false
    }, [target])
    vi.advanceTimersByTime(750)
    expect(target.effects[5]).not.toBeNull()
    vi.advanceTimersByTime(2250)
    expect(target.effects[5]).toBeNull()
    expect(server._writeArray).toHaveBeenLastCalledWith('remove_entity_effect', {
      entityId: 42,
      effectId: 5
    }, [target])
  })

  it('does not downgrade an effect when the amplifier is omitted', () => {
    vi.useFakeTimers()
    const target = install()

    target.addEffect(1, { amplifier: 1, duration: 20 })
    const active = target.effects[1]
    expect(target.addEffect(1)).toBe(false)
    expect(target.effects[1]).toBe(active)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('retains equal amplifiers unless override is explicit', () => {
    vi.useFakeTimers()
    const target = install()

    target.addEffect(1, { amplifier: 2, duration: 20 })
    const active = target.effects[1]
    expect(target.addEffect(1, { amplifier: 2, duration: 60 })).toBe(false)
    expect(target.effects[1]).toBe(active)
    expect(target.addEffect(1, { amplifier: 0, duration: 60, override: true })).toBe(true)
    expect(target.effects[1].amplifier).toBe(0)
    expect(vi.getTimerCount()).toBe(1)
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
