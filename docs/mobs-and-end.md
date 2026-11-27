# Mobs, spawners, projectiles and the End

Simplified survival progression for local single player (all server side, no client mods needed except the optional prediction fix in the web client).

## Entity physics (`src/lib/entityPhysics.ts`)
Items, mobs and projectiles move as boxes against the real collision shapes, one axis at a time (y, x, z). Unloaded chunks are solid, an entity that starts inside blocks is lifted out through the top, liquids slow things down and carry items. Entities that stand still are re-sent as absolute positions every half second so clients that predict movement themselves do not drift away.

## Mobs (`modules/mobs.ts`)
`serv.mobDefs` has health, speed, damage and drops for the common mobs. Melee mobs (zombie, spider, ...) walk at the nearest survival player and hop over one-block steps, skeletons keep their distance and shoot arrows (aimed with drop), creepers explode after a 1.5 s fuse, blazes hover and shoot fireball bursts, animals wander. Players hit mobs with the damage of the item in hand (crits when falling); mobs die with the death animation, drop their loot and give XP to the killer. No path finding, line of sight or natural spawning (mobs come from spawners, `/summon` and spawn eggs).

## Projectiles (`modules/projectiles.ts`)
Arrows (skeletons, bows: hold the use key, release to shoot, uses an arrow), blaze fireballs (set the target on fire), ender pearls (teleport, 5 damage), eyes of ender. The eye flies towards the real nearest stronghold (`world.strongholds()` from minecraft-worldgen: up in a 12 block hop when far, 80 % come back as an item). Placing eyes in a frame opens the portal (portal.ts).

## Spawners (`modules/spawners.ts`)
Spawner block entities from worldgen (nether fortress blazes, dungeons, mineshaft cave spiders, stronghold silverfish) and from vanilla saves: delay 20, then 200-800 ticks while a survival player is within 16 blocks, up to 4 mobs within 4 blocks, at most 6 of the type nearby. Light and the mobs' own spawn rules are ignored, so blazes spawn in the air.

## The End (`modules/endFight.ts`)
Arrival platform at (100, 48, 0). When a player is in the End the first time, ten end crystals appear on the pillars (positions from worldgen `endSpikes`) and the ender dragon (boss bar). It circles at radius 32 and dives at players; each crystal within 40 blocks heals it. Crystals explode when hit. The first kill gives 12000 XP and builds the exit portal with the dragon egg (`/enderfight state|start|reset`, state in `flyingsquid-end.json`). Players in the End always see night.

## Buckets and obsidian (`modules/buckets.ts`)
Obsidian (nether portals) is obtainable: craft a bucket (3 iron), pick up a water source (ocean, river) and a lava source (lava lakes), pour. Fluids do not flow, so a poured bucket is one still source block and the usual reactions are done directly: water onto / next to a lava source makes **obsidian**, next to flowing lava **cobblestone**, water into lava does the same at that spot, lava poured next to water makes obsidian. Aim at the surface of a lake with the use key; creative players keep their bucket. Mining obsidian drops it (no tool tier check, a diamond pickaxe is just much faster for the client). The look direction sent with `use_item` (1.21.2+) is used for aiming, a click can arrive before the look packet.
