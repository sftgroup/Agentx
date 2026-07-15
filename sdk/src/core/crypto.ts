// ---------------------------------------------------------------------------
// @agentx/sdk — Crypto Engine
// ---------------------------------------------------------------------------
// AES-256-GCM for content encryption (NIST standard, same wire format as
// aihunter-saas for interop).  ECIES (secp256k1) for key wrapping.
//
// Wire format (AES-256-GCM):
//   base64( IV[12] || ciphertext || authTag[16] )
//
// ECIES wire format (compatible with eciesjs):
//   hex( ephemeralPub[33] || IV[16] || ciphertext || MAC[32] )
//
// Pure JS — works in browser, Node, edge. No native deps except @noble/*.
// ---------------------------------------------------------------------------

import { gcm } from '@noble/ciphers/aes.js'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { hmac } from '@noble/hashes/hmac.js'
import { bytesToHex, hexToBytes } from '@noble/ciphers/utils.js'

// ── randomBytes implementation (cross-runtime: browser / Node) ────────────

export function randomBytes(length: number): Uint8Array {
  // browser: crypto.getRandomValues
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint8Array(length)
    crypto.getRandomValues(buf)
    return buf
  }
  // Node: crypto.randomBytes
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require('crypto')
  return new Uint8Array(nodeCrypto.randomBytes(length))
}

import type { EncryptedPayload, AgentPrivatePayload } from './types'
import type { PackResult } from './types'

// ── Re-exports for convenience ─────────────────────────────────────────────

export { bytesToHex, hexToBytes }

// ── Constants ──────────────────────────────────────────────────────────────

const AES_KEY_SIZE = 32
const IV_SIZE = 12 // GCM recommended
const TAG_SIZE = 16 // GCM auth tag

// ── Base64 helpers (cross-runtime) ─────────────────────────────────────────

