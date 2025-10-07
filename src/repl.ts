import RegtestClient from './util/regtest.client'
import { generateKey, getAddress, getMsAddress, keysToDescriptor, keyToDescriptor, mnemonicToKey } from './util/bitcoin'
import { BITCOIN_RPC_ERROR_CODE, ONE_SECOND } from './util/constants'
import { ensureDockerStack } from './util/container'
import readline from 'readline'

const DEFAULT_WALLET_MNEMONIC1 = 'ghost ghost ghost ghost ghost ghost ghost ghost ghost ghost ghost machine'
const DEFAULT_WALLET_MNEMONIC2 = 'keen keen keen keen keen keen keen keen keen keen keen join'
const DEFAULT_WALLET_MNEMONIC3 = 'coffee coffee coffee coffee coffee coffee coffee coffee coffee coffee coffee blast'

const client = new RegtestClient()

function log(message: string, ...args: any): void {
  console.log('[REPL]', message, ...args)
}
function logSeparator(): void {
  log('-------------------------------------------------------')
}

async function simulateBlock(address: string, numTransactions?: number): Promise<void> {
  const transactions = numTransactions ?? Math.floor(Math.random() * 10)
  log(`simulating ${transactions} transaction${transactions === 1 ? '' : 's'} in this block`)

  for (let i = 0; i < transactions; i++) {
    const amount = Math.random().toFixed(8)
    log(`creating transaction sending amount ${amount}`)

    try {
      await client.sendToAddress(address, amount)
    } catch (e: any) {
      if (e.code === BITCOIN_RPC_ERROR_CODE.INSUFFICIENT_FUNDS) {
        log('insufficient funds to continue sending to address, mining a block')
        await client.mineBlocks(1)
        continue
      }
      log('unknown error sending to address', JSON.stringify(e))
      return
    }
  }
  log(`mining a block`)
  await client.mineBlocks(1)
}

async function main() {
  logSeparator()
  log('initializing network...')
  logSeparator()
  await ensureDockerStack()

  await client.initialize()
  const info = await client.getBlockchainInfo()
  log('blockchain info', info)
  logSeparator()

  const sinkAddress = getAddress(generateKey(), '0/0')

  // check if this network has enough tx history to estimatesmartfee
  // this depends on both the number of transactions and the number of blocks
  log('checking if network has enough tx history to estimate fees')
  logSeparator()
  let feeRate: number | undefined
  do {
    const fee = await client.estimateSmartFee(1)
    if (fee.errors) {
      log('could not estimate fee', fee.errors)
      log('generating some transactions to increase tx history')
      await simulateBlock(sinkAddress, 10)
      continue
    }
    feeRate = Number(fee.feerate)
  } while (!feeRate || Number.isNaN(feeRate))
  log('estimated fee:', feeRate)
  log('network initialization finished')
  logSeparator()

  // create a couple wallets
  log('creating a couple wallets for convenience...')
  logSeparator()
  const ssfKey = mnemonicToKey(DEFAULT_WALLET_MNEMONIC1)
  const ssfPub = keyToDescriptor(ssfKey)
  const ssfPrv = keyToDescriptor(ssfKey, { pub: false })
  log(`STATIC funded singlesig wallet mnemonic: '${DEFAULT_WALLET_MNEMONIC1}'`)
  log('STATIC funded singlesig wallet descriptor (public):')
  log(ssfPub)
  log('STATIC funded singlesig wallet descriptor (private):')
  log(ssfPrv)
  const ssfPubMultipath = ssfPub.replaceAll('/0/*', '/<0;1>/*')
  const ssfPrvMultipath = ssfPrv.replaceAll('/0/*', '/<0;1>/*')
  log('STATIC funded singlesig wallet descriptor (public, multipath):')
  log(ssfPubMultipath)
  log('STATIC funded singlesig wallet descriptor (private, multipath):')
  log(ssfPrvMultipath)
  const ssfReceiveAddress = await getAddress(ssfKey, '0/0')
  const ssfChangeAddress = await getAddress(ssfKey, '1/0')
  log('STATIC funded singlesig wallet receive address', ssfReceiveAddress)
  log('STATIC funded singlesig wallet change address', ssfChangeAddress)
  await client.sendToAddress(ssfReceiveAddress, 10)
  await client.sendToAddress(ssfChangeAddress, 3)
  logSeparator()

  const msfMnemonics = [DEFAULT_WALLET_MNEMONIC1, DEFAULT_WALLET_MNEMONIC2, DEFAULT_WALLET_MNEMONIC3]
  const msfKey2 = mnemonicToKey(msfMnemonics[1])
  const msfKey3 = mnemonicToKey(msfMnemonics[2])
  const msfKeys = [ssfKey, msfKey2, msfKey3]
  const msfPub = keysToDescriptor(msfKeys)
  const msfPrv = keysToDescriptor(msfKeys, { pub: false })
  log(`STATIC funded multisig wallet mnemonics: [\n${msfMnemonics.map((m) => `  '${m}'`).join(',\n')}\n]`)
  log('STATIC funded multisig wallet descriptor (public):')
  log(msfPub)
  log('STATIC funded multisig wallet descriptor (private):')
  log(msfPrv)
  const msfPubMultipath = msfPub.replaceAll('/0/*', '/<0;1>/*')
  const msfPrvMultipath = msfPrv.replaceAll('/0/*', '/<0;1>/*')
  log('STATIC funded multisig wallet descriptor (public, multipath):')
  log(msfPubMultipath)
  log('STATIC funded multisig wallet descriptor (private, multipath):')
  log(msfPrvMultipath)
  const msfReceiveAddress = await getMsAddress(msfKeys, '0/0')
  const msfChangeAddress3 = await getMsAddress(msfKeys, '1/0')
  log('STATIC funded multisig wallet receive address')
  log(msfReceiveAddress)
  log('STATIC funded multisig wallet change address')
  log(msfChangeAddress3)
  await client.sendToAddress(msfReceiveAddress, 10)
  await client.sendToAddressAndConfirm(msfChangeAddress3, 7)
  logSeparator()

  const ssuKey = generateKey()
  const ssuPub = keyToDescriptor(ssuKey)
  const ssuPrv = keyToDescriptor(ssuKey, { pub: false })
  log('unfunded wallet descriptor (public):')
  log(ssuPub)
  log('unfunded wallet descriptor (private):')
  log(ssuPrv)
  const ssuAddress = await getAddress(ssuKey, '0/0')
  log('unfunded wallet address', ssuAddress)
  logSeparator()
  logSeparator()
  log('                  ~~ NETWORK READY ~~')
  logSeparator()
  logSeparator()

  // simulate network activity
  log('starting network activity simulation...')
  logSeparator()
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  while (true) {
    await new Promise<string>((resolve) => {
      rl.question('Press enter to mine a block', resolve)
    })
    await simulateBlock(sinkAddress)
    logSeparator()
  }
}

main()
