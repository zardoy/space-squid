import { IndexedData } from 'minecraft-data'
import { RecipeItem } from 'minecraft-data'
import PrismarineItem, { Item } from 'prismarine-item'
import PrismarineWindows, { Window } from 'prismarine-windows'
import { equals } from 'rambda'

export const server = (serv: Server, { version }: Options) => {
  const Item = PrismarineItem(version)
  const windows = PrismarineWindows(version)
  const data = serv.mcData

  serv.once('asap', () => {
    serv.onBlockInteraction(data.blocksByName.crafting_table.name, ({ player, block }) => {
      const window = windows.createWindow(1, 'minecraft:crafting', 'Crafting')
      for (let i = window.inventoryStart; i < window.inventoryEnd; i++) {
        window.slots[i] = player.inventory.slots[i - window.inventoryStart + player.inventory.inventoryStart]
      }
      const updateSlotBackInInventory = (craftingSlot: number, item: Item | null) => {
        // TODO! needs to be fixed!
        if (craftingSlot < window.inventoryStart || craftingSlot > window.inventoryEnd) return
        player.inventory.updateSlot(craftingSlot - window.inventoryStart + player.inventory.inventoryStart, item!)
      }
      player.customWindow = window as any
      // todo refactor to general open container gui method
      // Dynamic window ID feature
      if (player.windowId === undefined) { player.windowId = 1 } else { player.windowId = player.windowId + 1 }
      player._client.write('open_window', {
        windowId: player.windowId,
        inventoryType: window.type,
        windowTitle: serv._createChatComponent('Crafting').toNetworkFormat()
      })
      const sendItems = () => {
        // Sending container content
        player._client.write('window_items', {
          windowId: player.windowId,
          stateId: 1,
          items: window.slots.map(item => Item.toNotch(item)),
          carriedItem: { present: false }
        })
      }
      sendItems()
      let skipUpdate = false
      const updateWindowSlot = (slot: number, item: Item | null) => {
        skipUpdate = true
        window.updateSlot(slot, item!)
        updateSlotBackInInventory(slot, item)
        skipUpdate = false
      }
      //@ts-ignore
      window.on('updateSlot', (oldSlot: number, oldItem: Item | null, newItem: Item | null) => {
        updateSlotBackInInventory(oldSlot, newItem)
        if (oldItem === newItem || skipUpdate) return
        if (oldSlot === 0) { // crafting result slot
          for (let i = 1; i < 10; i++) { // clear all crafting slots
            const count = window.slots[i]?.count
            if (count && count > 1) {
              const slot = window.slots[i]!
              slot.count--
              updateWindowSlot(i, slot)
            } else {
              updateWindowSlot(i, null!)
            }
          }
        }

        const craftingSlots = window.slots.slice(1, 10)
        const result = getResultingRecipe(data, craftingSlots, 3)
        if (result) {
          updateWindowSlot(0, result)
        } else {
          updateWindowSlot(0, null!)
        }
        sendItems()
      })
      return true
    })
  })
}

export const getResultingRecipe = (mcData: IndexedData, slots: Array<Item | null>, gridRows: number) => {
  const PItem = PrismarineItem(mcData.version.minecraftVersion!)

  const inputSlotsItems = slots.map(blockSlot => blockSlot?.type)
  const occupied = inputSlotsItems.flatMap((type, index) => type === undefined ? [] : [index])
  if (occupied.length === 0) return
  const rows = occupied.map(index => Math.floor(index / gridRows))
  const columns = occupied.map(index => index % gridRows)
  const top = Math.min(...rows)
  const bottom = Math.max(...rows)
  const left = Math.min(...columns)
  const right = Math.max(...columns)
  // Trim only the empty border. Gaps inside the recipe must retain their positions.
  const currentShape = Array.from({ length: bottom - top + 1 }, (_, row) =>
    Array.from({ length: right - left + 1 }, (_, column) =>
      inputSlotsItems[(top + row) * gridRows + left + column] ?? null))

  // todo rewrite
  // eslint-disable-next-line @typescript-eslint/require-array-sort-compare
  const slotsIngredients = [...inputSlotsItems].sort().filter(item => item !== undefined)
  type Result = RecipeItem | undefined
  let shapelessResult: Result
  let shapeResult: Result
  outer: for (const [id, recipeVariants] of Object.entries(mcData.recipes)) {
    for (const recipeVariant of recipeVariants) {
      if ('inShape' in recipeVariant && equals(currentShape, recipeVariant.inShape as number[][])) {
        shapeResult = recipeVariant.result!
        break outer
      }
      if ('ingredients' in recipeVariant && equals(slotsIngredients, recipeVariant.ingredients?.sort() as number[])) {
        shapelessResult = recipeVariant.result
        break outer
      }
    }
  }
  const result = shapeResult ?? shapelessResult
  if (!result) return
  const id = typeof result === 'number' ? result : Array.isArray(result) ? result[0] : result.id
  if (!id) return
  const count = (typeof result === 'number' ? undefined : Array.isArray(result) ? result[1] : result.count) ?? 1
  const metadata = typeof result === 'object' && !Array.isArray(result) ? result.metadata : undefined
  const item = new PItem(id, count, metadata)
  return item
}
