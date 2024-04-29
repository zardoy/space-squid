function generation ({ version, minY, worldHeight }) {
  const Chunk = require('prismarine-chunk')(version)
  return () => new Chunk({minY, worldHeight})
}

module.exports = generation
