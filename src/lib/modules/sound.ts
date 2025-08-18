import { skipMcPrefix } from '../utils'

import { Vec3 } from 'vec3'
import { CustomWorld } from './world'

export const server = function (serv: Server) {
  serv.playSound = (sound, world, position, { whitelist, blacklist = [], radius = 32, volume = 1.0, pitch = 1.0, soundCategory = 0, saveId, customClientOptions } = {}) => {
    const players = (typeof whitelist !== 'undefined'
      ? (whitelist instanceof Array ? whitelist : [whitelist])
      : serv.getNearby({
        world,
        position: position!,
        radius
      }))

    // Add custom options to sound name if provided
    let finalSoundName = sound
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
        const iniPos = position ? position.scaled(1 / 32) : player.position.scaled(1 / 32)
        const pos = iniPos.scaled(8).floored()
        if (serv.supportFeature('removedNamedSoundEffectPacket')) { // 1.19.3 removes named_sound_effect
          player._client.write('sound_effect', {
            soundId: 0,
            soundEvent: {
              resource: finalSoundName,
              range: undefined
            },
            soundCategory,
            x: pos.x,
            y: pos.y,
            z: pos.z,
            volume,
            pitch: Math.round(pitch * 63),
            seed: 0
          })
        } else {
          // only packet still in fixed position in all versions
          player._client.write('named_sound_effect', {
            soundName: finalSoundName,
            soundCategory,
            x: pos.x,
            y: pos.y,
            z: pos.z,
            volume,
            pitch: Math.round(pitch * 63),
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
