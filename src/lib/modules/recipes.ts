import fs from 'fs'
import UserError from '../user_error'
import { BUILTIN_RECIPES, RECIPE_INFO } from 'minecraft-worldgen/dist/recipe/builtin'
import type { RecipeSpec } from 'minecraft-worldgen/dist/recipe/types'

/**
 * Recipe worlds for experimenting: `/recipe new|set|regen|edit|list|apply|editor`.
 * A recipe world's spec lives in `<world folder>/recipes/<name>.json` (best effort - browser file systems keep it in memory only).
 * Custom channels (JSON in a string, like the other minecraft-web-client channels):
 *  - server -> client `minecraft-web-client:recipe-state`   { world, spec, builtins: { name: { title, description, params[] } } }  (data for a visual editor)
 *  - client -> server `minecraft-web-client:recipe-apply`   { world, spec }                                                       (ops only: regenerates the world)
 *  - server -> client `minecraft-web-client:ide-open`       (the web client's IDE editor) opens `recipes/<name>.json`; the editor's save arrives as `minecraft-web-client:ide-save` with id `recipe:<name>` and regenerates the world
 */
const STATE_CHANNEL = 'minecraft-web-client:recipe-state'
const APPLY_CHANNEL = 'minecraft-web-client:recipe-apply'
const IDE_OPEN_CHANNEL = 'minecraft-web-client:ide-open'
const IDE_SAVE_CHANNEL = 'minecraft-web-client:ide-save'
const str = ['pstring', { countType: 'i16' }]
const ideOpenChannel = ['container', [{ name: 'id', type: str }, { name: 'language', type: str }, { name: 'contents', type: str }, { name: 'line', type: 'i32' }, { name: 'column', type: 'i32' }, { name: 'title', type: str }]]
const ideSaveChannel = ['container', [{ name: 'id', type: str }, { name: 'contents', type: str }, { name: 'language', type: str }, { name: 'line', type: 'i32' }, { name: 'column', type: 'i32' }]]
const jsonChannel = ['container', [{ name: 'data', type: ['pstring', { countType: 'i16' }] }]]

const NAME_RE = /^[A-Za-z0-9_-]{1,32}$/

