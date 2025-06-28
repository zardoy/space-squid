module.exports = (options) => {
  const Chunk = require('prismarine-chunk')(options.version)
  const mcData = require('minecraft-data')(options.version)
  const stoneId = mcData.blocksByName.stone.id

  return (chunkX, chunkZ) => {
    const chunk = new Chunk()
    if (chunkX === 0 && chunkZ === 0) {
      chunk.setBlockType(new Vec3(0, 64, 0), stoneId)
    }
    return chunk
  }
}
