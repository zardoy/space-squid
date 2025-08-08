import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import { versionToNumber } from '../../utils'

export interface ResourcePackConfig {
  url: string
  hash?: string
  force?: boolean
  promptMessage?: string | Record<string, any>
}

export type ResourcePackSet = ResourcePackConfig & {
  autoHash?: boolean
}

export const server = function (serv: Server, options: Options) {
  let currentResourcePack: ResourcePackConfig | null = null

  serv.setResourcePack = async (config: ResourcePackSet) => {
    // If hash not provided, try to fetch and hash the resource pack
    if (!config.hash && config.url.startsWith('http') && config.autoHash === true) {
      try {
        const response = await fetch(config.url)
        const buffer = await response.arrayBuffer()
        config.hash = createHash('sha1').update(Buffer.from(buffer)).digest('hex')
      } catch (err) {
        console.warn('Failed to fetch and hash resource pack from url:', config.url, err)
      }
    }
    currentResourcePack = config
    return config
  }

  if (options.resourcePack) {
    serv.setResourcePack(options.resourcePack)
  }

  serv.getCurrentResourcePack = () => currentResourcePack

  // Handle sending resource pack on player join
  serv._server.on('playerJoin', (client) => {
    if (!currentResourcePack) return

    const version = versionToNumber(options.version)

    if (version >= versionToNumber('1.17')) {
      const promptMessage = currentResourcePack.promptMessage
      client.write('resource_pack_send', {
        url: currentResourcePack.url,
        hash: currentResourcePack.hash || '',
        forced: currentResourcePack.force || false,
        promptMessage: currentResourcePack.promptMessage ? JSON.stringify(
          typeof promptMessage === 'string' ? { text: promptMessage } : promptMessage
        ) : undefined
      })
    } else {
      client.write('resource_pack_send', {
        url: currentResourcePack.url,
        hash: currentResourcePack.hash || ''
      })
    }
  })
}

declare global {
  interface Server {
    setResourcePack: (config: ResourcePackConfig) => Promise<ResourcePackConfig>
    getCurrentResourcePack: () => ResourcePackConfig | null
  }
  interface Options {
    resourcePack?: ResourcePackSet
  }
}
