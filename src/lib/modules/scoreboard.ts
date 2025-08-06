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

export const server = function (serv: Server, options: Options) {
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

    // For 1.13+ use JSON chat format, for older versions use plain text
    const formattedText = versionToNumber(options.version) >= versionToNumber('1.13') ? JSON.stringify({ text: displayText }) : displayText

    // First remove if exists
    serv._writeAll('scoreboard_objective', {
      name,
      action: 1 // Remove
    })

    // Then create
    serv._writeAll('scoreboard_objective', {
      name,
      displayText: formattedText,
      action: 0 // Create
    })

    // Display in sidebar
    serv._writeAll('scoreboard_display_objective', {
      position: 1, // 1 = sidebar
      name
    })

    return objective
  }

  serv.updateScoreboard = (objective: Objective, newLines: ScoreboardLine[]) => {
    const oldLines = objective._oldLines || []
    const oldLineMap = new Map(oldLines.map(line => [line.name, line.value]))
    const newLineMap = new Map(newLines.map(line => [line.name, line.value]))

    // Remove lines that no longer exist
    oldLines.forEach(({ name, value }) => {
      if (!newLineMap.has(name)) {
        serv._writeAll('scoreboard_score', {
          itemName: name,
          action: 1, // Remove
          scoreName: objective.name,
          value: 0
        })
      }
    })

    // Add or update lines
    newLines.forEach(({ name, value }) => {
      const oldValue = oldLineMap.get(name)
      // Only send update if line is new or value changed
      if (oldValue === undefined || oldValue !== value) {
        serv._writeAll('scoreboard_score', {
          itemName: name,
          action: 0, // Create/update
          scoreName: objective.name,
          value
        })
      }
    })

    // Update the scores map and store old lines for next comparison
    objective.scores = newLineMap
    objective._oldLines = [...newLines]
  }

  serv.displayScoreboard = (objective: Objective) => {
    serv._writeAll('scoreboard_display_objective', {
      position: 1, // sidebar
      name: objective.name
    })
  }

  serv.removeScoreboard = (objective: Objective) => {
    serv._writeAll('scoreboard_objective', {
      name: objective.name,
      action: 1 // Remove
    })
  }
}

declare global {
  interface Server {
    createSidebarScoreboard: (name: string, displayText: string) => Objective
    updateScoreboard: (objective: Objective, lines: ScoreboardLine[]) => void
    displayScoreboard: (objective: Objective) => void
    removeScoreboard: (objective: Objective) => void
  }
}
