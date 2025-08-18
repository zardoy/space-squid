import { Vec3 } from 'vec3'
import { Block } from 'prismarine-block'
import { CustomWorld } from './world'

export const player = function (player: Player, serv: Server, { version }: Options) {
  const mcData = serv.mcData
  function cancelDig ({ position, block }) {
    player.sendBlock(position, block.type)
  }

  player._client.on('block_dig', ({ location, status, face }) => {
    if (status === 3 || status === 4) {
      const heldItem = player.inventory.slots[36 + player.heldItemSlot]
      if (!heldItem || heldItem.type === -1) return

      const count = (status === 4) ? 1 : heldItem.count

      heldItem.count -= count
      if (heldItem.count === 0) player.inventory.slots[36 + player.heldItemSlot] = null

      // TODO: correct position & velocity + physic simulation
      player.behavior('item_drop', {
        blockDropPosition: player.position,
        blockDropWorld: player.world,
        blockDropVelocity: new Vec3(0, 0, 0),
        blockDropId: heldItem.type,
        blockDropDamage: heldItem.metadata,
        blockDropCount: count,
        blockDropPickup: 500,
        blockDropDeath: 60 * 5 * 1000
      }, async (data) => {
        dropBlock(data)
      })
    } else if (status === 5) {
      // TODO: Shoot arrow / finish eating
    } else if (status === 6) {
      const currentSlot = player.inventory.slots[36 + player.heldItemSlot]
      const offhand = player.inventory.slots[45]

      player.inventory.updateSlot(36 + player.heldItemSlot, offhand!)
      player.inventory.updateSlot(45, currentSlot!)
    } else {
      let pos = new Vec3(location.x, location.y, location.z)

      let directionVector = directionToVector[face]
      if (!directionVector) {
        console.warn(`Unknown face ${face} of ${directionToVector.length} for player ${player.username}`)
        directionVector = new Vec3(0, 0, 0)
      }
      const facedPos = pos.plus(directionVector)

      const columnFaced = player.world.getLoadedColumnAt(facedPos)
      const columnBlock = player.world.getLoadedColumnAt(pos)
      if (!columnFaced || !columnBlock) {
        console.warn(`[Digging] Column not loaded for player ${player.username} at ${pos}`)
        return
      }
      const facedBlock = columnFaced.getBlock(new Vec3(facedPos.x & 15, facedPos.y, facedPos.z & 15))
      let block
      if (facedBlock.name === 'fire') {
        block = facedBlock
        pos = facedPos
      } else {
        block = columnBlock.getBlock(new Vec3(pos.x & 15, pos.y, pos.z & 15))
      }

      currentlyDugBlock = block
      if (currentlyDugBlock.type === 0) return
      if (status === 0) {
        if (player.gameMode === 1) {
          creativeDigging(pos)
        } else {
          startDigging(pos)
        }
      } else if (status === 1 || player.gameMode >= 2) {
        cancelDigging(pos)
      } else if (status === 2) {
        completeDigging(pos, directionVector)
      }
    }
  })

  function diggingTime () {
    // assume holding nothing and usual conditions
    const customBreakTime = player.customGetBreakTime(currentlyDugBlock)
    if (customBreakTime !== undefined) return customBreakTime * 1000
    return currentlyDugBlock.digTime(null, false, false, false)
  }

  let currentlyDugBlock: Block
  let startDiggingTime: number
  let animationInterval: NodeJS.Timeout
  let expectedDiggingTime: number
  let lastDestroyState: number
  let currentAnimationId: number
  function startDigging (location: Vec3) {
    serv.entityMaxId++
    currentAnimationId = serv.entityMaxId
    expectedDiggingTime = diggingTime()
    lastDestroyState = 0
    startDiggingTime = Date.now()
    updateAnimation()
    animationInterval = player.setInterval(updateAnimation, 100)
    function updateAnimation () {
      const currentDiggingTime = Date.now() - startDiggingTime
      let newDestroyState = Math.floor(9 * currentDiggingTime / expectedDiggingTime)
      newDestroyState = newDestroyState > 9 ? 9 : newDestroyState
      if (newDestroyState !== lastDestroyState) {
        player.behavior('breakAnimation', {
          lastState: lastDestroyState,
          state: newDestroyState,
          start: startDigging,
          timePassed: currentDiggingTime,
          position: location
        }, ({ state }) => {
          lastDestroyState = state
          player._writeOthersNearby('block_break_animation', {
            entityId: currentAnimationId,
            location,
            destroyStage: state
          })
        })
      }
    }
    if (serv.supportFeature('acknowledgePlayerDigging')) {
      player._client.write('acknowledge_player_digging', {
        location,
        block: currentlyDugBlock.stateId,
        status: 0,
        successful: true
      })
    }
  }

  function cancelDigging (location) {
    clearInterval(animationInterval)
    player._writeOthersNearby('block_break_animation', {
      entityId: currentAnimationId,
      location,
      destroyStage: -1
    })
    if (serv.supportFeature('acknowledgePlayerDigging')) {
      player._client.write('acknowledge_player_digging', {
        location,
        block: currentlyDugBlock.stateId,
        status: 1,
        successful: true
      })
    }
  }

  const blockDropVelocity = new Vec3(Math.random() * 4 - 2, Math.random() * 2 + 2, Math.random() * 4 - 2)
  async function completeDigging (location: Vec3, directionVector: Vec3) {
    clearInterval(animationInterval)
    const diggingTime = Date.now() - startDiggingTime
    let stop = false
    // const MAX_DIG_DISTANCE = 7
    const MAX_DIG_DISTANCE = 8
    const tooFast = expectedDiggingTime - diggingTime > 50
    const tooFar = player.position.distanceTo(location) > MAX_DIG_DISTANCE
    if (tooFast || tooFar) {
      stop = true
      await player.behavior('suspiciousDigStopped', {
        tooFast,
        tooFar,
        location
      }, () => { }, () => {
        stop = false
      })
    }
    if (!stop) {
      const drops = [] as any[]
      const dropBase = {
        blockDropPosition: location.offset(0.5, 0.5, 0.5),
        blockDropWorld: player.world,
        blockDropDamage: currentlyDugBlock.metadata,
        blockDropPickup: 500,
        blockDropDeath: 60 * 5 * 1000
      }
      if (typeof mcData.blockLoot === 'undefined') {
        drops.push({
          ...dropBase,
          blockDropVelocity: blockDropVelocity,
          blockDropId: serv.supportFeature('theFlattening') ? currentlyDugBlock.drops?.[0] : currentlyDugBlock.type
        })
      } else {
        const heldItem = player.inventory.slots[36 + player.heldItemSlot]
        let enchants: { name: string; lvl: number }[] | undefined
        try {
          enchants = heldItem?.enchants
        } catch (e) {
        }
        const silkTouch = enchants?.map(enchant => enchant.name).includes('silk_touch')
        const blockDrops = mcData.blockLoot[currentlyDugBlock.name].drops.filter(drop => !(drop[`${silkTouch ? 'noS' : 's'}ilkTouch`] ?? false))
        for (const drop of blockDrops) {
          drops.push({
            ...dropBase,
            blockDropVelocity: blockDropVelocity,
            blockDropId: mcData.itemsByName[drop.item].id
          })
        }
      }
      player.behavior('dug', {
        position: location,
        block: currentlyDugBlock,
        dropBlock: true,
        drops,
        directionVector
      }, async (data) => {
        player.changeBlock(data.position, 0, 0)
        const aboveBlock = await player.world.getBlock(data.position.offset(0, 1, 0))
        if (aboveBlock.material === 'plant') {
          await player.setBlock(data.position.offset(0, 1, 0), 0)
        }
        if (data.dropBlock) {
          drops.forEach(drop => dropBlock(drop))
        }
        if (serv.supportFeature('acknowledgePlayerDigging')) {
          player._client.write('acknowledge_player_digging', {
            location,
            block: 0,
            status: 2,
            successful: true
          })
        }
      }, cancelDig)
    } else {
      player._client.write('block_change', {
        location,
        type: currentlyDugBlock.stateId
      })
      if (serv.supportFeature('acknowledgePlayerDigging')) {
        player.writePacket('acknowledge_player_digging', {
          location,
          block: currentlyDugBlock.stateId,
          status: 2,
          successful: false
        })
      }
    }
  }

  function dropBlock ({ blockDropPosition, blockDropWorld, blockDropVelocity, blockDropId, blockDropDamage, blockDropCount, blockDropPickup, blockDropDeath }) {
    serv.spawnObject(mcData.entitiesByName[mcData.version['<']('1.11') ? 'Item' : 'item'].id, blockDropWorld, blockDropPosition, {
      velocity: blockDropVelocity,
      itemId: blockDropId,
      itemDamage: blockDropDamage,
      itemCount: blockDropCount,
      pickupTime: blockDropPickup,
      deathTime: blockDropDeath
    })
  }

  function creativeDigging (location) {
    player.behavior('dug', {
      position: location,
      block: currentlyDugBlock,
      dropBlock: false,
      blockDropCount: 0,
      blockDropPosition: location.offset(0.5, 0.5, 0.5),
      blockDropWorld: player.world,
      blockDropVelocity: blockDropVelocity,
      blockDropId: currentlyDugBlock.type,
      blockDropDamage: currentlyDugBlock.metadata,
      blockDropPickup: 500,
      blockDropDeath: 60 * 5 * 1000
    }, async (data) => {
      player.changeBlock(data.position, 0, 0)
      const aboveBlock = await player.world.getBlock(data.position.offset(0, 1, 0))
      if (aboveBlock.material === 'plant') {
        await player.setBlock(data.position.offset(0, 1, 0), 0)
      }
      if (data.dropBlock) dropBlock(data)
    }, cancelDig)
  }
}

const directionToVector = [new Vec3(0, -1, 0), new Vec3(0, 1, 0), new Vec3(0, 0, -1), new Vec3(0, 0, 1), new Vec3(-1, 0, 0), new Vec3(1, 0, 0)]
declare global {
  interface PlayerBehaviorInputMap {
    'item_drop': {
      _input: {
        blockDropPosition: Vec3
        blockDropWorld: CustomWorld
        blockDropVelocity: Vec3
        blockDropId: number
        blockDropDamage: number
        blockDropCount: number
        blockDropPickup: number
        blockDropDeath: number
      }
    }

    'breakAnimation': {
      _input: {
        lastState: number
        state: number
        start: () => void
        timePassed: number
        position: Vec3
      }
    }
    'dug': {
      _input: {
        position: Vec3
        block: Block
        dropBlock: boolean
        drops: any[]
        directionVector: Vec3
      }
    }

    'suspiciousDigStopped': {
      _input: {
        tooFast: boolean
        tooFar: boolean
        location: Vec3
      }
    }
  }
}