export const server = function (serv: Server, options: Options) {
  const dir = options.worldFolder ? `${options.worldFolder}/recipes` : undefined
  const specs: Record<string, RecipeSpec> = {}

  const fileOf = (name: string) => dir ? `${dir}/${name}.json` : undefined
  const save = (name: string) => {
    const file = fileOf(name)
    if (!file) return
    try { fs.mkdirSync(dir!, { recursive: true }) } catch {}
    try { fs.writeFileSync(file, JSON.stringify(specs[name], null, 2)) } catch {}
  }
  /** the spec of a recipe world: file (edited by hand / IDE) wins over the remembered one */
  const load = (name: string): RecipeSpec | undefined => {
    const file = fileOf(name)
    try { if (file && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { throw new UserError(`recipes/${name}.json is not valid JSON: ${(e as Error).message}`) }
    return specs[name] ?? (serv.worldSpecs[name]?.recipe as RecipeSpec | undefined)
  }
  const validate = (spec: any): RecipeSpec => {
    if (!spec || typeof spec !== 'object') throw new UserError('A recipe is a JSON object: { "builtin": "<name>", "options": {...} } or a full recipe')
    if ('builtin' in spec && !BUILTIN_RECIPES[spec.builtin]) throw new UserError(`Unknown built-in recipe '${spec.builtin}'. Built-in: ${Object.keys(BUILTIN_RECIPES).join(', ')}`)
    if (!('builtin' in spec) && !('script' in spec) && typeof spec.name !== 'string') throw new UserError('A full recipe needs a "name"')
    return spec as RecipeSpec
  }

  const state = (name: string) => ({
    world: name,
    spec: specs[name] ?? load(name) ?? null,
    builtins: Object.fromEntries(Object.entries(RECIPE_INFO)),
    recipes: Object.keys(specs)
  })
  const sendState = (player: Player, name: string, open = false) => {
    try { player._client.writeChannel(STATE_CHANNEL, { data: JSON.stringify({ ...state(name), open }) }) } catch {}
  }

  /** (re)creates the recipe world `name` and moves the players that were inside (plus `also`) into it */
  async function apply (name: string, spec: RecipeSpec, also?: Player): Promise<string> {
    if (!NAME_RE.test(name)) throw new UserError('World names may only contain letters, digits, _ and - (max 32 characters)')
    if (['overworld', 'nether', 'end'].includes(name)) throw new UserError(`'${name}' is a core world`)
    validate(spec)
    const prev = serv.worlds[name]
    const seed = prev?.seed
    const inside = prev ? serv.players.filter(p => p.world === prev) : []
    if (prev) {
      await serv.removeWorld(name)
      serv.deleteWorldData(name)
    }
    specs[name] = spec
    save(name)
    const world = serv.createWorld({ name, environment: 'normal', recipe: spec as any, seed })
    // surfaces generator errors (bad recipe) right away
    try { await world.getColumn(0, 0) } catch (e) {
      // roll back: a world that cannot generate is useless (the previous spec is not restored - re-run the command with a fixed recipe)
      try { await serv.removeWorld(name); serv.deleteWorldData(name) } catch {}
      delete specs[name]
      throw new UserError(`The recipe failed to generate: ${String((e as Error).message ?? e).split('\n')[0]}`)
    }
    for (const p of new Set([...inside, ...(also ? [also] : [])])) {
      await p.changeWorld(world, { dimension: world.dimensionId })
      sendState(p, name)
    }
    return `World '${name}' generated from ${'builtin' in spec ? `recipe ${spec.builtin}` : 'a custom recipe'}${prev ? ' (regenerated)' : ''}`
  }

  const parseValue = (v: string): any => { try { return JSON.parse(v) } catch { return v } }

  const actions: Record<string, (args: string[], ctx: { player?: Player }, rest: string) => string | Promise<string>> = {
    list () {
      const own = Object.keys(specs).map(n => `${n}: ${'builtin' in specs[n] ? (specs[n] as any).builtin : 'custom'}`)
      return `Built-in recipes: ${Object.keys(BUILTIN_RECIPES).join(', ')}\nRecipe worlds: ${own.join(', ') || '-'}`
    },
    info ([builtin]) {
      const info = RECIPE_INFO[builtin]
      if (!info) throw new UserError(`Usage: /recipe info <${Object.keys(RECIPE_INFO).join('|')}>`)
      return `${info.title}: ${info.description}\n` + info.params.map(p => `  ${p.key} (${p.type}${p.min !== undefined ? ` ${p.min}..${p.max}` : ''}, default ${p.default}) ${p.label}`).join('\n')
    },
    async new ([name, builtin, ...kv], ctx) {
      if (!name || !builtin) throw new UserError(`Usage: /recipe new <name> <${Object.keys(BUILTIN_RECIPES).join('|')}> [key=value ...]`)
      if (serv.worlds[name] && !specs[name]) throw new UserError(`World '${name}' already exists and is not a recipe world`)
      const options: Record<string, any> = {}
      for (const p of kv) { const i = p.indexOf('='); if (i > 0) options[p.slice(0, i)] = parseValue(p.slice(i + 1)) }
      return await apply(name, { builtin, options }, ctx.player)
    },
    /** /recipe set <world> key=value ... : change options of a built-in recipe world and regenerate it */
    async set ([name, ...kv], ctx) {
      const spec = name ? load(name) : undefined
      if (!spec || !('builtin' in spec)) throw new UserError('Usage: /recipe set <world> key=value ...  (the world must be a built-in recipe world; see /recipe info <recipe>)')
      const options = { ...(spec.options ?? {}) }
      for (const p of kv) {
        const i = p.indexOf('=')
        if (i <= 0) throw new UserError(`Expected key=value, got '${p}'`)
        options[p.slice(0, i)] = parseValue(p.slice(i + 1))
      }
      return await apply(name, { ...spec, options }, ctx.player)
    },
    async regen ([name], ctx) {
      const spec = name ? load(name) : undefined
      if (!spec) throw new UserError('Usage: /recipe regen <world>  (re-reads recipes/<world>.json and regenerates the world)')
      return await apply(name, spec, ctx.player)
    },
    /** /recipe apply <world> <json> */
    async apply ([name], ctx, rest) {
      const json = rest.slice(rest.indexOf(name) + name.length).trim()
      if (!name || !json) throw new UserError('Usage: /recipe apply <world> <json spec>')
      let spec: any
      try { spec = JSON.parse(json) } catch (e) { throw new UserError(`Invalid JSON: ${(e as Error).message}`) }
      return await apply(name, spec, ctx.player)
    },
    /** opens the recipe file in the IDE editor of the web client and sends the data for the visual editor */
    edit ([name], ctx) {
      const spec = name ? load(name) : undefined
      if (!spec) throw new UserError('Usage: /recipe edit <world>')
      if (!ctx.player) throw new UserError('Only players can open the editor')
      specs[name] = spec
      save(name)
      sendState(ctx.player, name)
      try {
        ctx.player._client.writeChannel(IDE_OPEN_CHANNEL, { id: `recipe:${name}`, language: 'json', contents: JSON.stringify(spec, null, 2), line: 0, column: 0, title: `recipes/${name}.json` })
      } catch {}
      return `Opened recipes/${name}.json in the editor: save it to regenerate '${name}' (or /recipe regen ${name}).`
    },
    editor (args, ctx) {
      const name = args[0] ?? Object.keys(serv.worlds).find(n => serv.worlds[n] === ctx.player?.world)
      if (ctx.player) sendState(ctx.player, name && specs[name] ? name : (args[0] ?? 'lab'), true)
      return 'Visual editor: docs/recipe-editor.html (standalone page; paste its JSON into /recipe apply <world> <json> or save it as recipes/<world>.json and /recipe regen <world>), or the web client\'s recipe panel (channel minecraft-web-client:recipe-state).'
    }
  }

  serv.commands.add({
    base: 'recipe',
    info: 'Create / tune / regenerate custom dimensions (world recipes)',
    usage: '/recipe <list|info|new|set|regen|apply|edit|editor> ...',
    op: true,
    parse: (str) => ({ tokens: str.trim().split(/\s+/).filter(Boolean), raw: str }),
    async action ({ tokens, raw }: { tokens: string[], raw: string }, ctx) {
      const [sub, ...args] = tokens
      const fn = actions[(sub ?? 'list').toLowerCase()]
      if (!fn) throw new UserError(`Unknown subcommand '${sub}'. Try: list, info, new, set, regen, apply, edit, editor`)
      return await fn(args, ctx, raw)
    }
  })

  // recipe worlds restored from the saved world list: remember their specs for /recipe set / regen / edit
  serv.once('pluginsReady' as any, () => {
    for (const [name, spec] of Object.entries(serv.worldSpecs)) if (spec.recipe && typeof spec.recipe === 'object') specs[name] = spec.recipe as RecipeSpec
    for (const [name, spec] of Object.entries(serv.worldSpecs)) if (typeof spec.recipe === 'string') specs[name] = { builtin: spec.recipe }
  })

  serv.recipes = { apply, specs, state }
}

export const player = function (player: Player, serv: Server) {
  player._client.registerChannel(STATE_CHANNEL, jsonChannel)
  player._client.registerChannel(APPLY_CHANNEL, jsonChannel)
  player._client.registerChannel(IDE_OPEN_CHANNEL, ideOpenChannel)
  player._client.registerChannel(IDE_SAVE_CHANNEL, ideSaveChannel)
  player._client.on(IDE_SAVE_CHANNEL, async (packet: { id: string, contents: string }) => {
    if (!packet.id?.startsWith('recipe:')) return
    try {
      if (!player.op) throw new UserError('Only operators can change recipes')
      const message = await serv.recipes.apply(packet.id.slice('recipe:'.length), JSON.parse(packet.contents), player)
      player.chat(message)
    } catch (e) {
      player.chat(`Recipe: ${(e as Error).message}`)
    }
  })
  player._client.on(APPLY_CHANNEL, async (packet: { data: string }) => {
    try {
      if (!player.op) throw new UserError('Only operators can change recipes')
      const { world, spec } = JSON.parse(packet.data)
      const message = await serv.recipes.apply(world, spec, player)
      player.chat(message)
    } catch (e) {
      player.chat(`Recipe: ${(e as Error).message}`)
    }
  })
  player.on('spawned', () => {
    const name = Object.keys(serv.worlds).find(n => serv.worlds[n] === player.world)
    if (name && serv.recipes.specs[name]) try { player._client.writeChannel(STATE_CHANNEL, { data: JSON.stringify(serv.recipes.state(name)) }) } catch {}
  })
}

declare global {
  interface Server {
    recipes: { apply: (name: string, spec: RecipeSpec, also?: Player) => Promise<string>, specs: Record<string, RecipeSpec>, state: (name: string) => any }
  }
}
