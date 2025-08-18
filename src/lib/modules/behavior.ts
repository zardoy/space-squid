import Behavior, { CustomEventEmitter, BehaviorCallFunction } from '../behavior'

export const server = function (serv: Server) {
  serv.behavior = Behavior(serv as unknown as CustomEventEmitter)
}

export const entity = function (entity) {
  entity.behavior = Behavior(entity)
}
declare global {
  interface Server {
    behavior: ReturnType<typeof Behavior>
  }
  interface Entity {
    behavior: ReturnType<typeof Behavior>
  }
  interface Player {
    behavior: BehaviorCallFunction<{ [K in keyof PlayerBehaviorInputMap]: PlayerBehaviorInputMap[K] }>
  }
}
