import { cpus } from 'os'

export const player = function (player: Player, server: Server, settings: Options) {
  player.playerlistUpdateText = (header, footer) => {
    let cpuUsage = cpus().map(cpu => {
      const total = cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle
      const idle = cpu.times.idle
      return (total - idle) / total * 100
    }).reduce((sum, val) => sum + val, 0) / cpus().length
    cpuUsage = Math.round(cpuUsage * 100) / 100
    let mem = process.memoryUsage().heapUsed / 1024 / 1024
    mem = Math.round(mem * 100) / 100
    return player._client.write('playerlist_header', {
      header: JSON.stringify({ text: `SPACE SQUID. Memory Usage: ${mem} MB. CPU Usage: ${cpuUsage * 2}%` }),
      footer: JSON.stringify(footer)
    })
  }

  if (settings['player-list-text']) {
    player.playerlistUpdateText(settings['player-list-text'].header || { text: '' }, settings['player-list-text'].footer || { text: '' })
  }
}
declare global {
  interface Player {
    /** @internal */
    "playerlistUpdateText": (header: any, footer: any) => void
  }
}
