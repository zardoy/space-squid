module.exports.builtinPlugins = null

const filterKeys = (keys) => {
    if (process.platform === 'browser') keys = keys.filter(k => k !== './external.js')
    keys = keys.filter(k => k !== './index.js' && k !== 'index.js')
    return keys
}

module.exports.initPlugins = () => {
    try {
        const pluginsMap = require.context('./', false, /^(?!.*(?:external.js$)).*\.js$/)
        module.exports.builtinPlugins = filterKeys(pluginsMap.keys()).map(k => pluginsMap(k))
    } catch (err) {
        // todo use browser field or bundle like valtio does: https://github.com/webpack/webpack/issues/8826#issuecomment-671402668
        const requireIndex = eval('require')('../requireindex')
        const path = eval('require')('path')

        const _plugins = requireIndex(path.join(__dirname, './'))
        module.exports.builtinPlugins = filterKeys(Object.keys(_plugins)).map(k => _plugins[k])
    }
}
