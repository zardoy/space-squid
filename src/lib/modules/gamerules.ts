export const server = function (serv: Server, options: Options) {
  serv.gamerules ??= {}
  serv.on('pluginsReady', () => {
    for (const [key, val] of Object.entries(serv.levelData?.GameRules ?? {})) {
      serv.gamerules[key] = val === 'true'
    }
  })

  const knownGameRules = [
    "doTileDrops",
    "doFireTick",
    "reducedDebugInfo",
    "naturalRegeneration",
    "doMobLoot",
    "keepInventory",
    "doEntityDrops",
    "mobGriefing",
    "randomTickSpeed",
    "commandBlockOutput",
    "doMobSpawning",
    "logAdminCommands",
    "sendCommandFeedback",
    "doDaylightCycle",
    "showDeathMessages",
  ]

  const gameRules: Partial<typeof serv.gamerules> = {
    'doDaylightCycle': 'Wether to enable daylight cycle'
  }

  serv.commands.add({
    base: 'gamerule',
    info: '',
    usage: '/gamerule <gamerule> <true|false>',
    op: true,
    parse (string, ctx) {
      return string.split(' ')
    },
    action (data, ctx) {
      const [rule, newVal] = data
      if (!rule) {
        return `Available these gamerules: ${Object.entries(gameRules).map(([key, desc]) => `${key}: ${desc}`).join(', ')}`
      }
      if (!knownGameRules.includes(rule)) ctx.player?.chat(serv.color.yellow + `Warning: gamerule ${rule} is not known`)
      if (newVal) {
        serv.gamerules[rule] = newVal === 'false' ? false : true
        return `Set ${rule} to ${serv.gamerules[rule]}`
      } else {
        const gamerule = serv.gamerules[rule]
        return `${rule} is ${gamerule ? 'Enabled' : 'Disabled'} (${gamerule})`
      }
    }
  })
}

declare global {
  interface Server {
    gamerules: Partial<NonNullable<NonNullable<Server['levelData']>['GameRules']>>
  }
}
