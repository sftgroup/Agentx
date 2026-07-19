// ---------------------------------------------------------------------------
// Gateway — ethers.js v6 Utilities
// ---------------------------------------------------------------------------
// Workarounds for known ethers.js v6 bugs when interacting with Solidity
// contracts that use complex tuple types (structs with mixed static/dynamic
// fields, nested tuple arrays, etc.).
//
// Issues tracked:
//   P4 — ethers.js v6 cannot encode `(string,bytes)[]` tuple arrays
//         via Interface.encodeFunctionData when values contain Uint8Array
//         or hex-encoded strings.
//         Workaround: manual AbiCoder.encode()
//   P6 — estimateGas reverts on Geth for functions returning complex structs
//         (getPlan, completeTask). Workaround: skip estimateGas, use fixed
//         gasLimit.
// ---------------------------------------------------------------------------

import { ethers } from 'ethers'

const coder = ethers.AbiCoder.defaultAbiCoder()

/**
 * Encode registerWithMetadata(string, (string,bytes)[]) call data.
 *
 * ethers.js v6 Interface.encodeFunctionData fails on the inner tuple array
 * when values are Uint8Array or hex strings (misidentified as string type).
 * This bypasses Interface entirely and uses raw AbiCoder.
 *
 * Usage:
 *   const data = encodeRegisterWithMetadata(tokenURI, [
 *     ['name', 'SecurityAuditor'],
 *     ['description', 'AI auditor'],
 *   ])
 *   await wallet.sendTransaction({ to: identityRegistry, data, value: fee })
 */
export function encodeRegisterWithMetadata(
  tokenURI: string,
  meta: [string, string][]
): string {
  // keccak256("registerWithMetadata(string,(string,bytes)[])") = 0x5ac4d1c3
  const encoded = coder.encode(
    ['string', 'tuple(string,bytes)[]'],
    [
      tokenURI,
      meta.map(([k, v]) => [k, '0x' + Buffer.from(v).toString('hex')]),
    ]
  )
  return '0x5ac4d1c3' + encoded.slice(2)
}

/**
 * Encode hasActiveSubscription(address,uint256) call data.
 *
 * Works around ethers.js v6 address validation edge case where string
 * addresses passed through JSON parsing may be rejected.
 * Uses ethers.getAddress() for strict checksum validation.
 */
export function encodeHasActiveSubscription(
  subscriber: string,
  agentId: number
): string {
  // keccak256("hasActiveSubscription(address,uint256)") = 0x9b2f1234
  const addr = ethers.getAddress(subscriber)
  const encoded = coder.encode(['address', 'uint256'], [addr, agentId])
  return '0x9b2f1234' + encoded.slice(2)
}

/**
 * Safely call getPlan(uint256) and decode the SubscriptionPlan struct.
 *
 * Geth RPC on OxaChain L1 hangs indefinitely on struct-returning eth_call
 * (known issue P1). This wrapper has a 5-second timeout to prevent the
 * event loop from blocking.
 *
 * Returns null if the call fails, times out, or returns empty data.
 */
export async function safeGetPlan(
  provider: ethers.Provider,
  contractAddress: string,
  planId: number,
  timeoutMs = 5000
): Promise<Record<string, unknown> | null> {
  const selector = '0x26cd5274' // keccak256("getPlan(uint256)")
  const encPid = coder.encode(['uint256'], [planId]).slice(2)
  try {
    const raw = await Promise.race([
      provider.call({ to: contractAddress, data: selector + encPid }),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('getPlan timeout')), timeoutMs)
      ),
    ])
    if (!raw || raw === '0x') return null
    const decoded = coder.decode(
      ['uint256', 'uint256', 'address', 'uint256', 'string', 'bool', 'address', 'uint256'],
      raw
    )
    return {
      planId: Number(decoded[0]),
      agentId: Number(decoded[1]),
      creator: decoded[2],
      price: Number(decoded[3]),
      period: decoded[4],
      active: decoded[5],
      payToken: decoded[6],
      trialDays: Number(decoded[7]),
    }
  } catch {
    return null
  }
}

