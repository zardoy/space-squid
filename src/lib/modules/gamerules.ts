export const server = function (serv: Server, options: Options) {
  serv.gamerules ??= {}
  serv.on('asap', () => {
    for (const [key, val] of Object.entries(serv.levelData?.GameRules ?? {})) {
      serv.gamerules[key] = val === 'true'
    }
  })

  const gameRules = {
    'doDayLightCycle': 'Wether to enable daylight cycle'
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
      if (newVal) {
        serv.gameMode[rule] = newVal === 'false' ? false : true
        return `set ${rule} to ${serv.gamerules[rule]}`
      } else {
        const gamerule = serv.gamerules[rule]
        return `${rule} is ${gamerule ? 'Enabled' : 'Disabled'} (${gamerule})`
      }
    }
  })
}

declare global {
  interface Server {
    gamerules: Record<string, boolean>
  }
}
