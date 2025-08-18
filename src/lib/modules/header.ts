export const player = function (player: Player, serv: Server, settings: Options) {
  player.playerlistUpdateText = function (header, footer) {
    player._client.write('playerlist_header', {
      header: serv._createChatComponent(header).toNetworkFormat(),
      footer: serv._createChatComponent(footer).toNetworkFormat()
    })
  }

  if (settings['player-list-text']) {
    const header = settings['player-list-text'].header || ''
    const footer = settings['player-list-text'].footer || ''
    player.playerlistUpdateText(header, footer)
  }
}
declare global {
  interface Player {
    /** @internal */
    "playerlistUpdateText": (header: any, footer: any) => void
  }
}
