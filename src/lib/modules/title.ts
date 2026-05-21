import { versionToNumber } from '../../utils'

export const server = function (serv: Server, options: Options) {
  const supportsNewTitle = versionToNumber(options.version) >= versionToNumber('1.17')

  const encodeChat = (message: string | Record<string, any>): string => {
    if (typeof message === 'string') {
      return serv._createNetworkEncodedChatComponent(message)
    }
    return JSON.stringify(message)
  }

  serv.sendTitle = (player: Player, title: string | Record<string, any>, subtitle?: string | Record<string, any>, fadeIn = 10, stay = 70, fadeOut = 20) => {
    if (supportsNewTitle) {
      // 1.17+ uses separate packets
      if (title) {
        player._client.write('set_title_text', {
          text: encodeChat(title)
        })
      }
      if (subtitle) {
        player._client.write('set_title_subtitle', {
          text: encodeChat(subtitle)
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
          text: encodeChat(title)
        })
      }
      if (subtitle) {
        player._client.write('title', {
          action: 1,
          text: encodeChat(subtitle)
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

  serv.sendActionBar = (player: Player, message: string | Record<string, any>) => {
    if (supportsNewTitle) {
      // 1.17+ has dedicated action bar packet
      player._client.write('action_bar', {
        text: encodeChat(message)
      })
    } else {
      // Pre-1.17 uses title packet with action 2
      player._client.write('title', {
        action: 2, // Action bar
        text: encodeChat(message)
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
    sendTitle: (player: Player, title: string | Record<string, any>, subtitle?: string | Record<string, any>, fadeIn?: number, stay?: number, fadeOut?: number) => void
    setTitleTimes: (player: Player, fadeIn?: number, stay?: number, fadeOut?: number) => void
    sendActionBar: (player: Player, message: string | Record<string, any>) => void
    clearTitle: (player: Player) => void
    resetTitle: (player: Player) => void
  }
}
