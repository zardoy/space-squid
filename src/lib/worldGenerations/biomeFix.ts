/**
 * prismarine-chunk (1.18+ chunks) `setBiome` computes the biome cell with `toBiomePos(pos)` without the chunk's minY, so every biome lands in the first
 * 4-block row of its section and the rest stays biome id 0 (the_void): wrong grass / foliage / water tints in the client. Replaces `setBiome` of the
 * instance by a version that uses the same cell as `getBiome`.
 */
export function fixSetBiome<T extends { biomes?: any[], minY?: number, setBiome?: (pos: any, id: number) => void }> (chunk: T): T {
  if (!Array.isArray(chunk.biomes) || typeof chunk.setBiome !== 'function') return chunk
  chunk.setBiome = function (this: any, pos: { x: number, y: number, z: number }, id: number) {
    const minY = this.minY ?? 0
    const section = this.biomes[(pos.y - minY) >> 4]
    if (section) section.set({ x: pos.x >> 2, y: ((pos.y - minY) & 0xF) >> 2, z: pos.z >> 2 }, id)
  }
  return chunk
}
