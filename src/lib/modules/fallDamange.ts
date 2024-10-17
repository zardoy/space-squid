// part of physics for entities
// TODO implement modifiers and armour damage

const isPlayer = (arg: Entity): arg is Player => arg.type === 'player'
const isInSurvival = (arg: Player) => arg.gameMode === 0 || arg.gameMode === 2

const calculateBootsTypeSaveHearts = (itemName: string) => {
  if (itemName === 'leather_boots') return 1
  if (itemName === 'iron_boots') return 2
  if (itemName === 'golden_boots') return 3
  if (itemName === 'diamond_boots') return 4
  if (itemName === 'netherite_boots') return 5
  return 0
}

export const server = function (serv: Server) {
  const highestPosEntitiesMap = {} as Record<string, number>

  serv.on('tick', async () => {
    for (const [id, entity] of Object.entries(serv.entities)) {
      const isInWaterOrLava = async () => {
        const block = await entity.world.getBlock(entity.position.offset(0, 1, 0))
        return block.name === 'water' || block.name === 'lava'
      }
      const getPosition = () => entity.position
      const takeDamage = (hearts: number) => {
        if (isPlayer(entity)) {
          const boots = entity.inventory.slots.find(slot => slot?.type === 36)
          if (boots) {
            hearts -= calculateBootsTypeSaveHearts(boots.name)
            // todo update dmg
          }
        }
        if (hearts > 0) {
          entity.takeDamage({ damage: hearts })
        }
      }
      const isOnGround = () => entity.onGround
      // ---

      const inWaterOrLava = await isInWaterOrLava()

      if (isPlayer(entity)) {
        if (!isInSurvival(entity) || entity['flying']) {
          delete highestPosEntitiesMap[id]
          continue
        }
      }
      if (inWaterOrLava) {
        delete highestPosEntitiesMap[id]
        continue
      }

      const currentY = getPosition().y

      if (isOnGround()) {
        const highestFallY = highestPosEntitiesMap[id]
        if (highestFallY !== undefined) {
          const fallDistance = highestFallY - currentY
          if (fallDistance > 3) {
            const damage = fallDistance - 3
            takeDamage(damage)
          }
          // Reset the highest Y position after calculating fall damage
          delete highestPosEntitiesMap[id]
        }
      } else {
        // Update the highest Y position if the entity ascends
        const highestY = Math.max(highestPosEntitiesMap[id] ?? -Infinity, currentY)
        highestPosEntitiesMap[id] = highestY
      }
    }
  })
}
