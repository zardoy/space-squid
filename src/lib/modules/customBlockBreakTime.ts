import { Block } from 'prismarine-block'

// related to custom channels, everything starts with 'custom'

const CHANNEL_NAME = 'minecraft-web-client:block-interactions-customization'

export const server = (serv: Server) => {
  serv.customPlayersBreakTime ??= {}

  serv.customSetPlayerBreakTime = (uuid: string, config: Partial<BreakTimeConfig>) => {
    serv.customPlayersBreakTime[uuid] = {
      ...serv.customPlayersBreakTime[uuid],
      ...config
    }

    // Send update to the player if they're online
    const player = serv.uuidToPlayer[uuid]
    if (player) {
      sendBreakTimeConfig(player, serv)
    }
  }

  serv.customRemovePlayerBreakTime = (uuid: string) => {
    delete serv.customPlayersBreakTime[uuid]

    // Send empty config to the player if they're online
    const player = serv.uuidToPlayer[uuid]
    if (player) {
      sendBreakTimeConfig(player, serv)
    }
  }
}

function sendBreakTimeConfig (player: Player, serv: Server) {
  if (!serv.customPlayersBreakTime[player.uuid]) return

  const config = serv.customPlayersBreakTime[player.uuid]
  const data = {
    customBreakTime: config?.blocks ?? {},
    customBreakTimeToolAllowance: config?.toolNames ?? [],
    ...config?.rawConfig
  }

  player._client.writeChannel(
    CHANNEL_NAME,
    {
      newConfiguration: JSON.stringify(data)
    }
  )
}

export const player = async (player: Player, serv: Server) => {
  player.customGetBreakTime = (block: Block) => {
    const config = serv.customPlayersBreakTime[player.uuid]
    if (!config) return undefined

    const heldItemName = player.inventory.slots[36 + player.heldItemSlot]?.name
    if (config.toolNames.length > 0 && !config.toolNames.includes(heldItemName ?? '')) {
      return undefined
    }

    return config.blocks?.[block.stateId] ?? config.blocks?.['*']
  }

  // Register the channel
  player._client.registerChannel(
    CHANNEL_NAME,
    ['container', [
      {
        name: 'newConfiguration',
        type: ['pstring', { countType: 'i16' }]
      }
    ]]
  )

  // Send initial configuration if it exists
  player.on('login', () => {
    sendBreakTimeConfig(player, serv)
  })
}

export type BreakTimeConfig = {
  toolNames: string[]
  blocks: {
    [stateId: number]: number
    '*'?: number
  }
  rawConfig?: any
}

declare global {
  interface Server {
    customPlayersBreakTime: {
      [uuid: string]: BreakTimeConfig
    }
    customSetPlayerBreakTime: (uuid: string, config: Partial<BreakTimeConfig>) => void
    customRemovePlayerBreakTime: (uuid: string) => void
  }

  interface Player {
    customGetBreakTime: (block: Block) => number | undefined
  }
}
