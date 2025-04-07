export const server = (serv: Server, { version }: Options) => {
  serv.once('pluginsReady', () => {
    serv.onItemPlace('written_book', ({ item, player, placedPosition }) => {
      player.chat('Books are not implemented yet!')
      // TODO open
    })
  })
}
