// consider bringing in pino or something

export const log = (message: string, ...args: any): void => {
  console.log('[REPL]', message, ...args)
}
export const logSeparator = (): void => {
  log('-------------------------------------------------------')
}
