import { versionToNumber } from '../../utils'

export const server = function (serv: Server, options: Options) {
  const supportsNewTitle = versionToNumber(options.version) >= versionToNumber('1.17')
  const titleText = (text: any) => serv._createNetworkEncodedChatComponent?.(text) ?? JSON.stringify(typeof text === 'string' ? { text } : text)

  serv.sendTitle = (player: Player, title: any, subtitle?: any, fadeIn = 10, stay = 70, fadeOut = 20) => {
    if (supportsNewTitle) {
      // 1.17+ uses separate packets
      if (title) {
        player._client.write('set_title_text', {
          text: titleText(title)
        })
      }
      if (subtitle) {
        player._client.write('set_title_subtitle', {
          text: titleText(subtitle)
        })
      }
      player._client.write('set_title_time', {
        fadeIn,
        stay,
        fadeOut
      })
    } else {
      player._client.write('title', {
        action: 3,
        fadeIn,
        stay,
        fadeOut
      })
      if (title) {
        player._client.write('title', {
          action: 0,
          text: titleText(title)
        })
      }
      if (subtitle) {
        player._client.write('title', {
          action: 1,
          text: titleText(subtitle)
        })
      }
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
        action: 3,
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
      // Pre-1.17 uses title packet with action 2
      player._client.write('title', {
        action: 2, // Action bar
        text: titleText(message)
      })
    }
  }

  serv.clearTitle = (player: Player) => {
    if (supportsNewTitle) {
      player._client.write('clear_titles', {
        reset: false
      })
    } else {
      player._client.write('title', {
        action: 4
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
        action: 5
      })
    }
  }
}

declare global {
  interface Server {
    sendTitle: (player: Player, title: any, subtitle?: any, fadeIn?: number, stay?: number, fadeOut?: number) => void
    setTitleTimes: (player: Player, fadeIn?: number, stay?: number, fadeOut?: number) => void
    sendActionBar: (player: Player, message: any) => void
    clearTitle: (player: Player) => void
    resetTitle: (player: Player) => void
  }
}
