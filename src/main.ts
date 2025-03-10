import { createMCServer } from './'
import WebsocketServer from './wsServer'

const settings = {
  "motd": "A Minecraft Server \nRunning flying-squid",
  "max-players": 20,
  "online-mode": false,
  "logging": true,
  "gameMode": 1,
  "difficulty": 1,
  "worldFolder": "world",
  "generation": {
    "name": "diamond_square",
    "options": {
      "worldHeight": 80
    }
  },
  "kickTimeout": 10000,
  "plugins": {

  },
  "modpe": false,
  "view-distance": 10,
  "player-list-text": {
    "header": { "text": "Flying squid" },
    "footer": { "text": "Test server" }
  },
  "everybody-op": false,
  "max-entities": 100,
}


const server = createMCServer({
  ...settings,
  version: '1.20.4',
  port: 25565,
  //@ts-ignore
  keepAlive: false,
  "max-players": 40,
  //@ts-ignore
  Server: WebsocketServer
})
