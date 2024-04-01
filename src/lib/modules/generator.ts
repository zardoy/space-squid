import PrismarineChunk from 'prismarine-chunk'
import minecraftData from 'minecraft-data'
import { Vec3 } from 'vec3'
import { createNoise3D, createNoise2D } from 'simplex-noise'

export const server = () => { }
export const player = () => { }

export default ({ version }) => {
  const Chunk = PrismarineChunk(version)
  const data = minecraftData(version)
  // const noise = createNoise3D()
  const noise2d = fbm2d(createNoise2D())
  return (chunkX, chunkZ) => {
    const chunk = new Chunk({
      x: chunkX, z: chunkZ
    })
    const chunkSize = 16
    // for (let x = 0; x < chunkSize; x++) {
    //   for (let z = 0; z < chunkSize; z++) {
    //     chunk.setBlockStateId(new Vec3(x, noise2d(x + chunkX * 16, z + chunkZ * 16) * 256, z), data.blocksByName['grass_block']!.defaultState!)
    //   }
    // }
    generateChunk(chunkX, chunkZ, {
      setBlock (x, y, z, block) {
        chunk.setBlockStateId(new Vec3(x, y, z), data.blocksByName[block]!.defaultState!)
      }
    }, noise2d)
    return chunk
  }
}

function fbm2d (noise2D) {
  const octaves = 2
  return function fbm2dFn (x: number, y: number) {
    let value = 0.0
    let amplitude = 0.5
    for (let i = 0; i < octaves; i++) {
      value += noise2D(x, y) * amplitude
      x *= 0.5
      y *= 0.5
      amplitude *= 0.8
    }
    return value
  }
}

// const noise = require('perlin-noise')

// function generateChunk (chunkX: number, chunkZ: number, chunk: { setBlock: any }, get2DNoise: any) {
//   const chunkSize = 16
//   const maxHeight = 100
//   const hillFrequency = 0.02
//   const forestThreshold = 0.6

//   for (let x = 0; x < chunkSize; x++) {
//     for (let z = 0; z < chunkSize; z++) {
//       const worldX = chunkX * chunkSize + x
//       const worldZ = chunkZ * chunkSize + z
//       const heightNoise = get2DNoise(worldX * hillFrequency, worldZ * hillFrequency)
//       const height = Math.floor((heightNoise + 1) * maxHeight / 2)

//       // Generate hills
//       for (let y = 0; y < height; y++) {
//         if (y === height - 1) {
//           chunk.setBlock(x, y, z, 'grass_block')
//         } else {
//           chunk.setBlock(x, y, z, 'stone')
//         }
//       }

//       // Generate forests
//       const forestNoise = get2DNoise(worldX * 0.1, worldZ * 0.1)
//       if (forestNoise > forestThreshold) {
//         const treeHeight = Math.floor(get2DNoise(worldX * 0.2, worldZ * 0.2) * 5) + 5
//         for (let y = height; y < height + treeHeight; y++) {
//           chunk.setBlock(x, y, z, 'oak_log')
//         }
//         chunk.setBlock(x, height + treeHeight, z, 'oak_leaves')
//       }
//     }
//   }
// }

function generateChunk (chunkX, chunkZ, chunk, get2DNoise) {
  const chunkSize = 16
  const freq = get2DNoise(chunkX, chunkZ)
  // const maxHeight = 100
  const maxHeight = 100/*  + freq * 5 */
  // const hillFrequency = 0.015 + freq < 0.15 ? 0 : freq * 0.008
  const hillFrequency = 0.015
  const forestThreshold = 0.6

  for (let x = 0; x < chunkSize; x++) {
    for (let z = 0; z < chunkSize; z++) {
      const worldX = chunkX * chunkSize + x
      const worldZ = chunkZ * chunkSize + z
      const heightNoise = get2DNoise(worldX * hillFrequency, worldZ * hillFrequency)
      const height = Math.floor((heightNoise + 1) * maxHeight / 2)

      // Generate terrain
      generateTerrain(chunk, x, z, height)

      // Generate forests
      generateForests(chunk, x, z, worldX, worldZ, height, get2DNoise, forestThreshold)

      // Add water at the bottom
      if (height <= 25) {
        chunk.setBlock(x, 25, z, 'water')
      }

      // Add rare generated builds
      generateRareBuilds(chunk, x, z, worldX, worldZ, get2DNoise)
    }
  }
}

function generateTerrain (chunk, x, z, height) {
  for (let y = 0; y < height; y++) {
    if (y === height - 1) {
      chunk.setBlock(x, y, z, 'grass_block')
    } else {
      chunk.setBlock(x, y, z, 'stone')
    }
  }
}

function generateForests (chunk, x, z, worldX, worldZ, height, get2DNoise, forestThreshold) {
  const forestNoise = get2DNoise(worldX * 0.1, worldZ * 0.1)
  if (forestNoise > forestThreshold) {
    const treeHeight = Math.floor(get2DNoise(worldX * 0.2, worldZ * 0.2) * 5) + 5
    for (let y = height; y < height + treeHeight; y++) {
      chunk.setBlock(x, y, z, 'oak_log')
    }
    // Generate more leaves on top
    for (let offsetY = 1; offsetY <= 3; offsetY++) {
      for (let offsetX = -2; offsetX <= 2; offsetX++) {
        for (let offsetZ = -2; offsetZ <= 2; offsetZ++) {
          chunk.setBlock(x + offsetX, height + treeHeight + offsetY, z + offsetZ, 'oak_leaves')
        }
      }
    }
  }
}

function generateRareBuilds (chunk, x, z, worldX, worldZ, get2DNoise) {
  // Add rare generated builds based on some condition
  const rarityNoise = get2DNoise(worldX * 0.05, worldZ * 0.05)
  if (rarityNoise > 0.9) {
    // Generate rare build
    // Example: chunk.setBlock(x, height, z, 'rare_block');
  }
}
