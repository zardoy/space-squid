import { describe, expect, it, vi } from 'vitest'
import PrismarineItem from 'prismarine-item'
import { player as installInventory } from '../src/lib/modules/inventory'

describe('dropped stack count preservation bounty reproduction (issue #35)', () => {
  const version = '1.16.5'
  const Item = PrismarineItem(version)

  const createPlayerHarness = () => {
    const serv: any = {
      PrismarineItem: Item,
      _createChatComponent: () => ({ toNetworkFormat: () => ({}) }),
      supportFeature: () => true,
      tabComplete: { add: vi.fn() },
      commands: { add: vi.fn() }
    }

    const player: any = {
      id: 100,
      playSoundAtSelf: vi.fn(),
      writePacket: vi.fn(),
      onPacket: vi.fn(() => () => {}),
      _client: { on: vi.fn(), write: vi.fn() }
    }

    installInventory(player, serv, { version } as any)
    return { player, Item }
  }

  const createDroppedEntity = ({
    id = 42,
    itemId = 1, // stone
    itemDamage = 0,
    itemCount = 32
  }: {
    id?: number
    itemId?: number
    itemDamage?: number
    itemCount?: number
  } = {}) => {
    const entity: any = {
      id,
      itemId,
      itemDamage,
      itemCount,
      destroy: vi.fn(),
      _writeOthersNearby: vi.fn(),
      sendMetadata: vi.fn()
    }
    return entity
  }

  it('retains all 32 items when picked up into an empty inventory and destroys entity', () => {
    const { player } = createPlayerHarness()
    const dropped = createDroppedEntity({ itemCount: 32 })

    player.collect(dropped)

    // Verify inventory received 32 items
    const nonNullSlots = player.inventory.slots.filter((s: any) => s !== null && s !== undefined)
    expect(nonNullSlots).toHaveLength(1)
    expect(nonNullSlots[0].type).toBe(1)
    expect(nonNullSlots[0].count).toBe(32)

    // Verify entity was completely consumed and destroyed
    expect(dropped.itemCount).toBe(0)
    expect(dropped.destroy).toHaveBeenCalledTimes(1)
    expect(player.playSoundAtSelf).toHaveBeenCalledWith('random.pop')
    expect(dropped._writeOthersNearby).toHaveBeenCalledWith('collect', {
      collectedEntityId: dropped.id,
      collectorEntityId: player.id
    })
  })

  it('splits dropped count across an existing partial stack and an empty slot (60 stone + 32 dropped)', () => {
    const { player, Item } = createPlayerHarness()

    // Pre-fill a slot with 60 stone (capacity remaining = 4)
    const firstSlot = player.inventory.firstEmptyInventorySlot()
    player.inventory.updateSlot(firstSlot, new Item(1, 60, 0))

    const dropped = createDroppedEntity({ itemCount: 32 })
    player.collect(dropped)

    // First slot should be capped at 64
    expect(player.inventory.slots[firstSlot].count).toBe(64)

    // Remaining 28 should be placed into the next empty slot
    const stoneSlots = player.inventory.slots.filter((s: any) => s && s.type === 1)
    expect(stoneSlots).toHaveLength(2)
    const totalStone = stoneSlots.reduce((sum: number, s: any) => sum + s.count, 0)
    expect(totalStone).toBe(92) // 60 + 32 = 92

    expect(dropped.itemCount).toBe(0)
    expect(dropped.destroy).toHaveBeenCalledTimes(1)
  })

  it('handles multi-stack drops exceeding max stack size (100 items into empty inventory)', () => {
    const { player } = createPlayerHarness()
    const dropped = createDroppedEntity({ itemCount: 100 })

    player.collect(dropped)

    const stoneSlots = player.inventory.slots.filter((s: any) => s && s.type === 1)
    expect(stoneSlots).toHaveLength(2)
    expect(stoneSlots[0].count).toBe(64)
    expect(stoneSlots[1].count).toBe(36)
    expect(dropped.destroy).toHaveBeenCalledTimes(1)
    expect(dropped.itemCount).toBe(0)
  })

  it('preserves remainder on entity when inventory runs out of capacity', () => {
    const { player, Item } = createPlayerHarness()

    // Fill all slots except 1 with dirt (type 3)
    while (player.inventory.firstEmptyInventorySlot() !== null) {
      const slot = player.inventory.firstEmptyInventorySlot()
      player.inventory.updateSlot(slot, new Item(3, 64, 0))
    }

    // Free exactly one slot
    player.inventory.updateSlot(36, null)
    expect(player.inventory.firstEmptyInventorySlot()).toBe(36)

    // Drop 100 stone: only 64 will fit in the 1 free slot, 36 must remain on entity
    const dropped = createDroppedEntity({ itemCount: 100 })
    player.collect(dropped)

    expect(player.inventory.slots[36].count).toBe(64)
    expect(dropped.itemCount).toBe(36)
    expect(dropped.destroy).not.toHaveBeenCalled()
    expect(dropped._writeOthersNearby).toHaveBeenCalledTimes(1)
  })

  it('leaves dropped entity untouched when inventory is 100% full', () => {
    const { player, Item } = createPlayerHarness()

    // Fill all inventory slots completely with dirt
    while (player.inventory.firstEmptyInventorySlot() !== null) {
      const slot = player.inventory.firstEmptyInventorySlot()
      player.inventory.updateSlot(slot, new Item(3, 64, 0))
    }

    const dropped = createDroppedEntity({ itemCount: 32 })
    player.collect(dropped)

    expect(dropped.itemCount).toBe(32)
    expect(dropped.destroy).not.toHaveBeenCalled()
    expect(dropped._writeOthersNearby).not.toHaveBeenCalled()
    expect(player.playSoundAtSelf).not.toHaveBeenCalled()
  })

  it('does not merge into existing stack if item damage/metadata does not match', () => {
    const { player, Item } = createPlayerHarness()

    // Place 10 red wool (type 35, metadata 14) in slot
    const slot = player.inventory.firstEmptyInventorySlot()
    player.inventory.updateSlot(slot, new Item(35, 10, 14))

    // Drop 16 blue wool (type 35, itemDamage 11)
    const dropped = createDroppedEntity({ itemId: 35, itemDamage: 11, itemCount: 16 })
    player.collect(dropped)

    // Red wool stack should remain 10
    expect(player.inventory.slots[slot].count).toBe(10)
    expect(player.inventory.slots[slot].metadata).toBe(14)

    // Blue wool should be in a separate slot
    const blueWoolSlot = player.inventory.slots.find((s: any) => s && s.type === 35 && s.metadata === 11)
    expect(blueWoolSlot).toBeDefined()
    expect(blueWoolSlot.count).toBe(16)
    expect(dropped.destroy).toHaveBeenCalledTimes(1)
  })

  it('gracefully handles legacy entity with undefined itemCount (defaults to 1)', () => {
    const { player } = createPlayerHarness()
    const dropped = createDroppedEntity()
    delete dropped.itemCount // simulate legacy entity without itemCount property

    player.collect(dropped)

    const nonNullSlots = player.inventory.slots.filter((s: any) => s !== null && s !== undefined)
    expect(nonNullSlots).toHaveLength(1)
    expect(nonNullSlots[0].count).toBe(1)
    expect(dropped.destroy).toHaveBeenCalledTimes(1)
  })
})
