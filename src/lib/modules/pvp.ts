import { Vec3 } from 'vec3'

import chalk from 'chalk'
import UserError from '../user_error'

const MAX_ATTACK_DISTANCE = 4 // Maximum reach in blocks
const ATTACK_COOLDOWN_MS = 250 // Minimum time between attacks
const DEFAULT_KNOCKBACK = new Vec3(0, 0.4, 0) // Base vertical knockback
const KNOCKBACK_MULTIPLIER = 8 // Horizontal knockback scaling

export const player = function (player: Player, serv: Server) {
  let lastAttackTime = 0

  function attackEntity (entityId) {
    const attackedEntity = serv.entities[entityId]
    const attackedPlayer = attackedEntity.type === 'player' ? attackedEntity as Player : undefined
    if (!attackedEntity) return
    if (attackedPlayer && (attackedPlayer.gameMode === 1 || attackedPlayer.gameMode === 3 || attackedPlayer.invincible)) return

    // Anti-cheat: Distance check
    const distance = player.position.distanceTo(attackedEntity.position)
    if (distance > MAX_ATTACK_DISTANCE) {
      return // Silently fail suspicious attacks
    }

    // Rate limiting
    const now = Date.now()
    if (now - lastAttackTime < ATTACK_COOLDOWN_MS) return
    lastAttackTime = now

    // Calculate knockback direction and strength
    const knockbackDir = attackedEntity.position.minus(player.position).normalize()
    const velocity = DEFAULT_KNOCKBACK.plus(knockbackDir.scaled(KNOCKBACK_MULTIPLIER))

    player.behavior('attack', {
      attackedEntity,
      velocity
    }, (o) => o.attackedEntity.takeDamage(o))
  }

  player._client.on('use_entity', ({ mouse, target } = {}) => {
    if (!serv.entities[target]) {
      let dragon = target - 1
      while (dragon >= target - 7 && !serv.entities[dragon]) {
        dragon--
      }
      if (serv.entities[dragon] && serv.entities[dragon].entityType === 63) { target = dragon }
    }
    if (mouse === 1) { attackEntity(target) }
  })
}

export const entity = function (entity: Entity, serv: Server) {
  entity.invincible = false

  entity.takeDamage = ({ sound = 'game.player.hurt', damage = 1, velocity = new Vec3(0, 0, 0), maxVelocity = new Vec3(4, 4, 4), animation = true }) => {
    if (entity.invincible) return
    entity.updateHealth(entity.health - damage)
    serv.playSound(sound, entity.world, entity.position)

    // Track last damage time for anti-cheat movement checks
    if (entity.type === 'player') {
      (entity as Player).lastDamageTime = Date.now()
    }

    entity.sendVelocity(velocity, maxVelocity)

    if (entity.health <= 0) {
      if (animation) {
        entity._writeOthers('entity_status', {
          entityId: entity.id,
          entityStatus: 3
        })
      }
      if (entity.type !== 'player') { delete serv.entities[entity.id] }
    } else if (animation) {
      entity._writeOthers('animation', {
        entityId: entity.id,
        animation: 1
      })
    }
  }
  entity.kill = (options = {}) => {
    entity.takeDamage({ damage: entity.health, ...options })
  }

  if (entity.type !== 'player') {
    entity.updateHealth = (health) => {
      entity.health = health
    }
  }
}

export const server = function (serv: Server) {
  serv.commands.add({
    base: 'kill',
    info: 'Kill entities',
    usage: '/kill <selector>|<player>',
    tab: ['player'],
    op: true,
    parse (str) {
      return str || false
    },
    action (sel, ctx) {
      if (sel !== '') {
        if (serv.getPlayer(sel) !== null) {
          serv.getPlayer(sel).kill()
          serv.info(`Killed ${chalk.bold(sel)}`)
        } else {
          const arr = serv.selectorString(sel)
          if (arr.length === 0) throw new UserError('Could not find player')
          arr.forEach(entity => {
            entity.kill()
            serv.info(`Killed ${chalk.bold(entity.type === 'player' ? (entity as Player).username : entity.name ?? '<unknown>')}`)
          })
        }
      } else {
        if (ctx.player) ctx.player.kill()
        else serv.err('Can\'t kill console')
      }
    }
  })

  serv.commands.add({
    base: 'damage',
    info: 'Applies damage to the specified entities',
    usage: '/damage',
    tab: ['player', 'number'],
    op: true,
    parse (string, ctx) {
      return string.split(' ') // todo validate
    },
    action (data, ctx) {
      const players = serv.getPlayers(data[0], ctx.player)
      for (const player of players) {
        player.takeDamage({ damage: +data[1], })
      }
    },
  })
}
declare global {
  interface Player {
    /** Timestamp of last damage taken, used for movement anti-cheat */
    lastDamageTime?: number
  }

  interface Entity {
    /** Whether the entity is invincible to all damage */
    invincible: boolean
    /** How many half-hearts an entity has of health (e.g. Player has 20). Not really used for objects, only players and mobs. */
    health: number
    /** @internal */
    updateHealth: (health: number) => void
    /** * sound: Sound to play (default is game.player.hurt)
     * * damage: Damage to deal (default is based off player's weapon, player's potions, attackEntity's potions, and attackedEntity armor)
     * * velocity: Which way should attackedEntity move when hit
     * * maxVelocity: maxVelocity from consecutive hits
     * * animation: Play death/hit animation
     */
    'takeDamage': ({ sound, damage, velocity, maxVelocity, animation }: { sound?: string | undefined, damage?: number | undefined, velocity?: any, maxVelocity?: any, animation?: boolean | undefined }) => void
    /** @internal */
    "kill": (options?: {}) => void
  }

  interface PlayerBehaviorInputMap {
    'attack': {
      _input: {
        attackedEntity: Entity
        velocity: Vec3

        sound?: string
        damage?: number
        maxVelocity?: Vec3
        animation?: boolean
      }
    }
  }
}
