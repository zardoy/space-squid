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

const generateRareBuilds2 = (chunk, worldX, worldZ, get2DNoise, startY) => {
  const rarityNoise = Math.abs(get2DNoise(worldX * 0.01, worldZ * 0.01))
  if (rarityNoise > 0 && rarityNoise < /* 0.0002 */0.01) {
    const build = buildsSchematics.house
    console.log('Generated rare build', worldX, worldZ)
    genBuild(build, chunk, startY, 0, 0)
  }
}

const genBuild = (build, chunk, startY, startX, startZ) => {
  for (let y = 0; y < build.length; y++) {
    for (let x = 0; x < build[y].length; x++) {
      let z = 0
      let i = 0
      while (true) {
        const block = build[y][x][i]
        if (!block) break
        let repeat = 1
        let blockType: string
        if (block.match(/\d+x/)) {
          const [r, b] = block.split('x')
          repeat = parseInt(r)
          blockType = b
        } else {
          blockType = block
        }
        if (repeat === 0) throw new Error('Repeat cannot be 0')
        for (let j = 0; j < repeat; j++) {
          chunk.setBlock(startX + x, startY + y, startZ + z, blockType)
          z++
        }
        i++
      }
    }
  }
}

const generateMines = (chunk, worldX, worldZ, get2DNoise) => {
  const rarityNoise = Math.abs(get2DNoise(worldX * 0.01, worldZ * 0.01))
  if (rarityNoise > 0 && rarityNoise < 0.01) {
    genBuild(buildsSchematics.mineshaft, chunk, 10, 6, 6)
  }
}

const repeatArr = (arr, repeat) => {
  const newArr = [] as any
  for (let i = 0; i < repeat; i++) {
    newArr.push(arr)
  }
  return newArr
}