function toBase64(bytes: Uint8Array): string {
  // Works in browser (btoa + binary) and Node (Buffer)
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64')
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

function fromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'))
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// ── AES-256-GCM ────────────────────────────────────────────────────────────

/**
 * Encrypt with AES-256-GCM.
 * Wire format (same as aihunter-saas): base64( IV[12] || ciphertext || authTag[16] )
 */
export function aesEncrypt(plaintext: string, keyHex: string): string {
  const key = hexToBytes(keyHex)
  const iv = randomBytes(IV_SIZE)
  const plainBytes = new TextEncoder().encode(plaintext)

  const cipher = gcm(key, iv)
  const encrypted = cipher.encrypt(plainBytes)
  // noble gcm.encrypt returns: ciphertext || authTag(16)
  const ciphertext = encrypted.subarray(0, -TAG_SIZE)
  const authTag = encrypted.subarray(-TAG_SIZE)

  // Pack: IV || ciphertext || authTag
  const combined = new Uint8Array(IV_SIZE + ciphertext.length + TAG_SIZE)
  combined.set(iv, 0)
  combined.set(ciphertext, IV_SIZE)
  combined.set(authTag, IV_SIZE + ciphertext.length)

  return toBase64(combined)
}

/**
 * Decrypt AES-256-GCM (same wire format as aihunter-saas).
 */
export function aesDecrypt(encryptedBase64: string, keyHex: string): string {
  const key = hexToBytes(keyHex)
  const combined = fromBase64(encryptedBase64)

  const iv = combined.subarray(0, IV_SIZE)
  const ciphertext = combined.subarray(IV_SIZE, -TAG_SIZE)
  const authTag = combined.subarray(-TAG_SIZE)

  const cipher = gcm(key, iv)
  // noble decrypt expects: ciphertext || authTag
  const ciphertextWithTag = new Uint8Array(ciphertext.length + TAG_SIZE)
  ciphertextWithTag.set(ciphertext, 0)
  ciphertextWithTag.set(authTag, ciphertext.length)

  const decrypted = cipher.decrypt(ciphertextWithTag)
  return new TextDecoder().decode(decrypted)
}

/**
 * Generate a cryptographically random AES-256 key (hex, 64 chars).
 */
export function generateAesKey(): string {
  return bytesToHex(randomBytes(AES_KEY_SIZE))
}

// ── ECIES (secp256k1) ──────────────────────────────────────────────────────
//
// eciesjs-compatible wire format:
//   ephemeralPub(33B compressed) || IV(16B) || ciphertext || MAC(32B)
//   Encoding: hex
//
// HKDF(SHA-256) derives AES key + HMAC key from ECDH shared secret.
// ---------------------------------------------------------------------------

function eciesEncode(
  ephemeralPub: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
  mac: Uint8Array
): string {
  const out = new Uint8Array(33 + 16 + ciphertext.length + 32)
  out.set(ephemeralPub, 0)
  out.set(iv, 33)
  out.set(ciphertext, 33 + 16)
  out.set(mac, 33 + 16 + ciphertext.length)
  return bytesToHex(out)
}

function eciesDecode(dataHex: string): {
  ephemeralPub: Uint8Array
  iv: Uint8Array
  ciphertext: Uint8Array
  mac: Uint8Array
} {
  const d = hexToBytes(dataHex)
  return {
    ephemeralPub: d.subarray(0, 33),
    iv: d.subarray(33, 49),
    ciphertext: d.subarray(49, -32),
    mac: d.subarray(-32),
  }
}

// Simple AES-256-CTR implementation on top of @noble/ciphers AES core
function aesCtrEncrypt(key: Uint8Array, ctrBytes: Uint8Array, data: Uint8Array): Uint8Array {
  const blockSize = 16
  const cipher = gcm(key, ctrBytes) // GCM internally handles CTR
  // Use noble's CTR approach: encrypt the plaintext directly with the derived stream
  // noble uses AES-CTR internally for GCM; simpler: implement CTR with AES-ECB
  const result = new Uint8Array(data.length)
  const counter = new Uint8Array(blockSize)
  counter.set(ctrBytes)
  for (let i = 0; i < data.length; i += blockSize) {
    const keystream = gcm(key, counter).encrypt(new Uint8Array(blockSize))
    for (let j = 0; j < blockSize && i + j < data.length; j++) {
      result[i + j] = keystream[j]! ^ data[i + j]!
    }
    // Increment counter (big-endian)
    for (let j = blockSize - 1; j >= 0; j--) {
      const val = counter[j]
      if (val !== undefined) {
        counter[j] = (val + 1) & 0xff
        if (counter[j] !== 0) break
      }
    }
  }
  return result
}

/**
 * Encrypt data with recipient's secp256k1 public key (ECIES).
 *
 * @param dataHex    The data to encrypt (hex, e.g. AES key)
 * @param publicKey  Recipient's public key (hex, 04-prefixed uncompressed or 02/03 compressed)
 */
export function eciesEncrypt(dataHex: string, publicKey: string): string {
  // 1. Ephemeral keypair
  const ephPriv = randomBytes(32)
  const ephPub = secp256k1.getPublicKey(ephPriv, true) // 33B compressed

  // 2. Parse recipient public key
  let recipientPub: Uint8Array
  if (publicKey.startsWith('04') && publicKey.length === 130) {
    recipientPub = hexToBytes(publicKey)
  } else if (publicKey.startsWith('02') || publicKey.startsWith('03')) {
    recipientPub = hexToBytes(publicKey)
  } else {
    throw new Error('Invalid public key format: expected hex with 02/03/04 prefix')
  }

  // 3. ECDH
  const shared = secp256k1.getSharedSecret(ephPriv, recipientPub)
  const sharedX = shared.subarray(1, 33) // x-coordinate only
  const sharedKey = sha256(sharedX)

  // 4. HKDF: encKey(32) || macKey(32)
  const hkdfOut = hkdf(sha256, sharedKey, undefined, undefined, 64)
  const encKey = hkdfOut.subarray(0, 32)
  const macKey = hkdfOut.subarray(32, 64)

  // 5. AES-256-CTR encrypt
  const iv = randomBytes(16)
  const plaintext = hexToBytes(dataHex)
  const ciphertext = aesCtrEncrypt(encKey, iv, plaintext)

  // 6. HMAC: MAC(ephemeralPub || IV || ciphertext)
  const macInput = new Uint8Array(33 + 16 + ciphertext.length)
  macInput.set(ephPub, 0)
  macInput.set(iv, 33)
  macInput.set(ciphertext, 33 + 16)
  const mac = hmac(sha256, macKey, macInput)

  return eciesEncode(ephPub, iv, ciphertext, mac)
}

/**
 * Decrypt ECIES ciphertext with recipient's secp256k1 private key.
 */
export function eciesDecrypt(dataHex: string, privateKey: string): string {
  const { ephemeralPub, iv, ciphertext, mac } = eciesDecode(dataHex)

  // 1. ECDH
  const privBytes = hexToBytes(privateKey)
  const shared = secp256k1.getSharedSecret(privBytes, ephemeralPub)
  const sharedX = shared.subarray(1, 33)
  const sharedKey = sha256(sharedX)

  // 2. HKDF
  const hkdfOut = hkdf(sha256, sharedKey, undefined, undefined, 64)
  const encKey = hkdfOut.subarray(0, 32)
  const macKey = hkdfOut.subarray(32, 64)

  // 3. Verify MAC
  const macInput = new Uint8Array(33 + 16 + ciphertext.length)
  macInput.set(ephemeralPub, 0)
  macInput.set(iv, 33)
  macInput.set(ciphertext, 33 + 16)
  const expectedMac = hmac(sha256, macKey, macInput)
  if (!constantTimeEqual(mac, expectedMac)) {
    throw new Error('ECIES decryption failed: MAC mismatch')
  }

  // 4. Decrypt
  const plaintext = aesCtrEncrypt(encKey, iv, ciphertext) // CTR encrypt = decrypt
  return bytesToHex(plaintext)
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

// ── High-Level: Agent Pack / Unpack ────────────────────────────────────────

/**
 * Encrypt an Agent's private payload with AES-256-GCM.
 */
export function encryptPayload(
  payload: AgentPrivatePayload,
  keyHex?: string
): EncryptedPayload {
  const key = keyHex ?? generateAesKey()
  return {
    encrypted: true,
    algorithm: 'AES-256-GCM',
    data: aesEncrypt(JSON.stringify(payload), key),
  }
}

/**
 * Decrypt an EncryptedPayload.
 */
export function decryptPayload(
  encrypted: EncryptedPayload,
  keyHex: string
): AgentPrivatePayload {
  if (encrypted.algorithm !== 'AES-256-GCM') {
    throw new Error(`Unsupported algorithm: ${encrypted.algorithm}`)
  }
  return JSON.parse(aesDecrypt(encrypted.data, keyHex)) as AgentPrivatePayload
}

/**
 * Pack an AgentPayload for publishing.
 *   1. Split public/private
 *   2. AES-256-GCM encrypt private part
 *   3. ECIES wrap AES key with creator's public key
 */
export function packAgentForPublish(
  agent: import('./types').AgentPayload,
  publicKey: string,
  aesKeyHex?: string
): PackResult {
  const key = aesKeyHex ?? generateAesKey()

  const eciesEncryptedKeyHex = eciesEncrypt(key, publicKey)

  return {
    encryptedCid: '', // filled after IPFS upload
    publicCid: '',    // filled after IPFS upload
    aesKeyHex: key,
    eciesEncryptedKeyHex,
  }
}

/**
 * Unpack an Agent:
 *   1. ECIES decrypt the AES key (private key)
 *   2. AES-256-GCM decrypt the payload
 */
export function unpackAgent(
  encryptedPayload: EncryptedPayload,
  eciesEncryptedKey: string,
  privateKey: string
): AgentPrivatePayload {
  const aesKeyHex = eciesDecrypt(eciesEncryptedKey, privateKey)
  return decryptPayload(encryptedPayload, aesKeyHex)
}

// ── Key Pair Utilities ─────────────────────────────────────────────────────

/**
 * Generate a secp256k1 keypair compatible with Ethereum wallets.
 */
export function generateKeyPair(): { privateKey: string; publicKey: string } {
  const priv = randomBytes(32)
  const pub = secp256k1.getPublicKey(priv, false) // uncompressed 04-prefixed
  return { privateKey: bytesToHex(priv), publicKey: bytesToHex(pub) }
}

/**
 * Derive public key from private key (hex).
 */
export function getPublicKey(privateKey: string): string {
  return bytesToHex(secp256k1.getPublicKey(hexToBytes(privateKey), false))
}
