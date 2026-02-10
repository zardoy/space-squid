import { versionToNumber } from '../../utils'

export const server = function (serv: Server, options: Options) {
  const supportsNewTitle = versionToNumber(options.version) >= versionToNumber('1.17')

  serv.sendTitle = (player: Player, title: string, subtitle?: string, fadeIn = 10, stay = 70, fadeOut = 20) => {
    if (supportsNewTitle) {
      // 1.17+ uses separate packets
      if (title) {
        player._client.write('set_title_text', {
          text: JSON.stringify({ text: title })
        })
      }
      if (subtitle) {
        player._client.write('set_title_subtitle', {
          text: JSON.stringify({ text: subtitle })
        })
      }
      player._client.write('set_title_time', {
        fadeIn,
        stay,
        fadeOut
      })
    } else {
      // Pre-1.17 uses single title packet
      if (title) {
        player._client.write('title', {
          action: 0, // Set title
          text: JSON.stringify({ text: title }),
          fadeIn,
          stay,
          fadeOut
        })
      }
      if (subtitle) {
        player._client.write('title', {
          action: 1, // Set subtitle
          text: JSON.stringify({ text: subtitle })
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
        action: 2, // Set times
        fadeIn,
        stay,
        fadeOut
      })
    }
  }

  serv.sendActionBar = (player: Player, message: string) => {
    if (supportsNewTitle) {
      // 1.17+ has dedicated action bar packet
      player._client.write('action_bar', {
        text: JSON.stringify({ text: message })
      })
    } else {
      // Pre-1.17 uses title packet with action 2
      player._client.write('title', {
        action: 2, // Action bar
        text: JSON.stringify({ text: message })
      })
    }
  }

  serv.clearTitle = (player: Player) => {
    if (supportsNewTitle) {
      player._client.write('clear_titles', {
        reset: true
      })
    } else {
      player._client.write('title', {
        action: 4 // Clear
      })
    }
  }
}

declare global {
  interface Server {
    sendTitle: (player: Player, title: string, subtitle?: string, fadeIn?: number, stay?: number, fadeOut?: number) => void
    setTitleTimes: (player: Player, fadeIn?: number, stay?: number, fadeOut?: number) => void
    sendActionBar: (player: Player, message: string) => void
    clearTitle: (player: Player) => void
  }
}
