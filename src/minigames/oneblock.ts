import { Vec3 } from 'vec3'

const randomBlocksByEra: Record<string, string[]> = {
  wood: ['dirt', 'oak_planks', 'spruce_planks', 'birch_planks', 'jungle_planks', 'acacia_planks', 'dark_oak_planks'],
  mining: ['stone', 'iron_ore', 'granite', 'redstone_ore', 'diamond_ore', 'coal_ore'],
}

export const minigame = (server: Server) => {
  server.spawnPoint = new Vec3(0, 1, 0)

  const setBlock = (player: Player) => {
    const world = player.world
    const position = new Vec3(0, 0, 0)
    const column = world.getLoadedColumn(0, 0)
    if (!column) return
    let block = column.getBlock(position)
    while (!block) {
      try {
        const allBlockNames = Object.keys(randomBlocksByEra).flatMap(era => randomBlocksByEra[era])
        const blockName = allBlockNames[Math.floor(Math.random() * allBlockNames.length)]
        block = server.PrismarineBlock.fromStateId(server.mcData.blocksByName[blockName].defaultState, 0)
      } catch (error) {
        console.error(error)
      }
    }
    world.setBlock(position, block)
  }

  server.on('newPlayer', (player) => {
    // if player's inventory is empty give an iron pickaxe
    if (player.inventory.slots.length === 0) {
      server.handleCommand(`give ${player.name} iron_pickaxe 1`)
    }
    setBlock(player)

    player.on('dug_done', () => {
      setBlock(player)
    })
  })
}
