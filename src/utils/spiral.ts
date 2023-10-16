export function generateSpiralMatrix(distance: number): [number, number][] {
  const n = distance * 2 + 1
  if (n <= 0) {
    return []
  }

  const matrix: [number, number][] = []
  let x = 0
  let y = 0
  let dx = 0
  let dy = -1

  for (let i = 0; i < n * n; i++) {
    if (Math.abs(x) <= n / 2 && Math.abs(y) <= n / 2) {
      matrix.push([x, y])
    }

    if (x === y || (x < 0 && x === -y) || (x > 0 && x === 1 - y)) {
      const temp = dx
      dx = -dy
      dy = temp
    }

    x += dx
    y += dy
  }

  return matrix
}
