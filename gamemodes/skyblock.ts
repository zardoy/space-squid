import { Vec3 } from 'vec3'

type BlockCategory = 'fullBlock' | 'ore' | 'plant' | 'sappling' | 'redstone' | 'decoration' | ''

export type ServerExtension = {
  isSingleplayer: boolean
  registerBlockItems (opts: {

  })
  blockItemsSelector (opts: { includeOnly?: string[], exclude?: string[], category: BlockCategory, dimensionCategory?: 'overworld' | 'nether' | 'end' }): string[]
}

export type GameModeRunnerMetadata = {
  runner (server: Server, ext: ServerExtension)
  templateConstructor?(server: Server, ext: ServerExtension)
}

const COBBLESTONE_PLACE = { x: 0, y: 0, z: 0 }

const metadata: {
  runner (server: Server)
} = {
  runner: (server: Server, ext: ServerExtension) => {
    // scoreboard
    const sendScoreboard = (player: Player) => {
      const linesTemplate = [
        "Island Name",
        "Island Score: <score> (#<rank>)",
        "Total Time on Island",
        "",
      ]
    }

    // cobblestone generator
    const setCobblestone = (player: Player) => {
      server.setBlock(server.overworld, new Vec3(COBBLESTONE_PLACE.x, COBBLESTONE_PLACE.y, COBBLESTONE_PLACE.z), 'cobblestone')
    }
    server.onBlockInteraction(ext.blockItemsSelector({ category: 'fullBlock' }), ({ block, player }) => {
      setCobblestone(player)
    })

    // tree logic
    const placeTree = (pos: Vec3, player: Player) => {
      const tree = [
        [0, 0, 0],
        [0, 1, 0],
        [0, 2, 0],
      ]
      tree.forEach(([x, y, z]) => {
        server.setBlock(server.overworld, new Vec3(pos.x + x, pos.y + y, pos.z + z), 'oak_log')
      })
    }

    server.onBlockInteraction(ext.blockItemsSelector({ category: 'plant' }), ({ block, player }) => {
      block.databaseStore.growCount = (block.databaseStore.growCount ?? 0) + 1
      if (block.databaseStore.growCount >= 10) {
        placeTree(block.position, player)
      }
    })
  },
}
