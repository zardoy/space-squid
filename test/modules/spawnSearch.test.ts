import { describe, expect, it } from 'vitest'
import { Vec3 } from 'vec3'
import { findSurfaceSpawn, respawnPosInColumn, spawnChunkSpiral, SpawnColumn } from '../../src/lib/spawnSearch'

const FULL = [[0, 0, 0, 1, 1, 1]]
const solid = (name: string) => ({ name, boundingBox: 'block', shapes: FULL })
const air = { name: 'air', boundingBox: 'empty', shapes: [] }
const plant = { name: 'short_grass', boundingBox: 'empty', shapes: [] }
const water = { name: 'water', boundingBox: 'empty', shapes: [] }

/** one column (all x/z alike): blocks by y, air elsewhere */
const column = (blocks: Record<number, any>): SpawnColumn => ({ getBlock: (p: Vec3) => blocks[p.y] ?? air })

describe('respawnPosInColumn (vanilla getLevelRespawnPos)', () => {
  it('spawns on the top block, not in a cave below it', () => {
    // stone top at 80, a cave (air) at 60..70, stone below
    const blocks: Record<number, any> = { 80: solid('stone'), 79: solid('stone'), 59: solid('stone') }
    expect(respawnPosInColumn(column(blocks), 3, 5, -64, 320)).toEqual(new Vec3(3, 81, 5))
  })

  it('walks through plants to the ground', () => {
    expect(respawnPosInColumn(column({ 65: plant, 64: solid('grass_block') }), 0, 0, -64, 320)).toEqual(new Vec3(0, 65, 0))
  })

  it('skips a column topped by water (ocean, lake) and a waterlogged top', () => {
    expect(respawnPosInColumn(column({ 62: water, 61: water, 50: solid('sand') }), 0, 0, -64, 320)).toBeNull()
    const waterlogged = { ...solid('oak_stairs'), getProperties: () => ({ waterlogged: true }) }
    expect(respawnPosInColumn(column({ 62: waterlogged, 50: solid('sand') }), 0, 0, -64, 320)).toBeNull()
  })

  it('does not stand on a block without a full top face (bottom slab), but on the block below', () => {
    const slab = { name: 'stone_slab', boundingBox: 'block', shapes: [[0, 0, 0, 1, 0.5, 1]] }
    expect(respawnPosInColumn(column({ 65: slab, 64: solid('dirt') }), 0, 0, -64, 320)).toEqual(new Vec3(0, 65, 0))
  })
})

describe('findSurfaceSpawn', () => {
  it('searches the spawn chunk, then the chunks around it in vanilla spiral order', async () => {
    const spiral = spawnChunkSpiral()
    expect(spiral).toHaveLength(121)
    expect(spiral.slice(0, 3)).toEqual([[0, 0], [1, 0], [1, 1]])
    // the origin chunk is all ocean, the next one in the spiral is land
    const seen: string[] = []
    const getColumn = async (cx: number, cz: number) => {
      seen.push(`${cx},${cz}`)
      return cx === 2 && cz === 3 ? column({ 62: water }) : column({ 70: solid('grass_block') })
    }
    const pos = await findSurfaceSpawn(getColumn, { x: 40, z: 50 }, -64, 320)
    expect(seen).toEqual(['2,3', '3,3'])
    expect(pos).toEqual(new Vec3(48, 71, 48))
  })
})
