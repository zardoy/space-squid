//@ts-check
import fs from 'fs'

const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
delete packageJson.scripts.prepare
fs.writeFileSync('package.json', JSON.stringify(packageJson, undefined, 2), 'utf8')
