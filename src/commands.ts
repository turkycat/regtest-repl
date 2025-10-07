import { Command } from 'commander'
import url from 'url'
import { readdirSync } from 'fs'
import path from 'path'

export const traverseSubDir = async (cli: Command, dirName: string) => {
  // Walk the src/cmd/*.cmd.ts files and call setup
  const setupDirectory = url.fileURLToPath(new URL(dirName, import.meta.url))
  const files = readdirSync(setupDirectory)
  const setupFiles = files.filter((file) => file.endsWith('.cmd.ts'))
  // Calling setup() for each cmd/*.cmd.ts file
  for (const file of setupFiles) {
    const filePath = path.join(setupDirectory, file)
    const setupModule = await import(filePath)
    if (typeof setupModule.setup === 'function') {
      await setupModule.setup(cli)
    }
  }
}

export const enumerateCommands = async () => {
  const program = new Command()
  program
    .exitOverride()
    .configureOutput({
      writeErr: (str) => console.error(str),
      writeOut: (str) => console.log(str),
    })
    .description('An interactive repl for managing a regtest bitcoin network')
    .version('1.0.0')

  // simple lifecycle commands
  program
    .command('help [command]')
    .description('Show available commands')
    .helpGroup('System Commands:')
    .action((command) => {
      if (command) {
        const subCommand = program.commands.find((cmd) => cmd.name() === command)
        if (subCommand) {
          subCommand.help()
        } else {
          console.error(`Unknown command: ${command}`)
          program.help()
        }
      } else {
        program.help()
      }
    })

  program
    .command('exit')
    .alias('quit')
    .description('Exit the repl')
    .helpGroup('System Commands:')
    .action(() => {
      process.exit(0)
    })

  await traverseSubDir(program, 'commands')

  return program
}
