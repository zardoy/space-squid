# Worlds, dimensions and presets

The server keeps a registry of worlds (`serv.worlds`). Three are always present: `overworld`, `nether` and `end`
(the noise generator builds real Nether / End terrain; other generators fall back to the simple nether generator / a void End).

## Multiverse-style commands (ops)

```
/mv create <name> <normal|nether|end> [-s <seed>] [-g <generator>] [-t <preset>]
/mv list | /mv info [world] | /mv who [world]
/mv tp <world> [player]       (also /changeworld <world>)
/mv remove <world>            (players inside are moved to the overworld; overworld / nether / end cannot be removed)
```
Short forms: `/mvcreate /mvlist /mvinfo /mvwho /mvtp /mvremove`.

* `-g` generator: `noise` (default), `superflat`, `empty`, `grass_field`, ... (see `src/lib/generations.js`)
* `-t` preset (noise generator, overworld): `default`, `amplified`, `large_biomes`, `caves`, `floating_islands`
  (the vanilla noise settings of the same name, evaluated on the biome table of the loaded datapack, vanilla's own table when there is none)

Worlds can also be declared in the server options:

```json
{ "worlds": [ { "name": "amped", "environment": "normal", "preset": "amplified", "seed": 42 } ] }
```

## API

`serv.createWorld({ name, environment, generator?, seed?, preset?, options? })`, `serv.removeWorld(name)`,
`player.changeWorld(world, { dimension: world.dimensionId })`.

## Custom dimensions: world recipes

Everything the noise generator does is data driven (noise settings, density functions, biomes, surface rules, features), so a custom
dimension is a small *world recipe*: noise settings / density functions / biome source / biome tweaks that are layered over the loaded
datapack for that one world (`src/recipe/` of the [minecraft-worldgen](https://github.com/zardoy/minecraft-worldgen) package).

Built-in recipes (use as `-t`, or as `recipe`):

| name | what |
| --- | --- |
| `mining` | stone world, bedrock floor, worm tunnels + caverns, ores x4 (`oreFactor`), no trees / villages. Options: `surfaceY, hills, oreFactor, caves, carvers, wormSize, chamberThreshold, minY, height` |
| `islands` | grassy islands over an endless void. Options: `level, spread, size, thickness, presence, biome` |
| `chaos` | random layered noise terrain, random block bands, random biome patchwork - derived from the world seed (`chaosSeed` overrides) |

```
/mv create digdeep normal -t mining
/mv create sky normal -t islands -s 123
```

```json
{ "worlds": [
  { "name": "digdeep", "environment": "normal", "recipe": { "builtin": "mining", "options": { "oreFactor": 8, "hills": 30 } } },
  { "name": "mine", "environment": "normal", "recipe": { "script": "./recipes/mine.js", "options": {} } }
] }
```

A recipe is plain JSON (`WorldRecipe`, see `recipe/types.ts`), or a module exporting a function `(ctx, options) => recipe` (`ctx.reg` is the datapack registry, `ctx.seed` the world seed):

```js
const { df, rule } = require('minecraft-worldgen/dist/recipe')   // JSON builders for density functions / surface rules
module.exports = (ctx, o) => ({
  name: 'hills',                       // generated entries are recipe:hills/...
  base: 'minecraft:caves',             // noise settings to start from
  noiseSettings: {                     // deep merged over the base settings
    noise: { min_y: -64, height: 256 },
    default_block: 'minecraft:stone', default_fluid: 'minecraft:air',
    material_rule: rule.sequence(rule.bedrockFloor()),
    noise_router: { final_density: df.interpolated(df.add(df.yGradient(40, 90, 1, -1), df.mul(0.6, df.noise('minecraft:erosion', 4, 0)))) }
  },
  biomes: { kind: 'fixed', biome: 'minecraft:plains' },   // or overworld | nether | end | multi_noise (own table)
  biomeOverrides: { 'minecraft:plains': { features: [[], [], [], [], [], [], ['minecraft:ore_diamond'], [], [], [], []] } },
  structures: false
})
```

### Experimenting: `/recipe` and the visual editor

```
/recipe list | /recipe info <recipe>
/recipe new lab canyons depth=150 plateau=120   create world 'lab' from a recipe and go there
/recipe set lab depth=60                         change options and regenerate
/recipe regen lab                                re-read recipes/lab.json (edit it in the IDE) and regenerate
/recipe apply lab {"builtin":"mining","options":{"oreFactor":8}}
/recipe edit lab                                 open recipes/lab.json in the IDE editor + send the data of the visual editor
```
More built-ins: `spires`, `swiss`, `drowned`, `canyons`, `upside_down` (see `/recipe info <name>` for options). A spec may carry `"patch": {...}`
that is deep-merged over the recipe the built-in produces. Regenerating deletes the saved chunks of that world and moves the players back in.

In the web client (prismarine-web-client): `/recipe editor` or the *Dimension recipe editor* key action opens a panel (recipe select, a slider per option, JSON preview, Apply);
`/recipe edit <world>` opens `recipes/<world>.json` in the client's IDE editor (channels `ide-open` / `ide-save`; saving regenerates the world).
`?worldgenPerf=1` opens a benchmark page of the world generator (grid of chunks coloured by generation time, per-stage split, workers / seed / settings / recipe / radius controls, copyable results).

`docs/recipe-editor.html` is a standalone visual editor (sliders per option, live JSON, "copy /recipe command"). Web client integration uses custom channels
(`minecraft-web-client:recipe-state` server -> client with the option schema and current spec, `minecraft-web-client:recipe-apply` client -> server with `{ world, spec }`,
`minecraft-web-client:open-file` server -> client with `{ path, content }` for the IDE editor); each carries one JSON string.

`npx tsx src/tools/recipe-view.ts <recipe> [seed] [chunkX] [chunkZ] [json options]` (run in the minecraft-worldgen repo) prints an ASCII slice of a recipe world.
Recipe worlds are clipped to the dimension type of the world (`normal`: y -64..320; `nether` / `end`: 0..256).