const buildsSchematics = {
  mineshaft: [
    [
      ['5xoak_planks', '5xoak_planks', '5xoak_planks', '5xoak_planks', '5xoak_planks'],
      ['5xoak_planks', '5xoak_planks', '5xoak_planks', '5xoak_planks', '5xoak_planks'],
      ['5xoak_planks', '5xoak_planks', '5xoak_planks', '5xoak_planks', '5xoak_planks'],
      ['5xoak_planks', '5xoak_planks', '5xoak_planks', '5xoak_planks', '5xoak_planks'],
      ['5xoak_planks', '5xoak_planks', '5xoak_planks', '5xoak_planks', '5xoak_planks']
    ],
    // Main shaft
    [
      ['5xoak_planks', '15xair'],
      ['oak_planks', '3xair', 'oak_planks', '9xair', 'oak_planks', '3xair', 'oak_planks'],
      ['oak_planks', '3xair', 'oak_planks', '9xair', 'oak_planks', '3xair', 'oak_planks'],
      ['oak_planks', '3xair', 'oak_planks', '9xair', 'oak_planks', '3xair', 'oak_planks']
    ],
    // Bottom layer
    [
      ['5xoak_planks', '5xoak_planks', '5xoak_planks', '5xoak_planks', '5xoak_planks'],
      ['5xoak_planks', '5xoak_planks', '5xoak_planks', '5xoak_planks', '5xoak_planks'],
      ['5xoak_planks', '5xoak_planks', '5xoak_planks', '5xoak_planks', '5xoak_planks'],
      ['5xoak_planks', '5xoak_planks', '5xoak_planks', '5xoak_planks', '5xoak_planks'],
      ['5xoak_planks', '5xoak_planks', '5xoak_planks', '5xoak_planks', '5xoak_planks']
    ]
  ],
  house: [
    // Roof
    ['5xoak_planks', '5xoak_planks', '5xoak_planks', '5xoak_planks', '5xoak_planks'],
    // Walls
    ['5xoak_planks', 'air', '5xoak_planks', 'air', '5xoak_planks', 'air', '5xoak_planks'],
    ['5xoak_planks', 'air', '5xoak_planks', 'air', '5xoak_planks', 'air', '5xoak_planks'],
    ['5xoak_planks', 'air', '5xoak_planks', 'air', '5xoak_planks', 'air', '5xoak_planks'],
    // Floor
    ['5xoak_planks', '5xoak_planks', '5xoak_planks', '5xoak_planks', '5xoak_planks'],
  ],
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

// function generateMines (chunk, x, z, noise2D, get3DNoise) {
//   const mineFrequency = 0.01 // Adjust frequency to control mine density

//   // Iterate through the chunk to place mineshafts
//   for (let y = 1; y < chunk.getHeight(); y++) {
//     // Use 3D noise to determine if a mineshaft should be generated at this location
//     const noiseValue = get3DNoise(x, y, z)
//     if (noiseValue < mineFrequency) {
//       // Generate mineshaft at this location
//       generateMineshaft(x,  z, noise2D, get3DNoise)
//     }
//   }
// }

const SimplexNoise = require('simplex-noise')

function generateMineshafts2 (chunkX, chunkZ, chunk, simplex2D, simplex3D) {
  const chunkSize = 16
  const mineshaftThreshold = 0.5
  const mineshaftFrequency = 0.05
  const mineshaftHeight = 30
  const mineshaftRadius = 1
  const rareOreThreshold = 0.8

  const directions = [
    [1, 0], [-1, 0], [0, 1], [0, -1] // Possible directions for mineshaft segments
  ]

  let currentX = -1
  let currentZ = -1
  let currentDirection = [0, 0]

  while (true) {
    const worldX = chunkX * chunkSize + currentX
    const worldZ = chunkZ * chunkSize + currentZ
    const mineshaftNoise = simplex2D(worldX * mineshaftFrequency, worldZ * mineshaftFrequency)

    if (mineshaftNoise > mineshaftThreshold && currentX >= 0 && currentX < chunkSize && currentZ >= 0 && currentZ < chunkSize) {
      for (let x = currentX - mineshaftRadius; x <= currentX + mineshaftRadius; x++) {
        for (let z = currentZ - mineshaftRadius; z <= currentZ + mineshaftRadius; z++) {
          for (let y = mineshaftHeight - mineshaftRadius; y <= mineshaftHeight + mineshaftRadius; y++) {
            if (x >= 0 && x < chunkSize && z >= 0 && z < chunkSize) {
              const blockType = 'oak_planks'
              chunk.setBlock(x, y, z, blockType)

              // Add torches to the mineshaft
              if (y === mineshaftHeight) {
                chunk.setBlock(x, y + 1, z, 'torch')
              }

              // Add rare ores to the mineshaft floor
              if (y === mineshaftHeight - mineshaftRadius && simplex2D(worldX * 0.3, worldZ * 0.3) > rareOreThreshold) {
                chunk.setBlock(x, y, z, 'diamond_ore')
              }
            }
          }
        }
      }

      // Choose a new direction for the mineshaft
      const directionNoise = simplex2D(worldX * 0.1, worldZ * 0.1)
      const newDirection = directions[Math.floor((directionNoise + 1) / 2 * directions.length)]

      currentX += newDirection[0]
      currentZ += newDirection[1]
      currentDirection = newDirection
    } else {
      // If no valid mineshaft position is found, try a new starting position
      currentX = Math.floor(simplex2D(chunkX * mineshaftFrequency * 10, chunkZ * mineshaftFrequency * 10) * chunkSize)
      currentZ = Math.floor(simplex2D(chunkX * mineshaftFrequency * 10, chunkZ * mineshaftFrequency * 10 + 1000) * chunkSize)
      currentDirection = [0, 0]
    }

    // Stop generating mineshafts if we've gone too far from the chunk
    if (currentX < -mineshaftRadius || currentX >= chunkSize + mineshaftRadius || currentZ < -mineshaftRadius || currentZ >= chunkSize + mineshaftRadius) {
      break
    }
  }
}

// function generateMineshafts (chunkX, chunkZ, chunk, noise2D, noise3D) {
//   const chunkSize = 16
//   const mineshaftThreshold = 0.6
//   const mineshaftFrequency = 0.05
//   const mineshaftRadius = 3

//   for (let x = 0; x < chunkSize; x++) {
//     for (let z = 0; z < chunkSize; z++) {
//       const worldX = chunkX * chunkSize + x
//       const worldZ = chunkZ * chunkSize + z
//       const mineshaftNoise = noise2D(worldX * mineshaftFrequency, worldZ * mineshaftFrequency)

//       if (mineshaftNoise > mineshaftThreshold) {
//         const mineshaftHeight = Math.floor(noise2D(worldX * 0.1, worldZ * 0.1) * 20) + 30

//         for (let y = mineshaftHeight - mineshaftRadius; y < mineshaftHeight + mineshaftRadius; y++) {
//           const distanceFromCenter = Math.sqrt(
//             (x - chunkSize / 2) ** 2 + (y - mineshaftHeight) ** 2 + (z - chunkSize / 2) ** 2
//           )

//           if (distanceFromCenter <= mineshaftRadius) {
//             const blockType = noise3D(worldX * 0.2, y * 0.2, worldZ * 0.2) > 0.5 ? 'oak_planks' : 'air'
//             chunk.setBlock(x, y, z, blockType)
//           }
//         }
//       }
//     }
//   }
// }

// function generateMineshaft (chunk, x, y, z, get3DNoise) {
//   const shaftWidth = 3 // Width of the mineshaft
//   const shaftHeight = 3 // Height of the mineshaft
//   const airSpace = 1 // Space between tunnel and walls

//   // Generate central tunnel of the mineshaft
//   for (let dx = -shaftWidth; dx <= shaftWidth; dx++) {
//     for (let dz = -shaftWidth; dz <= shaftWidth; dz++) {
//       for (let dy = 0; dy < shaftHeight; dy++) {
//         if (Math.abs(dx) < airSpace && Math.abs(dz) < airSpace) {
//           // Leave space for the central tunnel
//           chunk.setBlock(x + dx, y + dy, z + dz, 'stone')
//         } else {
//           // Clear out the surrounding area for air space
//           chunk.setBlock(x + dx, y + dy, z + dz, 'air')
//         }
//       }
//     }
//   }

//   // Add some additional features like support beams, ores, etc.
//   addSupportBeams(chunk, x, y, z, shaftWidth)
//   addOres(chunk, x, y, z, shaftWidth, get3DNoise)
// }

function addSupportBeams (chunk, x, y, z, shaftWidth) {
  // Add support beams along the walls of the mineshaft
  for (let dy = 1; dy < shaftWidth; dy++) {
    chunk.setBlock(x - shaftWidth, y + dy, z, 'oak_log')
    chunk.setBlock(x + shaftWidth, y + dy, z, 'oak_log')
    chunk.setBlock(x, y + dy, z - shaftWidth, 'oak_log')
    chunk.setBlock(x, y + dy, z + shaftWidth, 'oak_log')
  }
}

function addOres (chunk, x, y, z, shaftWidth, get3DNoise) {
  // Add random ores within the mineshaft
  const oreTypes = ['coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore'] // Types of ores to generate
  const oreFrequency = 0.02 // Adjust frequency to control ore density

  for (let dx = -shaftWidth; dx <= shaftWidth; dx++) {
    for (let dz = -shaftWidth; dz <= shaftWidth; dz++) {
      for (let dy = 1; dy < shaftWidth; dy++) {
        // Use 3D noise to determine if an ore should be generated at this location
        const noiseValue = get3DNoise(x + dx, y + dy, z + dz)
        if (noiseValue < oreFrequency) {
          // Choose a random ore type and place it at this location
          const oreType = oreTypes[Math.floor(Math.random() * oreTypes.length)]
          chunk.setBlock(x + dx, y + dy, z + dz, oreType)
        }
      }
    }
  }
}


const buildingGenerators = [
  {
    generate: generateUndergroundHouse,
    rarity: 0
  }
]

function generateRareBuilds (chunk, worldX, worldZ, get2DNoise) {
  // Add rare generated builds based on some condition
  const rarityNoise = get2DNoise(worldX * 10, worldZ * 10)
  for (const buildingGenerator of buildingGenerators) {
    if (rarityNoise < buildingGenerator.rarity) {
      console.count('Generated rare build')
      buildingGenerator.generate(chunk, worldX, worldZ)
    }
  }
}

function generateUndergroundHouse (chunk, x, z) {
  const houseWidth = 16
  const houseHeight = 4
  const floorHeight = 3
  const startY = 15
  chunk.setOffset(new Vec3(0, startY, 0))

  // Generate stone brick walls
  for (let y = 0; y < houseHeight * floorHeight; y++) {
    for (let dx = 0; dx < houseWidth; dx++) {
      for (let dz = 0; dz < houseWidth; dz++) {
        if (dx === 0 || dz === 0 || dx === houseWidth - 1 || dz === houseWidth - 1) {
          chunk.setBlock(x + dx, y, z + dz, 'stone_bricks')
        } else {
          // Fill interior with air
          chunk.setBlock(x + dx, y, z + dz, 'air')
        }
      }
    }
  }

  // Generate floors
  for (let floor = 0; floor < houseHeight; floor++) {
    for (let dx = 1; dx < houseWidth - 1; dx++) {
      for (let dz = 1; dz < houseWidth - 1; dz++) {
        chunk.setBlock(x + dx, floor * floorHeight, z + dz, 'stone_bricks')
      }
    }
  }

  // Add wooden trapdoors on top
  const trapdoorPositions = [
    { x: 2, z: 0 },
    { x: houseWidth - 3, z: 0 },
    { x: 0, z: 2 },
    { x: 0, z: houseWidth - 3 }
  ]
  for (const pos of trapdoorPositions) {
    chunk.setBlock(x + pos.x, houseHeight * floorHeight - 1, z + pos.z, 'oak_trapdoor[facing=south,half=top,open=false]')
  }

  // Add torches
  chunk.setBlock(x + 2, 2, z + 2, 'torch')
  chunk.setBlock(x + houseWidth - 3, 2, z + 2, 'torch')

  // Add a crafting table
  chunk.setBlock(x + 2, 1, z + houseWidth - 3, 'crafting_table')

  // Add a bed
  chunk.setBlock(x + houseWidth - 3, 1, z + houseWidth - 3, 'red_bed[facing=east]')

  // Add a chest
  chunk.setBlock(x + 1, 1, z + houseWidth - 3, 'chest[facing=east]')

  chunk.setOffset(new Vec3(0, 0, 0))
}
