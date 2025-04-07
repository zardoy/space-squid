//@ts-check
import fs from 'fs'

const patchSource = process.argv.includes('--source');

if (!patchSource) {
    const targetFile = './dist/types.d.ts';
    const plugins = fs.readdirSync('./dist/lib/modules').filter(f => f !== 'index')
    let types = ''
    types = plugins.filter(module => module.endsWith('.d.ts')).map(module => `import "./lib/modules/${module}"`).join('\n') + '\n' + types
    fs.writeFileSync(targetFile, types, 'utf8')

    let indexTs = fs.readFileSync('./dist/index.d.ts', 'utf8')
    indexTs = `import './types';` + indexTs
    fs.writeFileSync('./dist/index.d.ts', indexTs, 'utf8')
}

const modules =
    patchSource
    ? fs.readdirSync('./src/lib/modules').filter(f => f !== 'index.ts' && f.endsWith('.ts')).map(f => f.replace('.ts', ''))
    : fs.readdirSync('./dist/lib/modules').filter(f => f !== 'index.js' && f.endsWith('.js')).map(f => f.replace('.js', ''))
const modulesReqLines = modules.map(m => `'${m}': require('./${m}')`).join(',\n')
const modulesFileJs = `
module.exports = {
    builtinPlugins: {
        ${modulesReqLines}
    }
}
`
const writePath = patchSource ? './src/lib/modules/index.ts' : './dist/lib/modules/index.js'
fs.writeFileSync(writePath, modulesFileJs, 'utf8')

const pluginsFolderPatchFile = './dist/lib/modules/pluginsFolder.js'
const oldPluginsFolder = fs.readFileSync(pluginsFolderPatchFile, 'utf8')
const patchString = 'Promise.resolve(`${moduleUrl}`).then(s => __importStar(require(s)))'
const newPluginsFolder = oldPluginsFolder.replace(patchString, 'import(/* webpackIgnore: true */ `${moduleUrl}`)')
fs.writeFileSync(pluginsFolderPatchFile, newPluginsFolder, 'utf8')
