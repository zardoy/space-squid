import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import Behavior from '../behavior'
import { player as installRespawn } from './respawn'

function setup (feature: 'respawnIsPayload' | 'respawnIsActionId') {
  const client = new EventEmitter() as EventEmitter & { write: ReturnType<typeof vi.fn> }
  client.write = vi.fn()
  const target = new class extends EventEmitter {
    _client = client
    position = { x: 100, y: 64, z: 100 }
    spawnPoint = { x: 0, y: 80, z: 0 }
    world = {}
    health = 0
    gameMode = 0
    prevGameMode = 0
    nearbyEntities = ['old']
    sendSelfPosition = vi.fn()
    updateHealth = vi.fn()
    updateAndSpawn = vi.fn()
    behavior = Behavior(this)
  }()
  installRespawn(target as unknown as Player, {
    supportFeature: (name: string) => name === feature,
    dimensionNames: ['minecraft:overworld']
  } as unknown as Server)
  const request = () => client.emit('client_command', feature === 'respawnIsPayload' ? { payload: 0 } : { actionId: 0 })
  const done = () => new Promise<void>(resolve => target.once('requestRespawn_done', () => resolve()))
  return { target, client, request, done }
}

describe.each(['respawnIsPayload', 'respawnIsActionId'] as const)('respawn using %s', feature => {
  it('ignores non-respawn client commands', () => {
    const { target, client } = setup(feature)
    const originalPosition = target.position
    client.emit('client_command', feature === 'respawnIsPayload' ? { payload: 1 } : { actionId: 1 })
    expect(target.position).toBe(originalPosition)
    expect(client.write).not.toHaveBeenCalled()
  })

  it('leaves position and client state unchanged when a plugin cancels respawn', async () => {
    const { target, client, request, done } = setup(feature)
    const originalPosition = target.position
    target.on('requestRespawn_cancel', (_data, cancel) => cancel())
    const completed = done()
    request()
    await completed
    expect(target.position).toBe(originalPosition)
    expect(client.write).not.toHaveBeenCalled()
    expect(target.sendSelfPosition).not.toHaveBeenCalled()
    expect(target.updateHealth).not.toHaveBeenCalled()
    expect(target.updateAndSpawn).not.toHaveBeenCalled()
    expect(target.nearbyEntities).toEqual(['old'])
  })

  it('waits for asynchronous plugin approval before moving or sending a respawn', async () => {
    const { target, client, request, done } = setup(feature)
    const originalPosition = target.position
    let approve!: () => void
    target.on('requestRespawn_cancel', () => new Promise<void>(resolve => { approve = resolve }))
    const completed = done()
    request()
    expect(target.position).toBe(originalPosition)
    expect(client.write).not.toHaveBeenCalled()
    approve()
    await completed
    expect(target.position).toBe(target.spawnPoint)
    expect(client.write).toHaveBeenCalledWith('respawn', expect.any(Object))
    expect(target.sendSelfPosition).toHaveBeenCalledOnce()
    expect(target.updateHealth).toHaveBeenCalledWith(20)
    expect(target.updateAndSpawn).toHaveBeenCalledOnce()
    expect(target.nearbyEntities).toEqual([])
  })
})
