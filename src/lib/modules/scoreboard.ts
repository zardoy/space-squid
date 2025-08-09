import { versionToNumber } from '../../utils'

export interface ScoreboardLine {
  name: string
  value: number
}

export interface Objective {
  name: string
  displayText: string
  scores: Map<string, number>
  _oldLines?: ScoreboardLine[]
}

const SCOREBOARD_ACTIONS = {
  CREATE: 0,
  REMOVE: 1
}

const SCOREBOARD_POSITIONS = {
  LIST: 0,
  SIDEBAR: 1,
  BELOW_NAME: 2
}

export const server = function (serv: Server, options: Options) {
  // Store objectives in server
  serv.objectives ??= {}

  const sendObjectivePacket = (objective: Objective, action: number, players?: any[]) => {
    const formattedText = versionToNumber(options.version) >= versionToNumber('1.13')
      ? JSON.stringify({ text: objective.displayText })
      : objective.displayText

    const packet = {
      name: objective.name,
      action,
      displayText: formattedText
    }

    if (players) {
      serv._writeArray('scoreboard_objective', packet, players)
    } else {
      serv._writeAll('scoreboard_objective', packet)
    }
  }

  const sendScorePacket = (itemName: string, action: number, scoreName: string, value: number, players?: any[]) => {
    const packet = {
      itemName,
      action,
      scoreName,
      value
    }

    if (players) {
      serv._writeArray('scoreboard_score', packet, players)
    } else {
      serv._writeAll('scoreboard_score', packet)
    }
  }

  const sendDisplayPacket = (position: number, name: string, players?: any[]) => {
    const packet = {
      position,
      name
    }

    if (players) {
      serv._writeArray('scoreboard_display_objective', packet, players)
    } else {
      serv._writeAll('scoreboard_display_objective', packet)
    }
  }

  // Send objectives to new players
  serv.on('newPlayer', (player) => {
    Object.values(serv.objectives).forEach((objective) => {
      // Create objective
      sendObjectivePacket(objective, SCOREBOARD_ACTIONS.CREATE, [player])

      // Set display if it's a sidebar objective
      if (objective.name in serv.sidebarObjectives) {
        sendDisplayPacket(SCOREBOARD_POSITIONS.SIDEBAR, objective.name, [player])
      }

      // Set scores
      if (objective._oldLines) {
        objective._oldLines.forEach(line => {
          sendScorePacket(line.name, 0, objective.name, line.value, [player])
        })
      }
    })
  })

  serv['testScoreboard'] = () => {
    // Create scoreboard
    const objective = serv.createSidebarScoreboard('test', '§6§lSome Demo')

    // Update with test data
    const lines = [
      { name: '§7Time elapsed:', value: -1 },
      { name: '§f1:23', value: -2 },
      { name: '§0', value: -3 }, // Empty line
      { name: '§eRound 1:', value: -4 },
      { name: '§fTime left: §a0:37', value: -5 },
      { name: '§0', value: -6 }, // Empty line
      { name: '§6Top Players:', value: -7 },
      { name: '§f1. player1: §6150', value: -8 },
      { name: '§f2. player2: §6120', value: -9 },
      { name: '§f3. player3: §690', value: -10 }
    ]

    serv.updateScoreboard(objective, lines)
  }

  serv.createSidebarScoreboard = (name: string, displayText: string): Objective => {
    const objective: Objective = {
      name,
      displayText,
      scores: new Map<string, number>()
    }

    // Store objective
    serv.objectives[name] = objective
    serv.sidebarObjectives[name] = true

    // Create objective for all players
    sendObjectivePacket(objective, SCOREBOARD_ACTIONS.CREATE)

    // Display in sidebar
    sendDisplayPacket(SCOREBOARD_POSITIONS.SIDEBAR, name)

    return objective
  }

  serv.updateScoreboard = (objective: Objective, newLines: ScoreboardLine[]) => {
    const oldLines = objective._oldLines || []
    const oldLineMap = new Map(oldLines.map(line => [line.name, line.value]))
    const newLineMap = new Map(newLines.map(line => [line.name, line.value]))

    // Remove lines that no longer exist
    oldLines.forEach(({ name, value }) => {
      if (!newLineMap.has(name)) {
        sendScorePacket(name, 1, objective.name, 0) // Remove
      }
    })

    // Add or update lines
    newLines.forEach(({ name, value }) => {
      const oldValue = oldLineMap.get(name)
      // Only send update if line is new or value changed
      if (oldValue === undefined || oldValue !== value) {
        sendScorePacket(name, 0, objective.name, value) // Create/update
      }
    })

    // Update the scores map and store old lines for next comparison
    objective.scores = newLineMap
    objective._oldLines = [...newLines]
  }

  serv.displayScoreboard = (objective: Objective) => {
    sendDisplayPacket(SCOREBOARD_POSITIONS.SIDEBAR, objective.name)
  }

  serv.removeScoreboard = (objective: Objective) => {
    sendObjectivePacket(objective, SCOREBOARD_ACTIONS.REMOVE)
    delete serv.objectives[objective.name]
    delete serv.sidebarObjectives[objective.name]
  }
}

declare global {
  interface Server {
    objectives: Record<string, Objective>
    sidebarObjectives: Record<string, boolean>
    createSidebarScoreboard: (name: string, displayText: string) => Objective
    updateScoreboard: (objective: Objective, lines: ScoreboardLine[]) => void
    displayScoreboard: (objective: Objective) => void
    removeScoreboard: (objective: Objective) => void
  }
}
