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
  useTeams?: boolean
  _teams?: Set<string>
  _fakePlayers?: Map<string, string> // Maps line name to fake player name
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

const TEAM_MODES = {
  CREATE: 0,
  REMOVE: 1,
  UPDATE: 2,
  ADD_PLAYERS: 3,
  REMOVE_PLAYERS: 4
}

export const server = function (serv: Server, options: Options) {
  // Store objectives in server
  serv.objectives ??= {}
  serv.sidebarObjectives ??= {}

  // Generate a unique player name for scoreboard line
  const generateFakePlayer = (index: number) => {
    // Use formatting codes to make unique invisible names
    return `§r§e§s§${index}§r`
  }

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

  const sendTeamPacket = (team: string, mode: number, options: any = {}, players?: any[]) => {
    const packet = {
      team,
      mode,
      name: JSON.stringify({ text: "", extra: [{ text: team }] }),
      friendlyFire: 0,
      nameTagVisibility: "always",
      collisionRule: "always",
      formatting: 21,
      prefix: options.prefix ? JSON.stringify({
        text: "",
        extra: Array.isArray(options.prefix) ? options.prefix : [{ text: options.prefix }]
      }) : JSON.stringify({ text: "" }),
      suffix: options.suffix ? JSON.stringify({
        text: "",
        extra: Array.isArray(options.suffix) ? options.suffix : [{ text: options.suffix }]
      }) : JSON.stringify({ text: "" }),
      players: options.players || []
    }

    if (players) {
      serv._writeArray('teams', packet, players)
    } else {
      serv._writeAll('teams', packet)
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

  serv.createSidebarScoreboard = (name: string, displayText: string, useTeams = false): Objective => {
    const objective: Objective = {
      name,
      displayText,
      scores: new Map<string, number>(),
      useTeams,
      _teams: new Set<string>(),
      _fakePlayers: new Map<string, string>()
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

  /**
   * Update a scoreboard objective. Accepts either an array of `{ name, value }` or an array of strings.
   * When strings are provided, values are automatically assigned from -1 and decreasing.
   */
  serv.updateScoreboard = (objective: Objective, newLines: ScoreboardLine[] | string[]) => {
    // Normalize lines: if strings are provided, convert them to ScoreboardLine with descending negative scores starting at -1
    const normalizedLines: ScoreboardLine[] = Array.isArray(newLines) && typeof newLines[0] === 'string'
      ? (newLines as string[]).map((name, index) => ({ name, value: -1 - index }))
      : (newLines as ScoreboardLine[])

    const oldLines = objective._oldLines || []
    const oldLineMap = new Map(oldLines.map(line => [line.name, line.value]))
    const newLineMap = new Map(normalizedLines.map(line => [line.name, line.value]))

    if (objective.useTeams) {
      // Handle team mode updates
      const oldTeams = objective._teams || new Set<string>()
      const newTeams = new Set<string>()
      const fakePlayers = objective._fakePlayers!

      // Remove old teams that are no longer used
      oldTeams.forEach(team => {
        if (!normalizedLines.some(line => line.name === team)) {
          sendTeamPacket(team, TEAM_MODES.REMOVE)
          // Remove score for the fake player
          const fakePlayer = fakePlayers.get(team)
          if (fakePlayer) {
            sendScorePacket(fakePlayer, 1, objective.name, 0)
            fakePlayers.delete(team)
          }
        }
      })

      // Create/update teams and scores
      normalizedLines.forEach((line, index) => {
        const teamName = line.name
        newTeams.add(teamName)

        // Get or create fake player name
        let fakePlayer = fakePlayers.get(teamName)
        if (!fakePlayer) {
          fakePlayer = generateFakePlayer(index)
          fakePlayers.set(teamName, fakePlayer)
        }

        if (!oldTeams.has(teamName)) {
          // Create new team
          sendTeamPacket(teamName, TEAM_MODES.CREATE, {
            prefix: line.name,
            // suffix: line.suffix,
            players: [fakePlayer]
          })
          // Set initial score
          sendScorePacket(fakePlayer, 0, objective.name, line.value)
        } else {
          // Update team if prefix/suffix changed
          if (line.name) {
            sendTeamPacket(teamName, TEAM_MODES.UPDATE, {
              prefix: line.name,
              // suffix: line.suffix,
            })
          }
          // Update score if changed
          const oldValue = oldLineMap.get(teamName)
          if (oldValue === undefined || oldValue !== line.value) {
            sendScorePacket(fakePlayer, 0, objective.name, line.value)
          }
        }
      })

      objective._teams = newTeams
    } else {
      // Handle regular score mode updates
      // Remove lines that no longer exist
      oldLines.forEach(({ name }) => {
        if (!newLineMap.has(name)) {
          sendScorePacket(name, 1, objective.name, 0) // Remove
        }
      })

      // Add or update lines
      normalizedLines.forEach(({ name, value }) => {
        const oldValue = oldLineMap.get(name)
        // Only send update if line is new or value changed
        if (oldValue === undefined || oldValue !== value) {
          sendScorePacket(name, 0, objective.name, value) // Create/update
        }
      })
    }

    // Update the scores map and store old lines for next comparison
    objective.scores = newLineMap
    objective._oldLines = [...normalizedLines]
  }

  serv.displayScoreboard = (objective: Objective) => {
    sendDisplayPacket(SCOREBOARD_POSITIONS.SIDEBAR, objective.name)
  }

  serv.removeScoreboard = (objective: Objective) => {
    sendObjectivePacket(objective, SCOREBOARD_ACTIONS.REMOVE)

    // Clean up teams and fake players if using team mode
    if (objective.useTeams && objective._teams && objective._fakePlayers) {
      objective._teams.forEach(team => {
        sendTeamPacket(team, TEAM_MODES.REMOVE)
        // Remove score for the fake player
        const fakePlayer = objective._fakePlayers!.get(team)
        if (fakePlayer) {
          sendScorePacket(fakePlayer, 1, objective.name, 0)
        }
      })
    }

    delete serv.objectives[objective.name]
    delete serv.sidebarObjectives[objective.name]
  }
}

declare global {
  interface Server {
    objectives: Record<string, Objective>
    sidebarObjectives: Record<string, boolean>
    createSidebarScoreboard: (name: string, displayText: string, useTeams?: boolean) => Objective
    updateScoreboard: (objective: Objective, lines: ScoreboardLine[] | string[]) => void
    displayScoreboard: (objective: Objective) => void
    removeScoreboard: (objective: Objective) => void
  }
}
