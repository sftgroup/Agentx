// ---------------------------------------------------------------------------
// AgentX Gateway — Crypto Utilities
// ---------------------------------------------------------------------------
// AES-256-GCM encrypt/decrypt for tenant API keys at rest. Canonical
// implementation lives in @agentxv2/sdk core/crypto (`encryptWithKey` /
// `decryptWithKey`, byte-compatible with the legacy gateway wire format
// base64( IV || authTag || ciphertext )); this module keeps the historical
// `encryptApiKey`/`decryptApiKey` names for the existing call sites.
// ---------------------------------------------------------------------------

import { encryptWithKey, decryptWithKey } from '@agentxv2/sdk'

export function encryptApiKey(plaintext: string, masterKeyHex: string): string {
  return encryptWithKey(plaintext, masterKeyHex)
}

export function decryptApiKey(ciphertext: string, masterKeyHex: string): string {
  return decryptWithKey(ciphertext, masterKeyHex)
}
