import { Block } from 'prismarine-block'


export const server = function (serv: Server) {
  serv.getCommandBlockData = (commandBlock: Block) => {
    const pos = commandBlock.position
    const key = `${pos.x},${pos.y},${pos.z}`
    let entity = serv.overworld.blockEntityData[key]
    entity = entity?.value ?? entity
    if (!entity) return
    return Object.keys(entity).reduce((acc, key) => {
      acc[key] = entity[key].value
      return acc
    }, {} as any)
  }
}

declare global {
  interface Server {
    getCommandBlockData: (commandBlock: Block) => {
      Command: string
      LastOutput: string
      TrackOutput: Number
      SuccessCount: number
      CustomName: string
      powered: boolean
      conditionMet: boolean
      UpdateLastExecution?: boolean
      LastExecution?: number
      // color: string
    } | undefined
  }
}
