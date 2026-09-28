
export const BTCaddress =
  /^(1|3)[1-9a-km-zA-HJ-NP-Z]{32,33}$|^(bc1)[0-9a-z]{39}$|^(bc1)[0-9a-z]{59}$|^(p|q)[0-9a-hj-np-z]{41}$/

export const LTCAddress =
  /^(M|N|L)[1-9a-km-zA-HJ-NP-Z]{32,33}$|^ltc1[0-9a-z]{39}$|^ltc1[0-9a-z]{59}$/

export const ETHaddress = /^(0x)[0-9a-f]{40}$/i
export const TRONaddress = /^T[1-9A-HJ-NP-Za-km-z]{33}$/
export const XRPAddress = /^(r|X)[1-9A-HJ-NP-Za-km-z]{24,35}$/ //使用字母数字字符，不包括数字“0”大写字母“O”，大写字母“I”和小写字母“l”
export const SOLANAAddress = /^[1-9A-HJ-NP-Za-km-z]{43,44}$|^[0-9]{32}$/

export const XRPhash = /^[0-9A-Z]{64}$/
export const ETHhash = /^(0x)[0-9a-f]{64}$/i
export const TRONhash = /^[0-9a-zA-Z]{64}$/
// export const LANTCHhash = /^extest[0-9a-zA-Z]{58}$/
export const BTChash = /^[0-9a-fA-F]{64}$/
export const SOLANAHash = /^[1-9A-HJ-NP-Za-km-z]{86,88}$/


// 返回错误
const txReg = {
  ETH: ETHhash,
  TRON: TRONhash,
  BSC: ETHhash,
  BTC: BTChash,
  POLYGON: ETHhash,
  ARBITRUM: ETHhash,
  OPTIMISM: ETHhash,
  ZKSYNC: ETHhash,
  SOLANA: SOLANAHash,
  AVALANCHE: ETHhash,
  XRP: XRPhash,
  LTC: BTChash,
  BASE: ETHhash
} as const
const addrReg = {
  ETH: ETHaddress,
  TRON: TRONaddress,
  BSC: ETHaddress,
  BTC: BTCaddress,
  POLYGON: ETHaddress,
  ARBITRUM: ETHaddress,
  OPTIMISM: ETHaddress,
  ZKSYNC: ETHaddress,
  SOLANA: SOLANAAddress,
  AVALANCHE: ETHaddress,
  XRP: XRPAddress,
  LTC: LTCAddress,
  BASE: ETHaddress
} as const


/** 指定平台就只按该平台规则校验；未指定或平台未收录时，命中任意一条规则即算有效 */
const matchReg = (regs: Record<string, RegExp>, value: string, platform?: string) => {
  const reg = platform ? regs[platform.toUpperCase()] : undefined
  return reg ? reg.test(value) : Object.values(regs).some((item) => item.test(value))
}

export const isTx = (hash: string, platform?: string) => matchReg(txReg, hash, platform)

export const isAddress = (address: string, platform?: string) =>
  matchReg(addrReg, address, platform)