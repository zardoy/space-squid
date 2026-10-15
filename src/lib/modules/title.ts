import { versionToNumber } from '../../utils'

export const server = function (serv: Server, options: Options) {
  const supportsNewTitle = versionToNumber(options.version) >= versionToNumber('1.17')
  const supportsTitleActionBar = versionToNumber(options.version) >= versionToNumber('1.11')
  const titleTimesAction = supportsTitleActionBar ? 3 : 2
  const titleClearAction = supportsTitleActionBar ? 4 : 3
  const titleResetAction = supportsTitleActionBar ? 5 : 4
  const titleText = (text: any) => serv._createNetworkEncodedChatComponent?.(text) ?? JSON.stringify(typeof text === 'string' ? { text } : text)

  serv.sendTitle = (player: Player, title: any, subtitle?: any, fadeIn = 10, stay = 70, fadeOut = 20) => {
    if (supportsNewTitle) {
      // 1.17+ uses separate packets
      if (title) {
        serv.sendTitleText(player, title)
      }
      if (subtitle) {
        serv.sendSubtitle(player, subtitle)
      }
      player._client.write('set_title_time', {
        fadeIn,
        stay,
        fadeOut
      })
    } else {
      player._client.write('title', {
        action: titleTimesAction,
        fadeIn,
        stay,
        fadeOut
      })
      if (title) {
        serv.sendTitleText(player, title)
      }
      if (subtitle) {
        serv.sendSubtitle(player, subtitle)
      }
    }
  }

  serv.sendTitleText = (player: Player, title: any) => {
    if (supportsNewTitle) {
      player._client.write('set_title_text', {
        text: titleText(title)
      })
    } else {
      player._client.write('title', {
        action: 0,
        text: titleText(title)
      })
    }
  }

  serv.sendSubtitle = (player: Player, subtitle: any) => {
    if (supportsNewTitle) {
      player._client.write('set_title_subtitle', {
        text: titleText(subtitle)
      })
    } else {
      player._client.write('title', {
        action: 1,
        text: titleText(subtitle)
      })
    }
  }

  serv.setTitleTimes = (player: Player, fadeIn = 10, stay = 70, fadeOut = 20) => {
    if (supportsNewTitle) {
      player._client.write('set_title_time', {
        fadeIn,
        stay,
        fadeOut
      })
    } else {
      player._client.write('title', {
        action: titleTimesAction,
        fadeIn,
        stay,
        fadeOut
      })
    }
  }

  serv.sendActionBar = (player: Player, message: any) => {
    if (supportsNewTitle) {
      // 1.17+ has dedicated action bar packet
      player._client.write('action_bar', {
        text: titleText(message)
      })
    } else {
      if (supportsTitleActionBar) {
        // 1.11-1.16 uses title packet action 2 for action bars.
        player._client.write('title', {
          action: 2,
          text: titleText(message)
        })
      } else {
        // 1.8-1.10 has no title action-bar action; use chat position 2.
        player._client.write('chat', {
          message: titleText(message),
          position: 2
        })
      }
    }
  }

  serv.clearTitle = (player: Player) => {
    if (supportsNewTitle) {
      player._client.write('clear_titles', {
        reset: false
      })
    } else {
      player._client.write('title', {
        action: titleClearAction
      })
    }
  }

  serv.resetTitle = (player: Player) => {
    if (supportsNewTitle) {
      player._client.write('clear_titles', {
        reset: true
      })
    } else {
      player._client.write('title', {
        action: titleResetAction
      })
    }
  }
}

declare global {
  interface Server {
    sendTitle: (player: Player, title: any, subtitle?: any, fadeIn?: number, stay?: number, fadeOut?: number) => void
    sendTitleText: (player: Player, title: any) => void
    sendSubtitle: (player: Player, subtitle: any) => void
    setTitleTimes: (player: Player, fadeIn?: number, stay?: number, fadeOut?: number) => void
    sendActionBar: (player: Player, message: any) => void
    clearTitle: (player: Player) => void
    resetTitle: (player: Player) => void
  }
}
