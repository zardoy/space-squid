import itemBlockRenames from './itemBlockRenames.json'

// postflatenning
// todo regen 1.13 the flatenning data

const versionToNumber = (ver: string) => {
  const [x, y = '0', z = '0'] = ver.split('.')
  return +`${x.padStart(2, '0')}${y.padStart(2, '0')}${z.padStart(2, '0')}`
}

const allRenamesMapFromLatest = Object.fromEntries(
  ['blocks', 'items'].map(x =>
    [
      x,
      Object.fromEntries(Object.entries(itemBlockRenames).flatMap(([ver, t]) => t[x].map(([oldName, newName]) => [
        newName,
        { version: versionToNumber(ver), oldName }
      ])))
    ])
) as { [thing: string]: Record<string, { version: number, oldName: string }> }

export const adoptBlockOrItemNamesFromLatest = (type: 'blocks' | 'items', version: string, names: string[]) => {
  const map = allRenamesMapFromLatest[type]
  const ver = versionToNumber(version)
  return names.map(name => {
    const renamed = map[name] // todo it might be useful if followed by chain
    if (renamed && ver < renamed.version) {
      return renamed.oldName
    }
    return name
  })
}
