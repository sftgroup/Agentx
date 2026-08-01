// AgentX Conversation Service — Crypto utilities
// AES-256-GCM encrypt/decrypt for tenant API key storage at rest.
// Uses the service-level MASTER_ENCRYPTION_KEY from environment.

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { config } from '../config'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
  const hex = config.masterEncryptionKey
  if (!hex || hex.length !== 64) {
    throw new Error('[Crypto] MASTER_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

/** Encrypt plaintext → hex(IV || ciphertext || authTag) */
export function encryptSecret(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, encrypted, authTag]).toString('hex')
}

/** Decrypt hex(IV || ciphertext || authTag) → plaintext */
export function decryptSecret(hexData: string): string {
  const key = getKey()
  const buf = Buffer.from(hexData, 'hex')
  const iv = buf.subarray(0, IV_LENGTH)
  const authTag = buf.subarray(buf.length - AUTH_TAG_LENGTH)
  const encrypted = buf.subarray(IV_LENGTH, buf.length - AUTH_TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
