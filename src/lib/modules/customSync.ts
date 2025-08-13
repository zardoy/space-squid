const SYNC_REQUEST_CHANNEL = 'minecraft-web-client:sync-request'
const SYNC_RESPONSE_CHANNEL = 'minecraft-web-client:sync-response'

interface SyncResponse {
  requestId: number
  entityIds: number[]
}

const CHECK_INTERVAL = 1000 // 1 second
export const server = (serv: Server, options: Options) => {

  const module = {
    // Track when we last requested sync from each player
    lastSyncRequests: new Map<string, { time: number, requestId: number }>(),
    nextRequestId: 0,

    // Request entity list from a player
    /** @internal */
    requestSync: (player: Player) => {
      const requestId = module.nextRequestId++
      const request = {
        requestId,
        time: Date.now()
      }
      player._client.writeChannel(SYNC_REQUEST_CHANNEL, {
        data: JSON.stringify({ requestId })
      })
      module.lastSyncRequests.set(player.uuid, request)
    },

    // Handle sync response from client
    handleSyncResponse: (player: Player, data: { data: string }) => {
      try {
        const parsed = JSON.parse(data.data)

        // Type guard to validate response shape
        const isValidResponse = (obj: any): obj is SyncResponse => {
          return typeof obj === 'object' && obj !== null &&
            typeof obj.requestId === 'number' &&
            Array.isArray(obj.entityIds) &&
            obj.entityIds.every(id => typeof id === 'number')
        }

        if (!isValidResponse(parsed)) {
          throw new Error('Invalid response format')
        }

        const { requestId, entityIds } = parsed

        // Verify this is a response to our last request
        const lastRequest = module.lastSyncRequests.get(player.uuid)
        if (!lastRequest || lastRequest.requestId !== requestId) {
          return // Ignore out of order responses
        }

        // Calculate and update latency
        const latency = Date.now() - lastRequest.time
        player._client.latency = latency

        // Clean up the request
        module.lastSyncRequests.delete(player.uuid)

        const trackedIds = new Set(entityIds)
        const expectedIds = new Set<number>()

        // Find entities that should be visible to the player
        for (const entity of Object.values(serv.entities)) {
          if (entity.id === player.id) continue // Skip self

          // Check if entity is within view distance
          const dx = entity.position.x - player.position.x
          const dy = entity.position.y - player.position.y
          const dz = entity.position.z - player.position.z
          const distanceSquared = dx * dx + dy * dy + dz * dz
          const viewDistance = entity.viewDistance ?? 150

          if (distanceSquared <= viewDistance * viewDistance) {
            expectedIds.add(entity.id)
          }
        }

        // Find missing entities
        for (const entityId of expectedIds) {
          if (!trackedIds.has(entityId)) {
            const entity = serv.entities[entityId]
            if (!entity) continue

            serv.warn(`Player ${player.username} missing entity ${entityId} (${entity.name ?? entity.type}), respawning... (ping: ${latency}ms)`)

            // Respawn the entity for this player
            player._client.write(entity.spawnPacketName, entity.getSpawnPacket())

            // Send metadata if needed
            if (serv.supportFeature('entityMetadataSentSeparately')) {
              entity.sendMetadata(entity.metadata)
            }
          }
        }

        // Log extra entities (debugging)
        for (const entityId of trackedIds) {
          if (!expectedIds.has(entityId) && !serv.entities[entityId]) {
            serv.warn(`Player ${player.username} tracking non-existent entity ${entityId}`)
          }
        }
      } catch (err) {
        serv.err(`Error handling sync response from ${player.username}: ${err}`)
      }
    }
  }

  serv.customSync = module
  return module
}

export const player = (player: Player, serv: Server) => {
  // Register sync channels with simplified string format
  player._client.registerChannel(
    SYNC_REQUEST_CHANNEL,
    ['container', [
      {
        name: 'data',
        type: ['pstring', { countType: 'i16' }]
      }
    ]]
  )

  player._client.registerChannel(
    SYNC_RESPONSE_CHANNEL,
    ['container', [
      {
        name: 'data',
        type: ['pstring', { countType: 'i16' }]
      }
    ]]
  )

  // Handle sync responses from client
  player._client.on(SYNC_RESPONSE_CHANNEL, (data) => {
    serv.customSync.handleSyncResponse(player, data)
  })

  // Start periodic sync checks
  player.on('spawned', () => {
    player.setInterval(() => {
      serv.customSync.requestSync(player)
    }, CHECK_INTERVAL)
  })
}

declare global {
  interface Server {
    customSync: ReturnType<typeof server>
  }
}
