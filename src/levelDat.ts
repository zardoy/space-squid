import fs from 'fs'
import { LevelDatWrite } from 'prismarine-provider-anvil/src/level'
import nbtModule from 'prismarine-nbt'
import { promisify } from 'util'
import zlib from 'zlib'

async function write (nbtData) {
  const data: any = await nbtModule.writeUncompressed(nbtData)
  return await promisify(zlib.gzip)(data)
}

export function longArrayToNumber (longArray: number[]) {
  const [high, low] = longArray
  return (high << 32) + low
}

export function longArrayToNumberBigint (longArray: number[]): bigint {
  const [high, low] = longArray
  return (BigInt(high) << 32n) + BigInt(low)
}

export const numberToLongArray = (num: bigint | number): [number, number] => {
  if (typeof num === 'number') num = BigInt(num)
  const high = Number(num >> 32n)
  const low = Number(num & 0xFF_FF_FF_FFn)
  return [high, low]
}

export async function writeLevelDat (path: string, value: LevelDatWrite & { time?: number }, oldLevelRaw?) {
  const nbt = {
    type: 'compound',
    name: '',
    value: {
      Data: {
        type: 'compound',
        value: {
          ...oldLevelRaw?.value?.Data?.value,
          Version: {
            type: 'compound',
            value: {
              Name: {
                type: 'string',
                value: value.Version?.Name
              }
            }
          },
          LevelName: {
            type: 'string',
            value: value.LevelName ?? 'prismarine-world'
          },
          generatorName: {
            type: 'string',
            value: value.generatorName
          },
          version: {
            type: 'int',
            value: 19133
          },
          RandomSeed: {
            type: 'long',
            value: value.RandomSeed
          },
          allowCommands: {
            type: 'byte',
            value: (value.allowCommands ?? true) ? 1 : 0
          },
          DayTime: {
            type: 'long',
            value: numberToLongArray(value.time ?? 0)
          }
        }
      }
    }
  }
  const data = await write(nbt)
  await fs.promises.writeFile(path, data)
}
