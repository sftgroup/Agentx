// ---------------------------------------------------------------------------
// AgentX Gateway — Crypto Utilities
// ---------------------------------------------------------------------------
// AES-256-GCM encrypt/decrypt for tenant API keys at rest.
// ---------------------------------------------------------------------------

import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

export function encryptApiKey(plaintext: string, masterKeyHex: string): string {
  const key = Buffer.from(masterKeyHex, 'hex')
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  const combined = Buffer.concat([iv, authTag, encrypted])
  return combined.toString('base64')
}

export function decryptApiKey(ciphertext: string, masterKeyHex: string): string {
  const key = Buffer.from(masterKeyHex, 'hex')
  const combined = Buffer.from(ciphertext, 'base64')

  const iv = combined.subarray(0, IV_LENGTH)
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}
