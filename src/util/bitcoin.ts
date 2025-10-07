import * as bitcoin from 'bitcoinjs-lib'
// import bitcoin, { networks } from 'bitcoinjs-lib'
import { BIP32Factory } from 'bip32'
import * as ecc from 'tiny-secp256k1'
const bip32 = BIP32Factory(ecc)
import * as bip39 from 'bip39'

const DERIVATION_PATH_BIP84_PRIME = "m/84'/1'/0'"
const DERIVATION_PATH_WPKH_H = DERIVATION_PATH_BIP84_PRIME.replace(/'/g, 'h')
const DERIVATION_PATH_BIP48_PRIME = "m/48'/1'/0'/2'"
const DERIVATION_PATH_BIP48_H = DERIVATION_PATH_BIP48_PRIME.replace(/'/g, 'h')

export type Key = {
  master: {
    fingerprint: string
    tprv: string
  }
  derived: {
    path: string
    tprv: string
    tpub: string
  }
}

type KeyOptions = {
  path?: string
}

export function mnemonicToKey(mnemonic: string, options?: KeyOptions): Key {
  const path = options?.path ?? DERIVATION_PATH_BIP84_PRIME
  const master = bip32.fromSeed(bip39.mnemonicToSeedSync(mnemonic), bitcoin.networks.regtest)
  const derived = master.derivePath(path)
  return {
    master: {
      fingerprint: master.fingerprint.toString('hex'),
      tprv: master.toBase58(),
    },
    derived: {
      path,
      tprv: derived.toBase58(),
      tpub: derived.neutered().toBase58(),
    },
  }
}

export function xprvToKey(xprv: string, options?: KeyOptions): Key {
  const path = options?.path ?? DERIVATION_PATH_BIP84_PRIME
  const master = bip32.fromBase58(xprv, bitcoin.networks.regtest)
  const derived = master.derivePath(path)
  return {
    master: {
      fingerprint: master.fingerprint.toString('hex'),
      tprv: master.toBase58(),
    },
    derived: {
      path,
      tprv: derived.toBase58(),
      tpub: derived.neutered().toBase58(),
    },
  }
}

export const generateKey = (options?: KeyOptions): Key => {
  const path = options?.path ?? DERIVATION_PATH_BIP84_PRIME
  // this should go without saying, but dont use this for a real wallet ya dingus
  const seed = bitcoin.crypto.sha256(Buffer.from(Math.random().toString()))
  const master = bip32.fromSeed(seed, bitcoin.networks.regtest)
  const derived = master.derivePath(path)
  return {
    master: {
      fingerprint: master.fingerprint.toString('hex'),
      tprv: master.toBase58(),
    },
    derived: {
      path,
      tprv: derived.toBase58(),
      tpub: derived.neutered().toBase58(),
    },
  }
}

export const getAddress = (key: Key, path?: string): string => {
  const pub = bip32.fromBase58(key.derived.tpub, bitcoin.networks.regtest)
  const dpub = path ? pub.derivePath(path) : pub
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: dpub.publicKey,
    network: bitcoin.networks.regtest,
  })
  return address!
}

export const getMsAddress = (keys: Key[], path?: string): string => {
  const rdkeys = rederiveKeys(keys, DERIVATION_PATH_BIP48_PRIME)
  const pubs = rdkeys.map((key) => bip32.fromBase58(key.derived.tpub, bitcoin.networks.regtest))
  const dpubs = path ? pubs.map((pub) => pub.derivePath(path)) : pubs
  const { address } = bitcoin.payments.p2wsh({
    redeem: bitcoin.payments.p2ms({
      m: dpubs.length - 1,
      pubkeys: dpubs.map((dpub) => dpub.publicKey),
      network: bitcoin.networks.regtest,
    }),
    network: bitcoin.networks.regtest,
  })
  return address!
}

type DescriptorOptions = {
  prefixPath?: string
  postfixPath?: string
  pub?: boolean
}

export const keyToDescriptor = (key: Key, options?: DescriptorOptions): string => {
  const prefixPath = options?.prefixPath ?? DERIVATION_PATH_BIP84_PRIME
  const postfixPath = options?.postfixPath ?? '/0/*'
  const pub = options?.pub ?? true

  const meta = prefixPath ? prefixPath.replace(/^m/, key.master.fingerprint) : key.master.fingerprint
  return `wpkh([${meta}]${pub ? key.derived.tpub : key.derived.tprv}${postfixPath})`
}

type MultisigDescriptorOptions = DescriptorOptions & {
  quorum?: number
  sorted?: boolean
}

export const keysToDescriptor = (keys: Key[], options?: MultisigDescriptorOptions): string => {
  const prefixPath = options?.prefixPath ?? DERIVATION_PATH_BIP48_PRIME
  const postfixPath = options?.postfixPath ?? '/0/*'
  const pub = options?.pub ?? true
  const quorum = (options?.quorum ?? keys.length <= 1) ? keys.length : keys.length - 1
  const sorted = options?.sorted ?? false

  const rederivedKeys = rederiveKeys(keys, prefixPath)
  return `wsh(${sorted ? 'sortedmulti' : 'multi'}(${quorum},${rederivedKeys
    .map((key) => {
      const meta = prefixPath ? prefixPath.replace(/^m/, key.master.fingerprint) : key.master.fingerprint
      return `[${meta}]${pub ? key.derived.tpub : key.derived.tprv}${postfixPath}`
    })
    .join(',')}))`
}

export const rederiveKey = (key: Key, path: string): Key => {
  if (key.derived.path === path) return key

  const master = bip32.fromBase58(key.master.tprv, bitcoin.networks.regtest)
  const derived = master.derivePath(path)
  return {
    master: {
      fingerprint: master.fingerprint.toString('hex'),
      tprv: master.toBase58(),
    },
    derived: {
      path,
      tprv: derived.toBase58(),
      tpub: derived.neutered().toBase58(),
    },
  }
}

export const rederiveKeys = (keys: Key[], path: string): Key[] => {
  return keys.map((key) => rederiveKey(key, path))
}

export const signAllInputs = (key: Key, psbt: string) => {
  const psbtObj = bitcoin.Psbt.fromBase64(psbt)
  psbtObj.signAllInputsHD(bip32.fromBase58(key.master.tprv, bitcoin.networks.regtest))
  return psbtObj.toBase64()
}
