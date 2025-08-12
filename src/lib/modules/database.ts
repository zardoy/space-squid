import { promises as fs } from 'fs'
import path from 'path'

export interface PlayerStatsStore {
  stats: {
    totalPlayedMs: number
    totalPlacedBlocks: number
    longestSessionMs: number
  }
  meta?: {
    firstLoginMs?: number
    lastLoginMs?: number
    username?: string
  }
}

const DEFAULT_PLAYER_STORE: PlayerStatsStore = {
  stats: {
    totalPlayedMs: 0,
    totalPlacedBlocks: 0,
    longestSessionMs: 0,
  }
}

export const server = function (serv: Server, options: Options) {
  // In-memory stores for player data and a flag for dirty tracking
  serv.playerStores ??= new Map<string, PlayerStatsStore>()
  const dirtyStores = new Set<string>()

  // Compute total joins from .dat files at startup
  serv.totalJoinsOnStart = 0
    ; (async () => {
      try {
        if (options.worldFolder) {
          const dir = path.resolve(String(options.worldFolder), 'playerdata')
          const entries = await fs.readdir(dir).catch(() => [])
          serv.totalJoinsOnStart = entries.filter((f) => f.toLowerCase().endsWith('.dat')).length
        }
      } catch { /* ignore */ }
    })()

  // API: get player store
  serv.getPlayerData = (uuid: string): PlayerStatsStore => {
    let store = serv.playerStores.get(uuid)
    if (!store) {
      const newStore: PlayerStatsStore = JSON.parse(JSON.stringify(DEFAULT_PLAYER_STORE))
      serv.playerStores.set(uuid, newStore)
      store = newStore
      dirtyStores.add(uuid)
    }
    return store
  }

  // API: update store via partial or updater function
  serv.updatePlayerData = (uuid: string, updater: Partial<PlayerStatsStore> | ((data: PlayerStatsStore) => void)) => {
    const store = serv.getPlayerData(uuid)
    if (typeof updater === 'function') {
      updater(store)
    } else {
      Object.assign(store, updater)
    }
    dirtyStores.add(uuid)
  }

  serv.getAllPlayerData = (): Array<{ uuid: string, data: PlayerStatsStore }> => {
    return Array.from(serv.playerStores.entries()).map(([uuid, data]) => ({ uuid, data }))
  }

  // Load and save helpers
  const getJsonPath = (uuid: string) => options.worldFolder
    ? path.resolve(String(options.worldFolder), 'playerdata', `${uuid}.json`)
    : undefined

  serv.loadPlayerDataFromDisk = async (uuid: string) => {
    const jsonPath = getJsonPath(uuid)
    if (!jsonPath) return false
    try {
      const buf = await fs.readFile(jsonPath)
      const parsed: Partial<PlayerStatsStore> = JSON.parse(buf.toString('utf8'))
      // Ensure defaults
      const safe: PlayerStatsStore = {
        ...parsed,
        stats: { ...DEFAULT_PLAYER_STORE.stats, ...(parsed?.stats ?? {}) },
      }
      serv.playerStores.set(uuid, safe)
      return false
    } catch (e) {
      // initialize default if file does not exist or invalid
      serv.playerStores.set(uuid, JSON.parse(JSON.stringify(DEFAULT_PLAYER_STORE)))
      dirtyStores.add(uuid)
      return true
    }
  }

  serv.savePlayerDataToDisk = async (uuid: string) => {
    const jsonPath = getJsonPath(uuid)
    if (!jsonPath) return
    try {
      await fs.mkdir(path.dirname(jsonPath), { recursive: true })
      const data = serv.getPlayerData(uuid)
      await fs.writeFile(jsonPath, JSON.stringify(data))
      dirtyStores.delete(uuid)
    } catch {
      // ignore write errors for now
    }
  }

  serv.saveAllPlayerDataToDisk = async () => {
    const uuids = Array.from(dirtyStores.values())
    await Promise.all(uuids.map((uuid) => serv.savePlayerDataToDisk(uuid)))
  }

  serv.cleanupFunctions.push(() => {
    serv.saveAllPlayerDataToDisk()
  })
}

export const player = function (player: Player, serv: Server, options: Options) {
  // Load the JSON store once base player data is ready
  player.on('dataLoaded', async () => {
    const isFresh = await serv.loadPlayerDataFromDisk(player.uuid)
    player.isFresh = isFresh
    player.dataLoaded = true
    player.db = serv.getPlayerData(player.uuid)
    player._sessionStartMs = Date.now()
    player.emit('databaseLoaded')

    // Track first and last login times and username
    const now = Date.now()
    player.db.meta ??= {}
    if (!player.db.meta.firstLoginMs) player.db.meta.firstLoginMs = now
    player.db.meta.lastLoginMs = now
    player.db.meta.username = player.username
    await serv.savePlayerDataToDisk(player.uuid)
  })

  // Count placed blocks attempts
  let lastPlace = 0
  player.on('blockPlaced', () => {
    if (Date.now() - lastPlace < 5) return
    lastPlace = Date.now()
    const store = serv.getPlayerData(player.uuid)
    store.stats.totalPlacedBlocks += 1
    serv.updatePlayerData(player.uuid, store)
  })

  // On disconnect, update played time and longest session
  player.on('disconnected', async () => {
    try {
      const start = player._sessionStartMs ?? Date.now()
      const sessionMs = Math.max(0, Date.now() - start)
      const store = serv.getPlayerData(player.uuid)
      store.stats.totalPlayedMs += sessionMs
      if (sessionMs > store.stats.longestSessionMs) store.stats.longestSessionMs = sessionMs
      await serv.savePlayerDataToDisk(player.uuid)
    } catch { /* ignore */ }
  })
}

declare global {
  interface Server {
    playerStores: Map<string, PlayerStatsStore>
    totalJoinsOnStart: number
    getPlayerData: (uuid: string) => PlayerStatsStore
    updatePlayerData: (uuid: string, updater: Partial<PlayerStatsStore> | ((data: PlayerStatsStore) => void)) => void
    getAllPlayerData: () => Array<{ uuid: string, data: PlayerStatsStore }>
    loadPlayerDataFromDisk: (uuid: string) => Promise<boolean>
    savePlayerDataToDisk: (uuid: string) => Promise<void>
    saveAllPlayerDataToDisk: () => Promise<void>
  }

  interface Player {
    db: PlayerStatsStore
    dataLoaded: boolean
    isFresh: boolean
    _sessionStartMs: number
  }
}
