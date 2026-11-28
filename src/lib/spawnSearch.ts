import { Vec3 } from 'vec3'

/**
 * World spawn on the surface like vanilla (MinecraftServer.setInitialSpawn + PlayerSpawnFinder.getSpawnPosInChunk / getLevelRespawnPos):
 * search the spawn chunk and then the chunks around it (spiral, 11 x 11 chunks) for the first column whose top is dry, and spawn on its
 * top-most block with a full top face. Starting from the top of the column means never a cave; a column topped by water is skipped.
 */

/** blocks that hold a fluid (vanilla: a non-empty FluidState) */
const FLUID_BLOCKS = new Set(['water', 'lava', 'bubble_column', 'kelp', 'kelp_plant', 'seagrass', 'tall_seagrass'])

type ColumnBlock = { name: string, boundingBox?: string, shapes?: number[][], getProperties?: () => Record<string, unknown> }
export type SpawnColumn = { getBlock: (pos: Vec3) => ColumnBlock }

const hasFluid = (block: ColumnBlock) => FLUID_BLOCKS.has(block.name) || block.getProperties?.().waterlogged === true

/** Block.isFaceFull(collisionShape, UP): one collision box covers the whole top face */
const hasFullTopFace = (block: ColumnBlock) =>
  block.boundingBox === 'block' && (block.shapes ?? []).some(([x0, , z0, x1, y1, z1]) => x0 <= 0 && z0 <= 0 && x1 >= 1 && z1 >= 1 && y1 >= 1)

/** getLevelRespawnPos for a dimension without a ceiling: the feet position above the column's top full block, null when the top is a fluid */
export function respawnPosInColumn (column: SpawnColumn, x: number, z: number, minY: number, maxY: number): Vec3 | null {
  const local = new Vec3(x & 15, 0, z & 15)
  for (let y = maxY - 1; y >= minY; y--) {
    local.y = y
    const block = column.getBlock(local)
    if (hasFluid(block)) return null
    if (hasFullTopFace(block)) return new Vec3(x, y + 1, z)
  }
  return null
}

/** chunk offsets of vanilla's spawn search spiral: (0, 0) first, then outwards, within -5..5 */
export function spawnChunkSpiral (): Array<[number, number]> {
  const out: Array<[number, number]> = []
  let x = 0; let z = 0; let dx = 0; let dz = -1
  for (let i = 0; i < 121; i++) {
    if (x >= -5 && x <= 5 && z >= -5 && z <= 5) out.push([x, z])
    if (x === z || (x < 0 && x === -z) || (x > 0 && x === 1 - z)) { const t = dx; dx = -dz; dz = t }
    x += dx; z += dz
  }
  return out
}

/** first valid surface spawn around the block position `origin` (x, z), null when no column in 11 x 11 chunks has a dry top */
export async function findSurfaceSpawn (
  getColumn: (chunkX: number, chunkZ: number) => Promise<SpawnColumn>,
  origin: { x: number, z: number },
  minY: number,
  maxY: number
): Promise<Vec3 | null> {
  const ocx = Math.floor(origin.x / 16)
  const ocz = Math.floor(origin.z / 16)
  for (const [dx, dz] of spawnChunkSpiral()) {
    const column = await getColumn(ocx + dx, ocz + dz)
    const x0 = (ocx + dx) * 16
    const z0 = (ocz + dz) * 16
    for (let x = x0; x < x0 + 16; x++) {
      for (let z = z0; z < z0 + 16; z++) {
        const pos = respawnPosInColumn(column, x, z, minY, maxY)
        if (pos) return pos
      }
    }
  }
  return null
}
