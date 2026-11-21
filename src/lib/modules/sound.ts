import { skipMcPrefix } from '../utils'

import { Vec3 } from 'vec3'
import { CustomWorld } from './world'

/** 1.8 sound names flying-squid uses, as resource names (1.9+) */
const LEGACY_SOUNDS: Record<string, string> = {
  'random.pop': 'entity.item.pickup',
  'game.player.hurt': 'entity.player.hurt',
  'random.chestopen': 'block.chest.open',
  'random.chestclosed': 'block.chest.close'
}
const DIG_GROUP: Record<string, string> = { cloth: 'wool', stone: 'stone', wood: 'wood', grass: 'grass', gravel: 'gravel', sand: 'sand', snow: 'snow', glass: 'glass' }
const NOTE_INSTRUMENT: Record<string, string> = { bd: 'basedrum', bassattack: 'bass' }
/** sound categories by number (1.19.3+ packets take the name) */
const SOUND_SOURCES = ['master', 'music', 'record', 'weather', 'block', 'hostile', 'neutral', 'player', 'ambient', 'voice']

/** `dig.stone` -> `block.stone.place`, `note.harp` -> `block.note_block.harp` (1.13+) / `block.note.harp`; resource names pass unchanged */
export function resourceSoundName (name: string, flattening: boolean): string {
  const legacy = LEGACY_SOUNDS[name]
  if (legacy) return legacy
  const dig = /^dig\.(\w+)$/.exec(name)
  if (dig) return `block.${DIG_GROUP[dig[1]] ?? 'stone'}.place`
  const note = /^note\.(\w+)$/.exec(name)
  if (note) return `block.${flattening ? 'note_block' : 'note'}.${NOTE_INSTRUMENT[note[1]] ?? note[1]}`
  return name
}

