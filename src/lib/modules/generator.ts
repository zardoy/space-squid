import PrismarineChunk from 'prismarine-chunk'
import minecraftData from 'minecraft-data'
import { Vec3 } from 'vec3'
import { createNoise3D, createNoise2D } from 'simplex-noise'

export const server = () => { }
export const player = () => { }

export default ({ version }) => {
  const Chunk = PrismarineChunk(version)
  const data = minecraftData(version)
  const noise3d = createNoise3D()
  const noise2DRaw = createNoise2D()
  const noise2d = fbm2d(noise2DRaw)
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
    let offset = new Vec3(0, 0, 0)
    generateChunk(chunkX, chunkZ, {
      setBlock (x, y, z, block) {
        block = block.split('[')[0]
        const blockStat = data.blocksByName[block]!
        if (!blockStat) throw new Error(`Block ${block} not found`)
        chunk.setBlockStateId(new Vec3(x, y, z).add(offset), blockStat.defaultState!)
      },
      setOffset (newOffset) {
        offset = newOffset
      },
      getHeight () {
        return 100
      }
    }, noise2d, noise3d, noise2DRaw)
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

const waterLine = 25
function generateChunk (chunkX, chunkZ, chunk, get2DNoise, get3DNoise, noise2DRaw) {
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
      generateTerrain(chunk, x, z, height, noise2DRaw)
      generateOres(chunk, x, height, z, get3DNoise)

      // Add water at the bottom
      if (height <= waterLine) {
        chunk.setBlock(x, waterLine, z, 'water')
      } else {
        // Generate forests
        generateForests(chunk, x, z, worldX, worldZ, height, get2DNoise, forestThreshold)
      }

      // Add rare generated builds
    }
  }
  // generateRareBuilds(chunk, chunkX * chunkSize, chunkZ * chunkSize, get2DNoise)
  // generateMines(chunk, chunkX * chunkSize, chunkZ * chunkSize, get3DNoise)
  // generateMineshafts2(chunkX, chunkZ, chunk, get2DNoise, get3DNoise)
  // generateRareBuilds2(chunk, chunkX * chunkSize, chunkZ * chunkSize, noise2DRaw, 30)
  // generateMines(chunk, chunkX * chunkSize, chunkZ * chunkSize, get2DNoise)
}

function generateTerrain (chunk, x, z, height, noise2DRaw) {
  for (let y = 0; y < height; y++) {
    if (y === height - 1) {
      const isClay = y < waterLine && Math.abs(noise2DRaw(x, z)) < 0.05
      chunk.setBlock(x, y, z, isClay ? 'clay' : y < waterLine ? 'sand' : 'grass_block')
    } else {
      chunk.setBlock(x, y, z, 'stone')
    }
  }
}

const generateOres = (chunk, x, height, z, get3DNoise) => {
  const oreTypes = ['coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore'] // Types of ores to generate
  const oreFrequency = 0.005 // Adjust frequency to control ore density

  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dy = 1; dy < 3; dy++) {
        // Use 3D noise to determine if an ore should be generated at this location
        const noiseValue = get3DNoise(x + dx, 0 + dy, z + dz)
        if (noiseValue > 0 && noiseValue < oreFrequency) {
          // Choose a random ore type and place it at this location
          const oreType = oreTypes[Math.floor(Math.random() * oreTypes.length)]
          chunk.setBlock(x + dx, 0 + dy, z + dz, oreType)
        }
      }
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

function applyCellularAutomata(chunk) {
  const tempChunk = JSON.parse(JSON.stringify(chunk)); // Deep copy of chunk

  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = 1; y < 80; y++) {
        const airNeighbors = countAirNeighbors(chunk, x, y, z);
        if (chunk.getBlock(x, y, z) === 'air') {
          if (airNeighbors <= 9) {
            tempChunk.setBlock(x, y, z, 'stone');
          }
        } else {
          if (airNeighbors >= 12) {
            tempChunk.setBlock(x, y, z, 'air');
          }
        }
      }
    }
  }

  // Apply changes
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = 1; y < 80; y++) {
        chunk.setBlock(x, y, z, tempChunk.getBlock(x, y, z));
      }
    }
  }
}

function countAirNeighbors(chunk, x, y, z) {
  let count = 0;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        if (chunk.getBlock(x + dx, y + dy, z + dz) === 'air') {
          count++;
        }
      }
    }
  }
  return count;
}
