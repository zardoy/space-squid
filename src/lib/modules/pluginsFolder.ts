import path from 'path'
import fs from 'fs'

let loadedPlugins: Record<string, any> = {}

export const player = function (player: Player, serv: Server) {
  for (const plugin of Object.values(loadedPlugins)) {
    plugin.player.call(plugin, player, serv)
  }
}

export const entity = function (entity: Entity, serv: Server) {
  for (const plugin of Object.values(loadedPlugins)) {
    plugin.entity.call(plugin, entity, serv)
  }
}

export const server = async function (serv: Server, settings: Options) {
  loadedPlugins = {}
  if (!settings.pluginsFolder || !settings.worldFolder) return
  let plugins: string[] = []
  try {
    plugins = await fs.promises.readdir(path.join(settings.worldFolder, 'plugins'))
  } catch (err) {
    serv.warn('Skipping plugins folder: cannot find plugins folder')
    return
  }

  for (const plugin of plugins) {
    // match .js but not .disabled.js
    if (plugin.match(/\.(js|mjs)$/) && !plugin.includes('.disabled.')) {
      const pluginName = plugin.split('.').slice(0, -1).join('.')
      const moduleContent = fs.readFileSync(path.join(settings.worldFolder, 'plugins', plugin), 'utf8')
      const module = await loadPlugin(moduleContent)
      loadedPlugins[pluginName] = module
      serv.info(`Loading plugin: ${pluginName}`)
      module.server.call(module, serv, settings)
    }
  }
}

const loadPlugin = (moduleContent: string) => {
  // remove shebang
  moduleContent = moduleContent.replace(/^#!.*\n/, '')
  const blob = new Blob([moduleContent], { type: 'application/javascript' })
  const moduleUrl = URL.createObjectURL(blob)

  return import(/* webpackIgnore: true */ moduleUrl).then(module => {
    URL.revokeObjectURL(moduleUrl)
    return module
  })
}
