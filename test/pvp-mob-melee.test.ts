import { afterEach, describe, expect, it, vi } from 'vitest'
import { Vec3 } from 'vec3'
import { player as installPvpPlayer } from '../src/lib/modules/pvp'

function installTarget (overrides: any = {}) {
  const target: any = {
    id: 1,
    type: 'mob',
    position: new Vec3(3, 0, 0),
    invincible: false,
    takeDamage: vi.fn(),
    ...overrides
  }

  const handlers = new Map<string, (payload: any) => void>()
  const behavior = vi.fn((_name: string, input: any, next: (value: any) => void) => next(input))
  const player: any = {
    position: new Vec3(0, 0, 0),
    behavior,
    _client: {
      on: vi.fn((event: string, handler: (payload: any) => void) => {
        handlers.set(event, handler)
      })
    }
  }
  const server: any = { entities: { [target.id]: target } }

  installPvpPlayer(player, server)

  return {
    target,
    behavior,
    attack: (mouse = 1) => handlers.get('use_entity')?.({ mouse, target: target.id })
  }
}

describe('player melee attacks', () => {
  afterEach(() => vi.useRealTimers())
  it('routes a spawned mob hit through the existing attack behavior', () => {
    vi.useFakeTimers()
    const { target, behavior, attack } = installTarget()

    vi.setSystemTime(1000)
    attack()

    expect(behavior).toHaveBeenCalledTimes(1)
    expect(behavior.mock.calls[0][0]).toBe('attack')
    expect(behavior.mock.calls[0][1].attackedEntity).toBe(target)
    expect(target.takeDamage).toHaveBeenCalledTimes(1)
  })

  it('continues to ignore object entities', () => {
    vi.useFakeTimers()
    const { behavior, attack } = installTarget({ type: 'object' })

    vi.setSystemTime(1000)
    attack()

    expect(behavior).not.toHaveBeenCalled()
  })

  it('continues to protect creative, spectator, and invincible players', () => {
    vi.useFakeTimers()
    for (const overrides of [
      { type: 'player', gameMode: 1 },
      { type: 'player', gameMode: 3 },
      { type: 'player', gameMode: 0, invincible: true }
    ]) {
      const { behavior, attack } = installTarget(overrides)

      vi.setSystemTime(1000)
      attack()

      expect(behavior).not.toHaveBeenCalled()
    }
  })

  it('preserves reach and cooldown checks for mobs', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)

    const { behavior, attack, target } = installTarget()
    target.position = new Vec3(5, 0, 0)

    attack()
    expect(behavior).not.toHaveBeenCalled()

    target.position = new Vec3(3, 0, 0)
    attack()
    attack()
    expect(behavior).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(250)
    attack()
    expect(behavior).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })
})
