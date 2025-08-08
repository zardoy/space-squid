import express from 'express'
import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import { networkInterfaces } from 'os'
import { join } from 'path'
import type { ResourcePackConfig } from './modules/resourcePack'

const getPublicIp = () => {
  const nets = networkInterfaces()
  const results: string[] = []

  for (const name of Object.keys(nets)) {
    const interfaces = nets[name]
    for (const net of interfaces ?? []) {
      // Skip internal and non-IPv4 addresses
      if (!net.internal && net.family === 'IPv4') {
        results.push(net.address)
      }
    }
  }

  // Prefer non-local IPs
  const publicIp = results.find(ip => !ip.startsWith('192.168.') && !ip.startsWith('10.'))
  return publicIp || results[0] || 'localhost'
}

const findAvailablePort = async (startPort: number = 8080): Promise<number> => {
  const net = await import('net')

  const isPortAvailable = (port: number): Promise<boolean> => {
    return new Promise((resolve) => {
      const server = net.createServer()
      server.once('error', () => resolve(false))
      server.once('listening', () => {
        server.close()
        resolve(true)
      })
      server.listen(port)
    })
  }

  let port = startPort
  while (!(await isPortAvailable(port))) {
    port++
  }
  return port
}

export const serveWithExpress = async (
  resourcePackPath: string,
  config?: {
    port?: number
    host?: string
    force?: boolean
    promptMessage?: string
  }
): Promise<ResourcePackConfig> => {
  const app = express()
  const port = config?.port || await findAvailablePort()
  const host = config?.host || getPublicIp()

  // Read and hash the resource pack file
  const resourcePackData = await readFile(resourcePackPath)
  const hash = createHash('sha1').update(resourcePackData).digest('hex')

  // Serve the resource pack file
  app.get('/resource-pack', (req, res) => {
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', 'attachment; filename="resource-pack.zip"')
    res.send(resourcePackData)
  })

  // Start the server
  await new Promise<void>((resolve) => {
    app.listen(port, () => {
      console.log(`Resource pack server listening at http://${host}:${port}/resource-pack`)
      resolve()
    })
  })

  return {
    url: `http://${host}:${port}/resource-pack`,
    hash,
    force: config?.force,
    promptMessage: config?.promptMessage
  }
}
