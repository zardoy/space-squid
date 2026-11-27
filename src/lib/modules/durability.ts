/**
 * Tool wear: mining blocks and hitting mobs use up the durability of the tool in the hand (survival and adventure only). A tool that is used up is removed and the
 * clients get the "item broke" status (`entity_status` 47 main hand / 48 off hand): the client plays the break sound and shows the particles.
 * No unbreaking / mending; armour does not wear (yet).
 */
const TOOL = /(pickaxe|_axe|shovel|hoe|sword|shears|trident|fishing_rod|flint_and_steel|bow|crossbow)$/

export const player = function (player: Player, serv: Server) {
  const mcData = serv.mcData

  /** wears the item in the main hand by `amount`; returns true when it broke */
  player.damageHeldItem = (amount = 1) => {
    if (player.gameMode === 1 || player.gameMode === 3) return false
    const slot = 36 + player.heldItemSlot
    const item = player.inventory.slots[slot]
    if (!item || !TOOL.test(item.name)) return false
    const max = (item as any).maxDurability ?? (mcData.items[item.type] as any)?.maxDurability
    if (!max) return false
    const used = ((item as any).durabilityUsed ?? 0) + amount
    ;(item as any).durabilityUsed = used
    if (used >= max) {
      player.inventory.updateSlot(slot, null as any)
      player._client.write('entity_status', { entityId: player.id, entityStatus: 47 })
      player._writeOthersNearby('entity_status', { entityId: player.id, entityStatus: 47 })
      player.emit('toolBroke' as any, item)
      return true
    }
    player.inventory.updateSlot(slot, item)
    return false
  }
}

declare global {
  interface Player {
    /** wears the tool in the main hand (survival / adventure); true when it broke and was removed */
    damageHeldItem: (amount?: number) => boolean
  }
}
