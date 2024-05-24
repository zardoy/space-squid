import BlockLoader, { Block } from 'prismarine-block'
import minecraftAssets from 'minecraft-assets'
import mcData, { IndexedData } from 'minecraft-data'

// IMPLEMENTATION

type Element = [from: [number, number, number], to: [number, number, number]]

class AssetsParser {
    stateIdToElements: Record<string, Element[] | 1> = {} // 1 is a special case for full blocks
    assets: McAssets
    mcData: IndexedData
    Block: typeof Block

    constructor(public version: string, data: IndexedData | null, blockClass: null | typeof Block) {
        this.assets = minecraftAssets(version)
        this.mcData = data ?? mcData(version)
        this.Block = blockClass ?? BlockLoader(version)
    }

    getElements (stateId: number) {
        if (this.stateIdToElements[stateId]) return this.stateIdToElements[stateId]

        const state = this.mcData.blocksByStateId[stateId]
        if (!state) return 0

        const result = this.resolveElements(stateId)
        const final = result === 0 ? [] : result
        this.stateIdToElements[stateId] = final
        return final
    }

    resolveElements (stateId: number) {
        function parseProperties (properties) {
            if (typeof properties === 'object') { return properties }

            const json = {}
            for (const prop of properties.split(',')) {
                const [key, value] = prop.split('=')
                json[key] = value
            }
            return json
        }

        function matchProperties (block: Block, /* to match against */properties: string | (Record<string, string | boolean> & { OR })) {
            if (!properties) { return true }

            if (typeof properties === 'string') {
                properties = parseProperties(properties) as Record<string, string | boolean> & { OR }
            }
            const blockProps = block.getProperties()
            if (properties.OR) {
                return properties.OR.some((or) => matchProperties(block, or))
            }
            for (const prop in blockProps) {
                if (properties[prop] === undefined) continue // unknown property, ignore
                if (typeof properties[prop] !== 'string') properties[prop] = String(properties[prop])
                if (!(properties[prop] as string).split('|').some((value) => value === String(blockProps[prop]))) {
                    return false
                }
            }
            return true
        }

        const block = this.Block.fromStateId(stateId, 0)
        const blockName = block.name
        const states = this.assets.blocksStates[blockName]?.variants
        if (!states) return 0
        let state = states['']
        for (const key in states) {
            if (key === '') continue
            if (matchProperties(block, key)) {
                state = states[key]
                break
            }
        }
        if (!state) return 0
        const normalizeModelName = (model: string) => model.replace(/^(minecraft:)?(block\/)?/, '')
        // const model = Array.isArray(state) ? state[Math.floor(Math.random() * state.length)] : state
        const model = normalizeModelName((Array.isArray(state) ? state[0] : state).model)
        const modelData = this.assets.blocksModels[model]
        if (!modelData) return 0
        // let textures = {} as Record<string, string>
        let elements = [] as Element[]
        const resolveModel = (model: BlockModel) => {
            if (model.elements) {
                elements.push(...model.elements.map(({ from, to }) => [from, to] as Element))
            }

            if (model.parent) {
                const parent = this.assets.blocksModels[normalizeModelName(model.parent)]
                if (!parent) return
                resolveModel(parent)
            }
            return model
        }
        resolveModel(modelData)
        return elements.length === 1 && arrEq(elements[0][0], [0, 0, 0]) && arrEq(elements[0][1], [16, 16, 16]) ? 1 : elements
    }
}

const arrEq = <T> (a: T[], b: T[]) => !!a && !!b && a.length === b.length && a.every((v, i) => v === b[i])

// DEMO

const parser = new AssetsParser('1.17.1', null, null)

console.log(parser.getElements(parser.mcData.blocksByName['anvil'].minStateId!))

/*
[
  [ [ 2, 0, 2 ], [ 14, 4, 14 ] ],
  [ [ 4, 4, 3 ], [ 12, 5, 13 ] ],
  [ [ 6, 5, 4 ], [ 10, 10, 12 ] ],
  [ [ 3, 10, 0 ], [ 13, 16, 16 ] ]
]
*/

// TYPES

type ModelBasic = {
    model: string
    x?: number
    y?: number
    uvlock?: boolean
}

type BlockApplyModel = ModelBasic | (ModelBasic & { weight })[]

type BlockStateCondition = {
    [name: string]: string | number
}

type BlockState = {
    variants?: {
        [name: string | ""]: BlockApplyModel
    }
    multipart?: {
        when: {
            [name: string]: string | number
        } & {
            OR?: BlockStateCondition[]
        }
        apply: BlockApplyModel
    }[]
}

type BlockModel = {
    parent?: string
    textures?: {
        [name: string]: string
    }
    elements?: {
        from: number[]
        to: number[]
        faces: {
            [name: string]: {
                texture: string
                uv?: number[]
                cullface?: string
            }
        }
    }[]
    ambientocclusion?: boolean
    x?: number
    y?: number
    z?: number
    ao?: boolean
}

type McAssets = {
    blocksStates: {
        [x: string]: BlockState
    }
    blocksModels: {
        [x: string]: BlockModel
    }
    directory: string
    version: string
}
