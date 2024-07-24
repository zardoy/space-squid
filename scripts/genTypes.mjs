//@ts-check
import fs from 'fs'

const targetFile = './dist/types.d.ts';
const plugins = fs.readdirSync('./dist/lib/modules').filter(f => f !== 'index')
let types = ''
types = plugins.filter(module => module.endsWith('.d.ts')).map(module => `import "./lib/modules/${module}"`).join('\n') + '\n' + types
fs.writeFileSync(targetFile, types, 'utf8')

let indexTs = fs.readFileSync('./dist/index.d.ts', 'utf8')
indexTs = `import './types';` + indexTs
fs.writeFileSync('./dist/index.d.ts', indexTs, 'utf8')

const modules = fs.readdirSync('./dist/lib/modules').filter(f => f !== 'index' && f.endsWith('.js')).map(f => f.replace('.js', ''))
const modulesReqLines = modules.map(m => `'${m}': require('./${m}')`).join(',\n')
const modulesFileJs = `
module.exports = {
    builtinPlugins: {
        ${modulesReqLines}
    }
}
`
fs.writeFileSync('./dist/lib/modules/index.js', modulesFileJs, 'utf8')
