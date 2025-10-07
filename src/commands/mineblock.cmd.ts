import { Command } from 'commander'
import RegtestClient from '../util/regtest.client'

const client = new RegtestClient()

export const setup = (command: Command) => {
  command
    .command('mineblock')
    .description('Mine a block')
    .action(async () => {
      await client.mineBlocks(1)
    })
}
