export { generateSpiralMatrix } from './spiral'

export class ViewRect {
  x0: number
  x1: number
  z0: number
  z1: number

  constructor(cx: number, cz: number, viewDistance: number) {
    this.x0 = cx - viewDistance
    this.x1 = cx + viewDistance
    this.z0 = cz - viewDistance
    this.z1 = cz + viewDistance
  }

  contains (x, z) {
    return this.x0 <= x && x <= this.x1 && this.z0 <= z && z <= this.z1
  }
}


export const versionToNumber = (ver: string) => {
  const [x, y = '0', z = '0'] = ver.split('.')
  return +`${x.padStart(2, '0')}${(parseInt(y).toString().padStart(2, '0'))}${parseInt(z).toString().padStart(2, '0')}`
}
