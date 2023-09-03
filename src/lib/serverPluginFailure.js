class ServerPluginFailure extends Error {
    name = 'ServerPluginFailure'
    constructor (pluginName, pluginMethod, originalError) {
        super(originalError.message)
        this.pluginName = pluginName
        this.pluginMethod = pluginMethod
        this.stack = originalError.stack
    }
}

module.exports = ServerPluginFailure