export const server = function (serv: Server) {
  // what the sound packets of this version look like (protocol schema of minecraft-data)
  const toClient = (serv as any).mcData?.protocol?.play?.toClient?.types ?? {}
  const effectFields: Array<{ name: string, type: unknown }> = toClient.packet_sound_effect?.[1] ?? []
  const namedFields: Array<{ name: string, type: unknown }> | undefined = toClient.packet_named_sound_effect?.[1]
  /** 1.19.3+: `sound` is an ItemSoundHolder ({ data: { soundName } } for a sound given by name) */
  const soundHolder = effectFields.some(f => f.name === 'sound')
  /** pitch is a float since 1.9 (a byte, pitch * 63, before) */
  const floatPitch = (soundHolder ? effectFields : namedFields ?? effectFields).find(f => f.name === 'pitch')?.type === 'f32'
  const resourceNames = serv.supportFeature('playsoundUsesResourceLocation')
  const flattening = serv.supportFeature('theFlattening')

  serv.playSound = (sound, world, position, { whitelist, blacklist = [], radius = 32, volume = 1.0, pitch = 1.0, soundCategory = 0, saveId, customClientOptions } = {}) => {
    const players = (typeof whitelist !== 'undefined'
      ? (whitelist instanceof Array ? whitelist : [whitelist])
      : serv.getNearby({
        world,
        position: position!,
        radius
      }))

    // Add custom options to sound name if provided
    let finalSoundName = resourceNames ? resourceSoundName(sound, flattening) : sound
    if (customClientOptions) {
      finalSoundName = `${sound}(${JSON.stringify(customClientOptions)})`
    }

    // Save sound info if saveId provided for each player
    if (saveId) {
      const targetPlayers = players.filter(player => blacklist.indexOf(player) === -1)
      targetPlayers.forEach(player => {
        player.savedSounds[saveId] = {
          soundName: sound,
          soundCategory
        }
      })
    }

    players.filter(player => blacklist.indexOf(player) === -1)
      .forEach(player => {
        // fixed point, 1/8 block (positions are in blocks; the old 1/32 scaling put every sound near 0 0 0)
        const at = position ?? player.position
        const x = Math.floor(at.x * 8)
        const y = Math.floor(at.y * 8)
        const z = Math.floor(at.z * 8)
        const packetPitch = floatPitch ? pitch : Math.round(pitch * 63)
        if (soundHolder) {
          player._client.write('sound_effect', {
            sound: { data: { soundName: finalSoundName, fixedRange: undefined } },
            soundCategory: typeof soundCategory === 'number' ? (SOUND_SOURCES[soundCategory] ?? 'master') : soundCategory,
            x,
            y,
            z,
            volume,
            pitch: packetPitch,
            seed: 0
          })
        } else {
          // only packet still in fixed position in all versions
          player._client.write('named_sound_effect', {
            soundName: finalSoundName,
            soundCategory,
            x,
            y,
            z,
            volume,
            pitch: packetPitch,
            seed: 0
          })
        }
      })
  }

  serv.playNoteBlock = (pitch, world, position, { instrument = 'harp', particle = true } = {}) => {
    if (particle) {
      serv.emitParticle(23, world, position.clone().add(new Vec3(0.5, 1.5, 0.5)), {
        count: 1,
        size: new Vec3(0, 0, 0)
      })
    }
    serv.playSound('note.' + instrument, world, position, { pitch: serv.getNote(pitch) })
  }

  serv.getNote = note => 0.5 * Math.pow(Math.pow(2, 1 / 12), note)

  serv.stopSound = (soundId: string, targetPlayers?: Player[]) => {
    // If targetPlayers provided, stop sound only for them
    // Otherwise stop for all players who have this sound saved
    const players = targetPlayers || serv.players

    players.forEach(player => {
      const soundInfo = player.savedSounds[soundId]
      if (soundInfo) {
        player._client.write('stop_sound', {
          flags: 3, // Both source and sound
          source: soundInfo.soundCategory,
          sound: soundInfo.soundName,
          seed: 0
        })
        delete player.savedSounds[soundId]
      }
    })
  }

  serv.commands.add({
    base: 'playsoundforall',
    info: 'to play sound for everyone',
    usage: '/playsoundforall <sound_name> [volume] [pitch]',
    onlyPlayer: true,
    op: true,
    parse (str) {
      const results = str.match(/([^ ]+)(?: ([^ ]+))?(?: ([^ ]+))?/)
      if (!results) return false
      return {
        sound_name: skipMcPrefix(results[1]),
        volume: results[2] ? parseFloat(results[2]) : 1.0,
        pitch: results[3] ? parseFloat(results[3]) : 1.0
      }
    },
    action (action, ctx) {
      ctx.player.chat('Playing "' + action.sound_name + '" (volume: ' + action.volume + ', pitch: ' + action.pitch + ')')
      serv.playSound(action.sound_name, ctx.player.world, ctx.player.position, { volume: action.volume, pitch: action.pitch })
    }
  })

  serv.commands.add({
    base: 'playsound',
    info: 'to play sound for yourself',
    usage: '/playsound <sound_name> [volume] [pitch]',
    onlyPlayer: true,
    op: true,
    parse (str) {
      const results = str.match(/([^ ]+)(?: ([^ ]+))?(?: ([^ ]+))?/)
      if (!results) return false
      return {
        sound_name: skipMcPrefix(results[1]),
        volume: results[2] ? parseFloat(results[2]) : 1.0,
        pitch: results[3] ? parseFloat(results[3]) : 1.0
      }
    },
    action (action, ctx) {
      ctx.player.chat('Playing "' + action.sound_name + '" (volume: ' + action.volume + ', pitch: ' + action.pitch + ')')
      ctx.player.playSound(action.sound_name, { volume: action.volume, pitch: action.pitch })
    }
  })
}