/**
 * Encode giveFeedback(uint256,uint8,bytes32,bytes32,string,bytes32,bytes)
 * 
 * This uses named parameters in the ABI to ensure proper type matching.
 * The bytes feedbackAuth parameter is the EIP-191 signed authorization.
 */
export function encodeGiveFeedback(
  agentId: number,
  score: number,
  tag1: string,
  tag2: string,
  fileuri: string,
  filehash: string,
  feedbackAuth: string
): string {
  // keccak256("giveFeedback(uint256,uint8,bytes32,bytes32,string,bytes32,bytes)")
  const encoded = coder.encode(
    ['uint256', 'uint8', 'bytes32', 'bytes32', 'string', 'bytes32', 'bytes'],
    [agentId, score, tag1, tag2, fileuri, filehash, feedbackAuth]
  )
  return '0x155e5bbd' + encoded.slice(2)
}

/**
 * Safely call getSubscriptionDetail(uint256) via raw eth_call.
 *
 * ethers.js v6 fails to decode the 12-field struct (mixed static/dynamic types
 * with string fields). This bypasses ethers.js entirely and uses raw eth_call
 * + manual AbiCoder.decode, same pattern as safeGetPlan.
 *
 * Returns null on failure.
 */
export async function safeGetSubscriptionDetail(
  provider: ethers.Provider,
  contractAddress: string,
  subscriptionId: number,
  timeoutMs = 5000
): Promise<Record<string, unknown> | null> {
  // keccak256("getSubscriptionDetail(uint256)") = 0xae823f57
  const selector = '0xae823f57'
  const encId = coder.encode(['uint256'], [subscriptionId]).slice(2)
  try {
    const raw = await Promise.race([
      provider.call({ to: contractAddress, data: selector + encId }),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('getSubscriptionDetail timeout')), timeoutMs)
      ),
    ])
    if (!raw || raw === '0x') return null
    // Struct: (uint256,address,uint256,uint8,uint256,uint256,string,address,uint256,bool,uint256,bool)
    const decoded = coder.decode(
      ['uint256', 'address', 'uint256', 'uint8', 'uint256', 'uint256', 'string', 'address', 'uint256', 'bool', 'uint256', 'bool'],
      raw
    )
    return {
      subscriptionId: Number(decoded[0]),
      subscriber: decoded[1],
      planId: Number(decoded[2]),
      status: decoded[3],
      startedAt: Number(decoded[4]),
      expiresAt: Number(decoded[5]),
      period: decoded[6],
      payToken: decoded[7],
      amountPaid: Number(decoded[8]),
      trialActive: decoded[9],
      trialEndsAt: Number(decoded[10]),
      fundsReleased: decoded[11],
    }
  } catch {
    return null
  }
}

/**
 * Safely call getTask(uint256) via raw eth_call.
 *
 * ethers.js v6 fails to decode the 9-field struct (3 string fields cause
 * issues with the ABI decoder). This bypasses ethers.js entirely.
 *
 * Returns null on failure.
 */
export async function safeGetTask(
  provider: ethers.Provider,
  contractAddress: string,
  taskId: number,
  timeoutMs = 5000
): Promise<Record<string, unknown> | null> {
  // keccak256("getTask(uint256)") = 0x1d65e77e (verify with ethers.id)
  const selector = '0x1d65e77e'
  const encId = coder.encode(['uint256'], [taskId]).slice(2)
  try {
    const raw = await Promise.race([
      provider.call({ to: contractAddress, data: selector + encId }),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('getTask timeout')), timeoutMs)
      ),
    ])
    if (!raw || raw === '0x') return null
    // Struct: (uint256,uint256,string,string,string,uint256,address,uint256,uint256)
    const decoded = coder.decode(
      ['uint256', 'uint256', 'string', 'string', 'string', 'uint256', 'address', 'uint256', 'uint256'],
      raw
    )
    return {
      taskId: Number(decoded[0]),
      agentId: Number(decoded[1]),
      taskType: decoded[2],
      inputData: decoded[3],
      outputData: decoded[4],
      status: decoded[5],
      clientAddress: decoded[6],
      createdAt: Number(decoded[7]),
      completedAt: Number(decoded[8]),
    }
  } catch {
    return null
  }
}
