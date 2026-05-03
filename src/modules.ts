import { Client, Server as ProtocolServer } from 'minecraft-protocol'
import TypedEmitter from 'typed-emitter'
import EventEmitter from 'events'
import { IndexedData, Block as MinecraftDataBlock } from 'minecraft-data'
import { Block as PrismarineBlock } from 'prismarine-block'
import { BehaviorEventMap } from './lib/behavior'

// all is coherent and stays in the same place
declare global {
  interface PlayerEvents {
    asap: () => void
    loadingStatus: (status: string) => void
    blockPlaced: (block: MinecraftDataBlock) => void
    connected: () => void
    spawned: () => void
    disconnected: (reason?: string) => void
    kicked: (kicker: Player, reason: string) => void
    move: () => void
    change_world: () => void
    modpe: (data: string) => void
    /** Emitted when the player's data is loaded from playerdata folder and can be patched if needed (but will be saved back to playerdata folder if patched) */
    dataLoaded: () => void
    databaseLoaded: () => void
    login: () => void
  }

  interface ServerEvents {
    error: (error: Error, data?: { type?: string, name?: string, data?: any, player?: Player, pluginName?: string }) => void
    listening: (port: number) => void
    pluginsReady: () => void
    /** This event is emitted once all plugins are initialized. Use this event for working with properties / methods of other plugins. */
    asap: () => void
    unhandledRejectionWarning: () => void
    crash: () => void
    clientError: (client: Client, error: Error) => void
    newPlayer: (player: Player) => void
    banned: (player: Pick<Player, 'username'>, username: string, reason: string) => void
    newEntity: (entity: Entity) => void
    tick: (delta: number, tickCount: number) => void
    /** Emit seed once the world is loaded */
    seed: (seed: number) => void
    warpsLoaded: () => void
  }

  interface Server extends TypedEmitter<ServerEvents> {
    mcData: IndexedData
  }
  // Omit is to allow inheritance of Entity
  interface Player extends Omit<Entity, keyof TypedEmitter<{}>>, TypedEmitter<PlayerEvents & BehaviorEventMap<{ [K in keyof PlayerBehaviorInputMap]: PlayerBehaviorInputMap[K] }>> {
    dimension: string | number
    _client: Client
    disconnected?: boolean
  }
  interface Entity extends EventEmitter {
    _client: Client
  }
  interface Options {
    version: string
    /**
     * @deprecated will be reworked in the future
     */
    worldSaveVersion?: string
    worldBorder?: {
      /** The radius of the world border */
      radius: number
      /** The center of the world border */
    }
    /** initial write level name */
    levelName?: string
    motd?: string
    port?: number
    noInitialChunksSend?: boolean
    noWarpsLoad?: boolean
    "max-players"?: number
    "online-mode"?: boolean
    gameMode?: number
    difficulty?: number
    worldFolder?: string | false
    noWorldRegion?: boolean
    pluginsFolder?: boolean
    pluginsFolderPath?: string
    generation?: {
      name: string
      options: {
        worldHeight?: number
        minY?: number
        seed?: number
        version?: string
      }
    }
    /**
     * If provided, this encoded string completely replaces the normal chunk
     * generator for the overworld.  Every chunk is filled from the decoded
     * structure; chunks outside the structure bounds are empty (air + sky
     * light).  Player spawn is forced to a fixed point on top of the
     * template (see `getTemplateSpawnPoint`).
     *
     * **Built-in examples** — pass `"[name]"` to load one of the bundled
     * templates.
     *  - Builds: `[castle]`, `[pyramid]`, `[rocket]`, `[lighthouse]`,
     *    `[skyscraper]`, `[pirate_ship]`
     *  - Map starters: `[skyblock]`, `[void_platform]`, `[one_block]`
     *
     * **Custom format** — strict layer encoding:
     *   `Y<n>: row0 | row1 | … | rowN-1  Y<n>: …`
     *
     * - `<n>` is a 0-based floor index (Y0 = ground, Y1 = one block up, …).
     * - Rows are separated by `|`; each row is one Z-slice of the floor.
     * - Run-length encoding: `3C` → `CCC`, `7A` → `AAAAAAA`, bare `C` → `C`.
     * - `A` (or a space) represents air and is never written.
     * - Single characters map to block names via `blockMap` (see below).
     * - Width and depth are inferred from the decoded row lengths.
     *
     * @example "[skyblock]"
     * @example "Y0: 16C | 16C  Y1: C14AC | C14AC"
     */
    chunkTemplate?: string
    /**
     * World Y coordinate that `Y0` in `chunkTemplate` maps to.
     * `Y<n>` → world Y `baseY + n`.
     * @default 64
     */
    baseY?: number
    /**
     * Override or extend the default single-character → Minecraft block-name
     * mapping used by `chunkTemplate`.
     *
     * Accepts either an object or a comma-separated string of `CHAR=block_name`
     * pairs: `"C=cobblestone, G=glass_pane, X=diamond_block"`.
     *
     * Default map includes: A=air, C=cobblestone, M=mossy_cobblestone,
     * G=glass, R=red_wool, D=dark_oak_planks, I=iron_block, S=stone,
     * B=bricks, W=oak_planks, T=stone_bricks, Y=gold_block, and more.
     *
     * @example "C=cobblestone, G=glass_pane, X=diamond_block"
     * @example { X: 'diamond_block', Z: 'emerald_block' }
     */
    blockMap?: Record<string, string> | string
    kickTimeout?: number
    plugins?: Record<string, any>
    modpe?: boolean
    "view-distance"?: number
    "player-list-text"?: {
      header: {
        text: string
      }
      footer: {
        text: string
      }
    }
    "everybody-op"?: boolean
    "max-entities": number
    noConsoleOutput?: boolean
    savingInterval?: number | false
    /**
     * @internal
     * @jsOnly
     */
    oldServerData?: Partial<Server> & { oldData: Record<string, any> }
  }
}
