import path from 'path'
import fs from 'fs'
import { parse } from 'yaml'
import { Vec3 } from 'vec3'
import sanitizeFilename from 'sanitize-filename'

export type WorldWarp = {
  name: string
  /**
   * @default world
   */
  world?: string
  x: number
  y: number
  z: number
  yaw?: number
  pitch?: number
  lastowner?: string
  /** Not shown in the world & faded in map */
  disabled?: boolean
  color?: string
}

const existsViaStats = async (path: string) => {
  try {
    await fs.promises.stat(path)
    return true
  } catch (e) {
    return false
  }
}

const loadWarps = async (warpsFolder: string, serv: Server) => {
  if (await existsViaStats(warpsFolder)) {
    fs.promises.readdir(warpsFolder).then(async files => {
      const warps = [] as WorldWarp[]
      for (const file of files) {
        if (!file.endsWith('.yml')) continue
        const contents = await fs.promises.readFile(path.join(warpsFolder, file), 'utf8')
        const parsed = parse(contents)
        warps.push(parsed)
      }
      serv.warps = warps
      serv.emit('warpsLoaded')
    })
  }
}

export const server = async function (serv: Server, options: Options) {
  serv.warps = []

  const { worldFolder } = options
  let warpsFolder = ''
  if (worldFolder) {
    warpsFolder = path.join(worldFolder, 'Warp files')
    loadWarps(warpsFolder, serv)
  }

  serv.setWarp = async (warp: WorldWarp) => {
    if (!serv.warps.find(w => w.name === warp.name)) {
      serv.warps.push(warp)
    }

    // write to fs, ensure dir
    if (!await existsViaStats(warpsFolder)) {
      await fs.promises.mkdir(warpsFolder)
      const fileNameClean = sanitizeFilename(`${warp.name}.yml`)
      await fs.promises.writeFile(path.join(warpsFolder, fileNameClean), `name: ${warp.name}\nworld: ${'world'}\nx: ${warp.x}\ny: ${warp.y}\nz: ${warp.z}\nyaw: ${warp.yaw}\npitch: ${warp.pitch}\nlastowner: ${warp.lastowner}`)
    }
  }

  serv.commands.add({
    base: 'warp',
    info: 'Teleport to a warp',
    usage: '/warp [set] <name>',
    op: true,
    tab: ['warps', 'warps'],
    commandBlock: false,
    parse (string, ctx) {
      // todo worlds support
      if (string.startsWith('set ')) {
        const name = string.slice(4)
        return { name, set: true }
      }
      const warp = serv.warps.find(w => w.name === string)
      if (!warp) return false
      return { name: warp.name }
    },
    async action ({ name, set }, { player }) {
      if (!warpsFolder || !player) return
      if (set) {
        await serv.setWarp({
          name,
          world: player.world === serv.overworld ? 'world' : player.world === serv.netherworld ? 'nether' : 'end',
          x: player.position.x,
          y: player.position.y,
          z: player.position.z,
          yaw: player.yaw,
          pitch: player.pitch,
          lastowner: player.uuid
        })
        return
      }
      const warp = serv.warps.find(w => w.name === name)
      if (!warp) return
      player.teleport(new Vec3(warp.x, warp.y, warp.z))
      if (warp.yaw) player.yaw = warp.yaw
      if (warp.pitch) player.pitch = warp.pitch
      player.chat(`Teleported to ${name}. Press f3+a if nothing appears on your screen.`)
    }
  })

  serv.commands.add({
    base: 'home',
    info: 'Teleport to your home',
    usage: '/home',
    op: false, // todo
    commandBlock: false,
    async action ({ }, { player }) {
      player?.handleCommand('warp home')
    }
  })
  serv.commands.add({
    base: 'sethome',
    info: 'Set your home',
    usage: '/sethome',
    op: false, // todo
    commandBlock: false,
    async action ({ }, { player }) {
      player?.handleCommand('warp set home')
    }
  })

}

declare global {
  interface Server {
    warps: WorldWarp[],
    setWarp: (warp: WorldWarp) => Promise<void>
  }
}

/*
warp yml:
world: world
x: -186.3640491750058
y: 69.0
z: -1181.5200906606556
yaw: 270.91583
pitch: -3.3620992
name: AshfieldCentral
lastowner: 0d33e85d-575d-4247-9f17-f44114d6a426
*/