export const player = function (player: Player, serv: Server) {
  // Initialize player's saved sounds storage
  player.savedSounds = {}

  player.playSound = (sound, opt: PlaySoundOptions = {}) => {
    // If saveId is provided, store the sound in player's storage
    if (opt.saveId) {
      player.savedSounds[opt.saveId] = {
        soundName: sound,
        soundCategory: opt.soundCategory || 0
      }
    }
    serv.playSound(sound, player.world, null, { ...opt, whitelist: player })
  }

  player.stopSound = (soundId?: string) => {
    if (soundId) {
      // Stop specific sound if it exists in player's saved sounds
      const soundInfo = player.savedSounds[soundId]
      if (soundInfo) {
        player._client.write('stop_sound', {
          flags: 3, // Both source and sound
          source: soundInfo.soundCategory,
          sound: soundInfo.soundName,
          seed: 0
        })
        delete player.savedSounds[soundId]
      }
    } else {
      // Stop all sounds
      player._client.write('stop_sound', {
        flags: 0, // Stop all sounds
        seed: 0
      })
      // Clear saved sounds storage
      player.savedSounds = {}
    }
  }

  // player.on('placeBlock_cancel', async ({ reference }, cancel) => {
  //   if (player.crouching) return
  //   const id = await player.world.getBlockType(reference)
  //   if (id !== 25) return
  //   cancel(false)
  //   if (!player.world.blockEntityData[reference.toString()]) player.world.blockEntityData[reference.toString()] = {}
  //   const data = player.world.blockEntityData[reference.toString()]
  //   if (typeof data.note === 'undefined') data.note = -1
  //   data.note++
  //   data.note %= 25
  //   serv.playNoteBlock(data.note, player.world, reference)
  // })

  // player.on('dig_cancel', async ({ position }, cancel) => {
  //   const id = await player.world.getBlockType(position)
  //   if (id !== 25) return
  //   cancel(false)
  //   if (!player.world.blockEntityData[position.toString()]) player.world.blockEntityData[position.toString()] = {}
  //   const data = player.world.blockEntityData[position.toString()]
  //   if (typeof data.note === 'undefined') data.note = 0
  //   serv.playNoteBlock(data.note, player.world, position)
  // })
}

export const entity = function (entity: Entity, serv: Server) {
  entity.playSoundAtSelf = (sound, opt = {}) => {
    serv.playSound(sound, entity.world, entity.position, opt)
  }
}
interface SavedSound {
  soundName: string
  soundCategory: number
}

interface PlaySoundOptions {
  whitelist?: any
  blacklist?: any[]
  radius?: number
  volume?: number
  pitch?: number
  soundCategory?: number
  /** Optional ID to save the sound for later stopping */
  saveId?: string
  /** Custom options to be added to sound name in parentheses as JSON */
  customClientOptions?: Record<string, any>
}

interface PlayNoteBlockOptions {
  instrument?: string
  particle?: boolean
}

declare global {
  interface Player {
    /** Stores saved sounds by ID for later stopping */
    savedSounds: Record<string, SavedSound>
  }

  interface Server {
    /** Plays `sound` (string, google "minecraft sound list") to all players in `opt.radius`.
     * If position is null, will play at the location of every player (taking into account whitelist and blacklist).
     *
     * Opt:
     * - whitelist: Array of players that can hear the sound (can be a player object)
     * - blacklist: Array of players who cannot hear the sound
     * - radius: Radius that sound can be heard (in fixed position so remember to multiply by 32, default 32*32)
     * - volume: float from 0-1 (default 1.0)
     * - pitch: float from 0.5 to 2 (default 1.0)
     * - saveId: Optional ID to save the sound for later stopping
     * - customClientOptions: Custom options to be added to sound name in parentheses as JSON
     */
    'playSound': (sound: string, world: CustomWorld, position: Vec3 | null, opts?: PlaySoundOptions) => void
    /** Plays noteblock in world at position. `pitch` is from 0-24 */
    "playNoteBlock": (pitch: number, world: CustomWorld, position: Vec3, opts?: PlayNoteBlockOptions) => void
    /** Get pitch. `note` should be between 0-24 and your output is from 0.5 to 2.0 */
    "getNote": (note: number) => number
    /** Stop a previously saved sound by its ID */
    "stopSound": (soundId: string) => void
  }
  interface Player {
    /** Easy way to only play a sound for one player. Same opt as serv.playSound except no `whitelist`. */
    "playSound": (sound: string, opt?: PlaySoundOptions) => void
    /** Stop a specific sound by ID or all sounds if no ID provided */
    "stopSound": (soundId?: string) => void
  }
  interface Entity {
    /** @internal */
    "playSoundAtSelf": (sound: string, opt?: PlaySoundOptions) => void
  }
}
