import { expect, test } from 'vitest'
import { player as respawnModule } from './respawn'
import { player as healthModule } from './health'

const createHarness = (feature: 'respawnIsPayload' | 'respawnIsActionId', allow = true) => {
  const writes: Array<{ name: string, params: any }> = []
  const handlers: Record<string, (data: any) => void> = {}
  const serv = {
    supportFeature: (name: string) => name === feature,
    dimensionNames: ['minecraft:overworld'],
    difficulty: 1,
    hashedSeed: [0, 0]
  } as any
  const player = {
    _client: {
      on: (name, handler) => { handlers[name] = handler },
      write: (name, params) => writes.push({ name, params })
    },
    spawnPoint: { x: 0, y: 64, z: 0 },
    prevGameMode: 0,
    gameMode: 0,
    world: {},
    health: 0,
    food: 3,
    foodSaturation: 0.5,
    nearbyEntities: [{}],
    sendSelfPosition: () => {},
    updateAndSpawn: () => {},
    behavior: (_name, _data, cb) => { if (allow) cb() }
  } as any

  healthModule(player, serv)
  respawnModule(player, serv)
  return { player, writes, handlers }
}

const payloadFor = (feature: string, value: number) =>
  feature === 'respawnIsPayload' ? { payload: value } : { actionId: value }

for (const feature of ['respawnIsPayload', 'respawnIsActionId'] as const) {
  test(`respawn restores health, food and saturation (${feature})`, () => {
    const { player, writes, handlers } = createHarness(feature)

    handlers.client_command(payloadFor(feature, 0))

    expect(player.health).toBe(20)
    expect(player.food).toBe(20)
    expect(player.foodSaturation).toBe(5)
    const health = writes.filter(w => w.name === 'update_health')
    expect(health).toEqual([{ name: 'update_health', params: { food: 20, foodSaturation: 5, health: 20 } }])
  })

  test(`non-respawn command changes nothing (${feature})`, () => {
    const { player, writes, handlers } = createHarness(feature)

    handlers.client_command(payloadFor(feature, 1))

    expect(writes).toEqual([])
    expect(player.food).toBe(3)
  })

  test(`denied requestRespawn keeps food state (${feature})`, () => {
    const { player, writes, handlers } = createHarness(feature, false)

    handlers.client_command(payloadFor(feature, 0))

    expect(writes).toEqual([])
    expect(player.health).toBe(0)
    expect(player.food).toBe(3)
    expect(player.foodSaturation).toBe(0.5)
  })
}
