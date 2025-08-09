import { versionToNumber } from '../../utils'

export interface BossBar {
  uuid: string
  title: string
  health: number
  color: BossBarColor
  dividers: BossBarDividers
  flags: BossBarFlags
}

export enum BossBarColor {
  PINK = 0,
  BLUE = 1,
  RED = 2,
  GREEN = 3,
  YELLOW = 4,
  PURPLE = 5,
  WHITE = 6
}

export enum BossBarDividers {
  NONE = 0,
  NOTCHES_6 = 1,
  NOTCHES_10 = 2,
  NOTCHES_12 = 3,
  NOTCHES_20 = 4
}

export enum BossBarFlags {
  NONE = 0,
  DARKEN_SKY = 1,
  DRAGON_BAR = 2,
  CREATE_FOG = 4
}

const BOSS_BAR_ACTIONS = {
  ADD: 0,
  REMOVE: 1,
  UPDATE_HEALTH: 2,
  UPDATE_TITLE: 3,
  UPDATE_STYLE: 4,
  UPDATE_FLAGS: 5
}

export const server = function (serv: Server, options: Options) {
  // Store boss bars in server
  serv.bossBars = {}

  const sendBossBarPacket = (bossBar: BossBar, action: number, players?: any[], additionalData: any = {}) => {
    const formattedTitle = versionToNumber(options.version) >= versionToNumber('1.13')
      ? JSON.stringify({ text: bossBar.title })
      : bossBar.title

    const packet = {
      entityUUID: bossBar.uuid,
      action,
      title: formattedTitle,
      health: bossBar.health,
      color: bossBar.color,
      dividers: bossBar.dividers,
      flags: bossBar.flags,
      ...additionalData
    }

    if (players) {
      serv._writeArray('boss_bar', packet, players)
    } else {
      serv._writeAll('boss_bar', packet)
    }
  }

  // Send boss bars to new players
  serv.on('newPlayer', (player) => {
    Object.values(serv.bossBars).forEach((bossBar) => {
      sendBossBarPacket(bossBar, BOSS_BAR_ACTIONS.ADD, [player])
    })
  })

  serv['testBossbar'] = () => {
    // Create test boss bar
    const bossBar = serv.createBossBar(
      undefined,
      '§4§lBoss Battle',
      1.0,
      BossBarColor.RED,
      BossBarDividers.NOTCHES_10,
      BossBarFlags.NONE
    )

    // Update health over time
    let health = 1.0
    const interval = setInterval(() => {
      health -= 0.1
      if (health <= 0) {
        clearInterval(interval)
        serv.removeBossBar(bossBar)
        return
      }
      serv.updateBossBar(bossBar, {
        health,
        title: `§4§lBoss Battle §7(${Math.round(health * 100)}%)`
      })
    }, 1000)
  }

  serv.createBossBar = (
    uuid: string | undefined,
    title: string,
    health: number = 1.0,
    color: BossBarColor = BossBarColor.BLUE,
    dividers: BossBarDividers = BossBarDividers.NOTCHES_10,
    flags: BossBarFlags = BossBarFlags.NONE
  ): BossBar => {
    const randomUuid = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    const finalUuid = uuid ?? randomUuid()

    const bossBar: BossBar = {
      uuid: finalUuid,
      title,
      health,
      color,
      dividers,
      flags
    }

    // Store boss bar
    serv.bossBars[finalUuid] = bossBar

    // Create boss bar for all players
    sendBossBarPacket(bossBar, 0)

    return bossBar
  }

  serv.updateBossBar = (bossBar: BossBar, updates: Partial<BossBar>) => {
    // Update local state
    Object.assign(bossBar, updates)
    Object.assign(serv.bossBars[bossBar.uuid], updates)

    const players = serv.players

    if (updates.title) {
      sendBossBarPacket(bossBar, BOSS_BAR_ACTIONS.UPDATE_TITLE, players, {
        title: versionToNumber(options.version) >= versionToNumber('1.13')
          ? JSON.stringify({ text: updates.title })
          : updates.title
      })
    }

    if (updates.health !== undefined) {
      sendBossBarPacket(bossBar, BOSS_BAR_ACTIONS.UPDATE_HEALTH, players, { health: updates.health })
    }

    if (updates.color !== undefined || updates.dividers !== undefined) {
      sendBossBarPacket(bossBar, BOSS_BAR_ACTIONS.UPDATE_STYLE, players, {
        color: updates.color ?? bossBar.color,
        dividers: updates.dividers ?? bossBar.dividers
      })
    }

    if (updates.flags !== undefined) {
      sendBossBarPacket(bossBar, BOSS_BAR_ACTIONS.UPDATE_FLAGS, players, { flags: updates.flags })
    }
  }

  serv.removeBossBar = (bossBar: BossBar) => {
    sendBossBarPacket(bossBar, BOSS_BAR_ACTIONS.REMOVE)
    delete serv.bossBars[bossBar.uuid]
  }
}

declare global {
  interface Server {
    bossBars: Record<string, BossBar>
    createBossBar: (
      uuid: string | undefined,
      title: string,
      health?: number,
      color?: BossBarColor,
      dividers?: BossBarDividers,
      flags?: BossBarFlags
    ) => BossBar
    updateBossBar: (bossBar: BossBar, updates: Partial<BossBar>) => void
    removeBossBar: (bossBar: BossBar) => void
  }
}
