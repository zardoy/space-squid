import UserError from '../user_error'
import type { WorldEnvironment } from './world'
import { BUILTIN_RECIPES } from 'minecraft-worldgen/dist/recipe/builtin'

/**
 * Multiverse-style world management commands on top of `serv.createWorld` / `serv.removeWorld` / `player.changeWorld`:
 *   /mv create <name> <normal|nether|end> [-s <seed>] [-g <generator>] [-t <preset>]
 *   /mv list | /mv info [world] | /mv who [world] | /mv tp <world> [player] | /mv remove <world>
 * (plus the short forms /mvcreate /mvlist /mvinfo /mvwho /mvtp /mvremove)
 */
const PRESETS = ['default', 'amplified', 'large_biomes', 'caves', 'floating_islands', ...Object.keys(BUILTIN_RECIPES)]
const ENV_ALIASES: Record<string, WorldEnvironment> = { normal: 'normal', overworld: 'normal', nether: 'nether', end: 'end', the_end: 'end', the_nether: 'nether' }

const tokenize = (input: string): string[] => input.trim().split(/\s+/).filter(Boolean)

function parseFlags (tokens: string[]) {
  const positional: string[] = []
  const flags: Record<string, string> = {}
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (/^-[sgt]$/.test(t)) {
      if (i + 1 >= tokens.length) throw new UserError(`Flag ${t} needs a value`)
      flags[t[1]] = tokens[++i]
    } else positional.push(t)
  }
  return { positional, flags }
}

export const server = function (serv: Server) {
  const worldOf = (name: string) => {
    const w = serv.worlds[name]
    if (!w) throw new UserError(`Unknown world '${name}'. Worlds: ${Object.keys(serv.worlds).join(', ')}`)
    return w
  }
  const describe = (name: string) => {
    const w = worldOf(name)
    const spec = serv.worldSpecs[name]
    const players = serv.players.filter(p => p.world === w).length
    return `${name}: ${w.environment}, generator ${w.generatorName}${spec?.preset && spec.preset !== 'default' ? ` (${spec.preset})` : ''}, seed ${w.seed}, ${players} player${players === 1 ? '' : 's'}`
  }

  const actions: Record<string, (args: string[], ctx: { player?: Player }) => string | Promise<string>> = {
    create (args) {
      const { positional, flags } = parseFlags(args)
      const [name, envName] = positional
      if (!name || !envName) throw new UserError('Usage: /mv create <name> <normal|nether|end> [-s <seed>] [-g <generator>] [-t <preset>]')
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(name)) throw new UserError('World names may only contain letters, digits, _ and - (max 32 characters)')
      const environment = ENV_ALIASES[envName.toLowerCase()]
      if (!environment) throw new UserError(`Unknown environment '${envName}' (normal | nether | end)`)
      if (flags.t && !PRESETS.includes(flags.t)) throw new UserError(`Unknown preset '${flags.t}' (${PRESETS.join(' | ')})`)
      if (flags.t && flags.t !== 'default' && environment !== 'normal') throw new UserError('Presets only apply to normal worlds')
      const world = serv.createWorld({ name, environment, generator: flags.g, seed: flags.s, preset: flags.t })
      return `Created world '${name}' (${world.environment}, generator ${world.generatorName}, seed ${world.seed}). Use /mv tp ${name}`
    },
    list () {
      return Object.keys(serv.worlds).map(describe).join('\n')
    },
    info ([name], ctx) {
      return describe(name ?? Object.keys(serv.worlds).find(n => serv.worlds[n] === ctx.player?.world) ?? 'overworld')
    },
    who ([name]) {
      const names = name ? [name] : Object.keys(serv.worlds)
      return names.map(n => `${n}: ${serv.players.filter(p => p.world === worldOf(n)).map(p => p.username).join(', ') || '-'}`).join('\n')
    },
    async tp ([name, target], ctx) {
      if (!name) throw new UserError('Usage: /mv tp <world> [player]')
      const world = worldOf(name)
      const player = target ? serv.getPlayer(target) : ctx.player
      if (!player) throw new UserError(target ? `Player '${target}' is not online` : 'Specify a player when using this from the console')
      await player.changeWorld(world, { dimension: world.dimensionId })
      return `Teleported ${player.username} to ${name}`
    },
    async remove ([name]) {
      if (!name) throw new UserError('Usage: /mv remove <world>')
      await serv.removeWorld(name)
      return `Removed world '${name}'`
    }
  }
  actions.teleport = actions.tp
  actions.unload = actions.remove
  actions.delete = actions.remove

  serv.commands.add({
    base: 'mv',
    info: 'Multiverse-style world management',
    usage: '/mv <create|list|info|who|tp|remove> ...',
    op: true,
    parse: (str) => tokenize(str),
    async action (tokens: string[], ctx) {
      const [sub, ...args] = tokens
      const fn = actions[(sub ?? 'list').toLowerCase()]
      if (!fn) throw new UserError(`Unknown subcommand '${sub}'. Try: create, list, info, who, tp, remove`)
      return await fn(args, ctx)
    }
  })

  for (const sub of ['create', 'list', 'info', 'who', 'tp', 'remove']) {
    serv.commands.add({
      base: 'mv' + sub,
      info: `/mv ${sub}`,
      usage: `/mv${sub} ...`,
      op: true,
      parse: (str) => tokenize(str),
      action: async (tokens: string[], ctx) => await actions[sub](tokens, ctx)
    })
  }
}
