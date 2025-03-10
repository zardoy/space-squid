import { build } from 'esbuild'
import fs from 'fs'

build({
  entryPoints: ['dist/main.js'],
  platform: 'node',
  bundle: true,
  minify: true,
  outfile: 'out.js',
  sourcemap: true,
  logLevel: 'info',
  external: [
    'minecraft-data',
  ],
  plugins: [
    {
      name: 'minecraft-data-patch',
      setup (build) {
        build.onResolve({ filter: /^\.\/app\.js$/ }, args => {
          if (args.importer.includes('minecraft-data')) {
            return {
              path: args.path,
              namespace: 'minecraft-data-patch'
            }
          }
        })

        build.onLoad({ filter: /.*/, namespace: 'minecraft-data-patch' }, () => {
          const originalFile = fs.readFileSync('node_modules/minecraft-data/index.js', 'utf8')
          return {
            contents: 'module.exports = require("minecraft-data")',
            loader: 'js'
          }
        })
      }
    }
  ],
})
