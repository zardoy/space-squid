module.exports = class CircularBuffer {
  constructor(size) {
    this.size = size
    this.buffer = new Array(size)
    this.index = 0
    this.length = 0
  }

  // Add a packet to the buffer
  add(element) {
    this.buffer[this.index] = element
    this.index = (this.index + 1) % this.size
    if (this.length < this.size) {
      this.length++
    }
  }

  // Get the last 'n' packets
  getLastElements(n = this.size) {
    const elements = []
    let currentIndex = this.index

    for (let i = 0; i < Math.min(n, this.length); i++) {
      currentIndex = (this.size + currentIndex - 1) % this.size
      elements.unshift(this.buffer[currentIndex])
    }

    return elements
  }
}
