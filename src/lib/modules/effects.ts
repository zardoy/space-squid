import { pascalCase } from 'change-case'
import UserError from '../user_error'
import { skipMcPrefix } from '../utils'
import { normalizeEffectTicks, ticksFromEffectSeconds } from './effect-duration'

export const unknownEffectMessage = (name: string) => `Unknown effect ${name}`

const isPlayer = (entity: Entity): entity is Player => entity.type === 'player'

export const entity = function (entity: Entity, serv: Server) {
  entity.effects = {}
  for (let i = 1; i <= 23; i++) { // 23 in 1.8, 27 in 1.9
    entity.effects[i] = null // Just so we know it's a real potion and not undefined/not existant
  }

  entity.sendEffect = (effectId, { amplifier = 0, duration = 30 * 20, particles = true, whitelist, blacklist = [] } = {}) => {
    if (!whitelist) whitelist = serv.getNearby(entity)
    if (entity.type === 'player' && [1].indexOf(effectId) !== -1) (entity as Player).sendAbilities()
    const sendTo = whitelist.filter(p => blacklist.indexOf(p) === -1)
    const data = {
      entityId: entity.id,
      effectId,
      amplifier,
      duration,
      hideParticles: !particles
    }
    serv._writeArray('entity_effect', data, sendTo.filter(isPlayer))
  }

  entity.sendRemoveEffect = (effectId, { whitelist, blacklist = [] } = {}) => {
    if (!whitelist) whitelist = serv.getNearby(entity)
    const sendTo = whitelist.filter(p => blacklist.indexOf(p) === -1)
    serv._writeArray('remove_entity_effect', {
      entityId: entity.id,
      effectId
    }, sendTo.filter(isPlayer))
  }

  entity.addEffect = (effectId, opt = {}) => {
    const amp = typeof opt.amplifier === 'undefined' ? 0 : opt.amplifier
    if (!entity.effects[effectId] || opt.override || amp < entity.effects[effectId].amplifier) {
      const previousEffect = entity.effects[effectId]
      if (previousEffect?.timeout) clearTimeout(previousEffect.timeout)
      const durationTicks = normalizeEffectTicks(opt.duration)
      entity.effects[effectId] = {
        amplifier: opt.amplifier || 0,
        duration: durationTicks,
        particles: opt.particles ?? true,
        end: Date.now() + durationTicks * 1000 / 20, // 1000/20 === convert from ticks to milliseconds,
        timeout: durationTicks < 0 ? undefined : setTimeout(() => entity.removeEffect(effectId, {}), durationTicks * 1000 / 20)
      }
      if (isPlayer(entity)) {
        entity.sendEffect(effectId, { ...opt, whitelist: [entity] })
      }
      return true
    } else return false
  }

  entity.removeEffect = (effectId, opt?) => {
    const effect = entity.effects[effectId]
    if (!effect) return
    if (effect.timeout) clearTimeout(effect.timeout)
    entity.effects[effectId] = null
    entity.sendRemoveEffect(effectId, { ...opt, whitelist: [entity] })
  }
}

export const server = function (serv: Server, options: Options) {
  serv.commands.add({
    base: 'effect',
    info: 'Give player an effect',
    usage: '/effect <player> <effect> [seconds] [amplifier] [hideParticles]',
    tab: ['player', 'effect', 'number', 'number', 'boolean'],
    op: true,
    onlyPlayer: true,
    parse (str) {
      return str.match(/(.+?) ([\d\w_]+)(?: (\d+|))?(?: (\d+))?(?: (true|false))?|.*? clear/) || false
    },
    action (params, ctx) {
      const targets = ctx.player ? ctx.player.selectorString(params[1]) : serv.selectorString(params[1])
      if (params[2] === 'clear') {
        targets.forEach(e => Object.keys(e.effects).forEach(effectId => {
          if (e.effects[effectId] !== null) e.removeEffect(effectId)
        }))
      } else {
        targets.forEach(e => {
          let effId = parseInt(params[2])
          if (isNaN(effId)) {
            const mcData = require('minecraft-data')(options.version)
            const effectNamePascal = pascalCase(skipMcPrefix(params[2]))
            const effect = mcData.effectsByName[effectNamePascal]
            if (!effect) throw new UserError(unknownEffectMessage(params[2]))
            effId = effect.id
          }
          if (e.effects[effId]) {
            e.removeEffect(effId)
          }
          const seconds = params[3] === undefined || params[3] === ''
            ? undefined
            : parseInt(params[3], 10)
          e.addEffect(effId, {
            amplifier: parseInt(params[4]) || 0,
            duration: ticksFromEffectSeconds(seconds),
            particles: params[5] !== 'true' // hidesParticles vs particles (i.e. "showParticles")
          })
        })
      }
      const chatSelect = (targets.length === 1 ? (targets[0].type === 'player' ? (targets[0] as Player).username : 'entity') : 'entities')
      if (params[2] === 'clear') {
        if (ctx.player) ctx.player.chat('Remove all effects from ' + chatSelect + '.')
        else serv.info('Remove all effects from ' + chatSelect + '.')
      } else {
        if (ctx.player) {
          ctx.player.chat('Gave ' + chatSelect + ' effect ' + params[2] + '(' + (params[4] || 0) + ') for ' +
            (params[3] === undefined || params[3] === '' || Number.isNaN(parseInt(params[3], 10)) ? 30 : parseInt(params[3], 10)) + ' seconds')
        } else {
          serv.info('Gave ' + chatSelect + ' effect ' + params[2] + '(' + (params[4] || 0) + ') for ' +
            (params[3] === undefined || params[3] === '' || Number.isNaN(parseInt(params[3], 10)) ? 30 : parseInt(params[3], 10)) + ' seconds')
        }
      }
    }
  })
}
declare global {
  interface Entity {
    "effects": Record<string, { amplifier: number, duration: number, particles: boolean, end: number, timeout?: NodeJS.Timeout } | null>
    /** @internal */
    "sendEffect": (effectId: number, opt?: { amplifier?: number; duration?: number; particles?: boolean; whitelist?: Entity[]; blacklist?: Entity[] }) => void
    /** @internal */
    "sendRemoveEffect": (effectId: number, opt?: { whitelist?: Entity[]; blacklist?: Entity[] }) => void
    "addEffect": (effectId: number, opt?: { amplifier?: number; duration?: number; particles?: boolean; whitelist?: Entity[]; blacklist?: Entity[]; override?: boolean }) => boolean
    removeEffect: (effectId: number, opt?: { whitelist?: Entity[]; blacklist?: Entity[] }) => void
  }
}
