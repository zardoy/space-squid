import MinecraftData from 'minecraft-data'
import PrismarineBlock from 'prismarine-block'
import { Vec3 } from 'vec3'
import { describe, expect, test } from 'vitest'
import { player as registerPlayer, server as registerPlacement } from './placeBlock'

const version = '1.20.4'
const mcData = MinecraftData(version)
const Block = PrismarineBlock(version)

function createServer () {
  const serv = {
    mcData,
    supportFeature: (feature: string) => feature === 'theFlattening',
    warn: (message: string) => { throw new Error(message) }
  } as unknown as Server
  registerPlacement(serv, { version } as Options)
  return serv
}

describe('block state properties', () => {
  test.each(['conduit', 'tube_coral_fan'])('places %s without water on dry land', (name) => {
    const serv = createServer()
    const block = mcData.blocksByName[name]
    const item = mcData.itemsByName[block.name]
    const placed = serv.placeItem({ item: { type: item.id }, properties: { waterlogged: false } })
    const result = Block.fromStateId(block.minStateId! + placed.data, 0)

    expect(result.name).toBe(block.name)
    expect(result.getProperties().waterlogged).toBe(false)
  })

  test.each(['conduit', 'tube_coral_fan'])('keeps %s waterlogged when placed in water', (name) => {
    const serv = createServer()
    const block = mcData.blocksByName[name]
    const item = mcData.itemsByName[name]
    const placed = serv.placeItem({ item: { type: item.id }, properties: { waterlogged: true } })

    expect(Block.fromStateId(block.minStateId! + placed.data, 0).getProperties().waterlogged).toBe(true)
  })

  test('preserves properties not supplied by a placement handler', () => {
    const serv = createServer()
    const block = mcData.blocksByName.oak_sign
    const base = Block.fromProperties(block.id, { rotation: 7, waterlogged: true }, 0)
    const data = serv.setBlockDataProperties(base.stateId - block.minStateId!, block.states, {})

    expect(data + block.minStateId!).toBe(base.stateId)
  })

  test('preserves a base property when its replacement is undefined', () => {
    const serv = createServer()
    const block = mcData.blocksByName.conduit
    const data = serv.setBlockDataProperties(0, block.states, { waterlogged: undefined })

    expect(Block.fromStateId(block.minStateId! + data, 0).getProperties().waterlogged).toBe(true)
  })

  test('sets zero rotation while preserving the waterlogged property', () => {
    const serv = createServer()
    const block = mcData.blocksByName.oak_sign
    const base = Block.fromProperties(block.id, { rotation: 7, waterlogged: true }, 0)
    const data = serv.setBlockDataProperties(base.stateId - block.minStateId!, block.states, { rotation: 0 })
    const result = Block.fromStateId(block.minStateId! + data, 0)

    expect(result.getProperties()).toEqual({ rotation: '0', waterlogged: true })
  })

  test('sets false in a multi-property block without changing other state values', () => {
    const serv = createServer()
    const block = mcData.blocksByName.oak_sign
    const base = Block.fromProperties(block.id, { rotation: 7, waterlogged: true }, 0)
    const data = serv.setBlockDataProperties(base.stateId - block.minStateId!, block.states, { waterlogged: false })

    expect(Block.fromStateId(block.minStateId! + data, 0).getProperties()).toEqual({ rotation: '7', waterlogged: false })
  })

  test('updates an enum property without changing the omitted boolean property', () => {
    const serv = createServer()
    const block = mcData.blocksByName.oak_wall_sign
    const base = Block.fromProperties(block.id, { facing: 'north', waterlogged: true }, 0)
    const data = serv.setBlockDataProperties(base.stateId - block.minStateId!, block.states, { facing: 'east' })

    expect(Block.fromStateId(block.minStateId! + data, 0).getProperties()).toEqual({ facing: 'east', waterlogged: true })
  })

  test('places a dry conduit through the player handler and consumes one survival item', async () => {
    const serv = createServer()
    serv.playSound = () => {}
    const handlers = new Map<string, (packet: any) => Promise<void>>()
    const placedBlocks: { position: Vec3, stateId: number }[] = []
    const heldItem = { type: mcData.itemsByName.conduit.id, count: 2 }
    const slots: any[] = []
    slots[36] = heldItem
    const player = {
      _client: { on: (name: string, handler: (packet: any) => Promise<void>) => handlers.set(name, handler) },
      world: {
        getBlock: async (position: Vec3) => Block.fromStateId(
          position.y === 63 ? mcData.blocksByName.stone.defaultState! : mcData.blocksByName.air.defaultState!, 0
        )
      },
      position: new Vec3(5, 64, 5),
      heldItemSlot: 0,
      inventory: { slots, updateSlot: (slot: number, item: any) => { slots[slot] = item } },
      gameMode: 0,
      crouching: false,
      emit: () => {},
      setBlock: (position: Vec3, stateId: number) => placedBlocks.push({ position, stateId })
    } as unknown as Player
    registerPlayer(player, serv, { version } as Options)

    await handlers.get('block_place')!({
      direction: 1,
      location: { x: 0, y: 63, z: 0 },
      cursorY: 0.5,
      hand: 0
    })

    expect(placedBlocks).toHaveLength(1)
    expect(placedBlocks[0].position).toEqual(new Vec3(0, 64, 0))
    const placed = Block.fromStateId(placedBlocks[0].stateId, 0)
    expect(placed.name).toBe('conduit')
    expect(placed.getProperties().waterlogged).toBe(false)
    expect(heldItem.count).toBe(1)
  })
})
