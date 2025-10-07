import Client from 'bitcoin-core'
import { BITCOIN_RPC_ERROR_CODE } from './constants'

const defaultClientParameters = {
  agentOptions: undefined,
  network: 'regtest',
  port: 18453,
  username: 'regtest-repl',
  password: 'hunter2',
  version: '0.23.0',
  wallet: undefined,
}

const defaultWallet = 'regtest-repl-wallet'

const log = (message: string, ...args: any[]): void => {
  console.log('[REGTEST_CLIENT]', message, ...args)
}

export enum DescriptorType {
  PubkeyHashReceive = 'PubkeyHashReceive',
  ScriptHashReceive = 'ScriptHashReceive',
  TaprootReceive = 'TaprootReceive',
  SegwitReceive = 'SegwitReceive',
  PubkeyHashChange = 'PubkeyHashChange',
  ScriptHashChange = 'ScriptHashChange',
  TaprootChange = 'TaprootChange',
  SegwitChange = 'SegwitChange',
}

const DescriptorFilter = {
  [DescriptorType.PubkeyHashReceive]: /^pkh.*\/0\/\*/,
  [DescriptorType.ScriptHashReceive]: /^sh.*\/0\/\*/,
  [DescriptorType.TaprootReceive]: /^tr.*\/0\/\*/,
  [DescriptorType.SegwitReceive]: /^wpkh.*\/0\/\*/,
  [DescriptorType.PubkeyHashChange]: /^pkh.*\/1\/\*/,
  [DescriptorType.ScriptHashChange]: /^sh.*\/1\/\*/,
  [DescriptorType.TaprootChange]: /^tr.*\/1\/\*/,
  [DescriptorType.SegwitChange]: /^wpkh.*\/1\/\*/,
}

/*
 * This component extends and simplifies the Client component from the bitcoin-core NPM package.
 * to use, create a new instance of RegtestClient and call initialize() on it.
 *
 * you may optionally specify a wallet name which will be created for you if it does not exist.
 *
 * initialize will perform the necessary steps to ensure that the client connection is established
 * and the wallet is funded.
 */
export default class RegtestClient extends Client {
  constructor({ wallet = defaultWallet } = {}) {
    super({ ...defaultClientParameters, wallet })
  }

  async initialize(): Promise<void> {
    let shouldCreateWallet = true
    try {
      const walletInfo = await this.getWalletInfo()
      shouldCreateWallet = false
      log('using existing wallet:', walletInfo.walletname)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      if (!/^Requested wallet does not exist or is not loaded$/.test(e.message)) {
        throw e
      }
    }

    if (shouldCreateWallet) {
      log('wallet does not exist, creating:', this.wallet)
      await this.createWallet({
        wallet_name: this.wallet,
        avoid_reuse: false,
        descriptors: true,
        load_on_startup: true,
      })
    }

    // unavailable from npm package until my PR is merged or I publish my own package:
    // https://github.com/ruimarinho/bitcoin-core/pull/151
    //

    const recv = await this.getDescriptor(DescriptorType.SegwitReceive)
    log('using segwit receive descriptor:', recv)

    const chg = await this.getDescriptor(DescriptorType.SegwitChange)
    log('using segwit change descriptor:', chg)

    let balance = await this.getBalance()
    log('wallet balance:', balance)

    if (balance === 0) {
      const address = await this.getNewAddress({ address_type: 'bech32' })
      log('wallet needs funds for spending. generating 101 blocks to wallet address:', address)
      await this.generateToAddress({
        nblocks: 101,
        address,
      })
      balance = await this.getBalance()
      log(`new wallet balance: ${balance}. more funds will be available with each new block mined.`)
    }
  }

  async ensureEstimateSmartFee(): Promise<void> {
    const address = await this.getNewAddress({ address_type: 'bech32' })

    const generateTransactions = async (address: string, numTransactions?: number) => {
      const transactions = numTransactions ?? Math.floor(Math.random() * 10)
      log(`simulating ${transactions} transaction${transactions === 1 ? '' : 's'} in this block`)
      for (let i = 0; i < transactions; i++) {
        const amount = Math.random().toFixed(8)
        log(`creating transaction sending amount ${amount}`)

        try {
          await this.sendToAddress(address, amount)
        } catch (e: any) {
          if (e.code === BITCOIN_RPC_ERROR_CODE.INSUFFICIENT_FUNDS) {
            log('insufficient funds to continue sending to address, mining a block')
            await this.mineBlocks(1)
            continue
          }
          log('unknown error sending to address', JSON.stringify(e))
          return
        }
      }
    }

    let feeRate: number | undefined
    do {
      const fee = await this.estimateSmartFee(1)
      if (fee.errors) {
        log('could not estimate fee', fee.errors)
        log('generating some transactions to increase tx history')
        await generateTransactions(address, 10)
        await this.mineBlocks(1)
        continue
      }
      feeRate = Number(fee.feerate)
    } while (!feeRate || Number.isNaN(feeRate))
  }

  async getDescriptor(type: DescriptorType): Promise<string | undefined> {
    const descriptors = (await this.listDescriptors()).descriptors
    return descriptors.find((descriptor: any) => {
      return DescriptorFilter[type].test(descriptor.desc)
    })?.desc
  }

  async sendToAddressAndConfirm(address: string, amountInBtc: number): Promise<void> {
    if (!this.wallet) {
      throw new Error('client not initialized')
    }

    await this.sendToAddress(address, amountInBtc)
    const clientWalletAddress = await this.getNewAddress({
      address_type: 'bech32',
    })
    await this.generateToAddress({
      nblocks: 1,
      address: clientWalletAddress,
    })
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }

  async mineBlocks(nblocks: number): Promise<void> {
    if (!this.wallet) {
      throw new Error('client not initialized')
    }

    const clientWalletAddress = await this.getNewAddress({
      address_type: 'bech32',
    })
    const ret = await this.generateToAddress({
      nblocks,
      address: clientWalletAddress,
    })
    log(`mined ${nblocks} blocks`, ret)
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
}
