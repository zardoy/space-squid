import { versionToNumber } from '../../utils'

export interface BossBar {
  uuid: string
  title: string
  health: number
  color: BossBarColor
  dividers: BossBarDividers
  flags: BossBarFlags
  players?: Player[]
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

export const server = function (serv: Server, options: Options) {
  serv['testBossBar'] = () => {
    // Create test boss bar
    const bossBar = serv.createBossBar(
      'test',
      `${serv.color.red}${serv.color.bold}Boss Battle`,
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
        title: `${serv.color.red}${serv.color.bold}Boss Battle ${serv.color.gray}(${Math.round(health * 100)}%)`
      })
    }, 1000)
  }

  serv.createBossBar = (
    uuid: string | undefined,
    title: string,
    health: number = 1.0,
    color: BossBarColor = BossBarColor.BLUE,
    dividers: BossBarDividers = BossBarDividers.NOTCHES_10,
    flags: BossBarFlags = BossBarFlags.NONE,
    players?: Player[]
  ): BossBar => {
    const randomUuid = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)

    const bossBar: BossBar = {
      uuid: uuid ?? randomUuid(),
      title,
      health,
      color,
      dividers,
      flags,
      players
    }

    // For 1.13+ use JSON chat format, for older versions use plain text
    const formattedTitle = versionToNumber(options.version) >= versionToNumber('1.13')
      ? JSON.stringify({ text: title })
      : title

    // Create boss bar
    serv._writeArray('boss_bar', {
      entityUUID: bossBar.uuid,
      action: 0, // Add
      title: formattedTitle,
      health,
      color,
      dividers,
      flags
    }, players ?? serv.players)

    return bossBar
  }

  serv.updateBossBar = (bossBar: BossBar, updates: Partial<BossBar>) => {
    // Update local state
    Object.assign(bossBar, updates)

    // For 1.13+ use JSON chat format, for older versions use plain text
    const formattedTitle = updates.title && versionToNumber(options.version) >= versionToNumber('1.13')
      ? JSON.stringify({ text: updates.title })
      : updates.title

    const players = bossBar.players ?? serv.players

    if (updates.title) {
      serv._writeArray('boss_bar', {
        entityUUID: bossBar.uuid,
        action: 3, // Update title
        title: formattedTitle
      }, players)
    }

    if (updates.health !== undefined) {
      serv._writeArray('boss_bar', {
        entityUUID: bossBar.uuid,
        action: 2, // Update health
        health: updates.health
      }, players)
    }

    if (updates.color !== undefined || updates.dividers !== undefined) {
      serv._writeArray('boss_bar', {
        entityUUID: bossBar.uuid,
        action: 4, // Update style
        color: updates.color ?? bossBar.color,
        dividers: updates.dividers ?? bossBar.dividers
      }, players)
    }

    if (updates.flags !== undefined) {
      serv._writeArray('boss_bar', {
        entityUUID: bossBar.uuid,
        action: 5, // Update flags
        flags: updates.flags
      }, players)
    }
  }

  serv.removeBossBar = (bossBar: BossBar) => {
    serv._writeArray('boss_bar', {
      entityUUID: bossBar.uuid,
      action: 1 // Remove
    }, bossBar.players ?? serv.players)
  }
}

declare global {
  interface Server {
    createBossBar: (
      uuid: string | undefined,
      title: string,
      health?: number,
      color?: BossBarColor,
      dividers?: BossBarDividers,
      flags?: BossBarFlags,
      players?: Player[]
    ) => BossBar
    updateBossBar: (bossBar: BossBar, updates: Partial<BossBar>) => void
    removeBossBar: (bossBar: BossBar) => void
  }
}
