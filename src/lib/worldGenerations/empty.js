const { Vec3 } = require('vec3')

module.exports = (options) => {
  const Chunk = require('prismarine-chunk')(options.version)
  const mcData = require('minecraft-data')(options.version)
  const stoneId = mcData.blocksByName.stone.id
  // 1.18+ columns can have a custom height range (nether / end: 0..256)
  const chunkOptions = options.worldHeight !== undefined && options.minY !== undefined ? { minY: options.minY, worldHeight: options.worldHeight } : undefined

  return (chunkX, chunkZ) => {
    const chunk = new Chunk(chunkOptions)
    if (chunkX === 0 && chunkZ === 0) {
      chunk.setBlockType(new Vec3(0, 64, 0), stoneId)
    }
    return chunk
  }
}
