export const server = function (serv: Server, settings: Options) {
  const { plugins: externalPlugins = {} } = settings

  serv.modules ??= {}
  serv.pluginCount = Object.values(serv.modules).length
  serv.externalPluginsLoaded = false

  serv.addPlugin = (name, plugin, set) => {
    if (!name || !plugin) serv.err('Failed to load plugin: Name and object is required')
    serv.plugins[name] = {
      id: serv.pluginCount,
      name,
      player: plugin.player,
      entity: plugin.entity,
      server: plugin.server,
      settings: set,
      enabled: true
    }
    serv.pluginCount++
    if (serv.externalPluginsLoaded && plugin.server) serv.plugins[name].server.call(plugin, serv, settings)
  }

  Object.keys(externalPlugins).forEach((p) => {
    if (externalPlugins[p].disabled) return
    serv.addPlugin(p, module['require'](p), externalPlugins[p])
  })

  serv.on('pluginsReady', () => {
    serv.info(`${serv.pluginCount} plugins loaded`)
  })

  serv.externalPluginsLoaded = true
}

export const player = function (player: Player, serv: Server) {
}

export const entity = function (entity: Entity, serv: Server) {
  entity.pluginData = {}

  Object.keys(serv.modules).forEach(p => {
    entity.pluginData[p] = {}
  })

  entity.getData = (pluginName) => {
    if (typeof pluginName === 'object') pluginName = pluginName.name
    return entity.pluginData[pluginName] || null
  }
}

export type Plugin = {
  id: number
  name: string
  server: any
  player?: any
  entity?: any
  settings: any // todo?
  enabled: boolean // todo support
}

declare global {
  interface Server {
    /** List of all built-in plugins. */
    "modules": Record<string, Plugin>
    plugins: Record<string, Plugin>
    "addPlugin": (name: string, plugin: Plugin, options?: any) => void
    /** @internal */
    "pluginCount": number
    /** @internal */
    "externalPluginsLoaded": boolean
  }
  interface Entity {
    /** @internal */
    'pluginData': {}
    /** Gets object that stores data, personalized per plugin. Returns null if plugin does not exist.
     *
     * Shortcut for: entity.pluginData[pluginName];
     */
    'getData': (pluginName: any) => any
  }
}
