module.exports.builtinPlugins = null

const filterKeys = (keys) => {
    if (process.platform === 'browser') keys = keys.filter(k => k !== './external.js')
    keys = keys.filter(k => k !== './index.js' && k !== 'index.js')
    return keys
}

module.exports.initPlugins = () => {
    if (process.platform === 'browser') {
        const isWebpack = !!require.context
        if (isWebpack) {
            const pluginsMap = require.context('./', false, /^(?!.*(?:external.js$)).*\.js$/)
            module.exports.builtinPlugins = filterKeys(pluginsMap.keys()).map(k => [k, pluginsMap(k)])
        } else {
            // esbuild custom plugin
            const files = require(/* webpackIgnore: true */ 'esbuild-import-glob(path:.,skipFiles:index.js,external.js)')
            module.exports.builtinPlugins = Object.entries(files)
        }
    } else {
        // todo use browser field or bundle like valtio does: https://github.com/webpack/webpack/issues/8826#issuecomment-671402668
        const requireIndex = eval('require')('../requireindex')
        const path = eval('require')('path')

        const _plugins = requireIndex(path.join(__dirname, './'))
        module.exports.builtinPlugins = filterKeys(Object.keys(_plugins)).map((k) => [k, _plugins[k]])
    }
}
