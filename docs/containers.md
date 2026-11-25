# Containers, loot and smelting

## Containers

Chests (single and double, trapped), barrels, shulker boxes, hoppers, dispensers, droppers and the ender chest open and keep their items.
The items are the vanilla block entity (`Items`) of the chunk column, so they are saved with the chunk (Anvil) and a vanilla world opens with its chests filled.
Breaking a container drops its items (not in creative); the other half of a double chest becomes a single chest again. The ender chest belongs to the player (`EnderItems` in the player data).

API: `serv.openContainer(player, world, pos)`, `serv.containers` (`entityAt`, `readSlots`, `itemsOf`, `setSlot`, `setLootTable`, ...).

## Loot

A container with a `LootTable` (and optional `LootTableSeed`) generates its loot when it is opened or broken, like vanilla: unopened chests of vanilla worlds work, the same seed gives the same loot.
`/loot <x> <y> <z> <table> [seed]` (op) puts a table into a container, e.g. `/loot ~ ~-1 ~ chests/simple_dungeon`.

Loot tables and recipes are read from (later wins):

1. the vanilla client jar (node: `MC_WORLDGEN_VANILLA_JAR`, default `~/.cache/mc-worldgen/client.jar`; or `gameDataJars` in the options),
2. zip URL(s) in `globalThis.__MC_GAMEDATA_URL` (browser; a string, a list or a function returning them; a small zip with `data/minecraft/loot_table/chests/*` and the cooking `data/minecraft/recipe/*` is enough, the worldgen pack is not read),
3. datapack zips in `<worldFolder>/datapacks/`,
4. the `lootTables` option (`{ 'minecraft:chests/foo': {...} }` or a function).

Both datapack formats are read (`functions` / `modifier`). Items the running version does not have are left out. Enchantments, damage, potions and names are applied to the
item NBT up to 1.20.4; from 1.20.5 (item components) only id and count are stored.
Chests that the world generator itself places have no loot table yet (minecraft-worldgen does not create block entities).

## Smelting

Furnaces, blast furnaces and smokers cook with the cooking recipes of the datapack (a built-in list of the vanilla recipes without one): fuel burns, the progress shows in the window,
the furnace lights up, the experience goes to the player who takes the result. State is the vanilla block entity (`BurnTime`, `CookTime`, `CookTimeTotal`), a running furnace
continues after a restart. Furnaces only cook while their chunk is loaded.

## Worlds

A player saved in the nether / end / another world joins that world again (the login packet names the right dimension), `/mv tp` and `/changeworld` put the player on a standable spot
of the target world (nether coordinates 1:8) instead of the overworld spawn point, dying elsewhere respawns in the overworld, nether portals are saved in `flyingsquid-portals.json`.

New players of a survival world start with a stack of ender pearls in the first hotbar slot (`startingPearls` option, default 16, `false` = none).
