# @agentxv2/sdk Upgrade Guide

## v0.6.3 → v0.6.4

### What's New

| Feature | Description |
|---------|-------------|
| **IPFSUploader** | Upload to IPFS via Pinata REST API or custom endpoint. Supports JSON, files, and encrypted payload upload. |
| **publishAgent()** | One-shot pipeline: encrypt agent private payload → upload to IPFS → return CIDs ready for on-chain minting. |
| **IPFS Platform Tools** | AgentLoop tools: `agentx_ipfs_upload`, `agentx_ipfs_upload_encrypted`, `agentx_ipfs_get_url` |
| **Sub-path Export** | `@agentxv2/sdk/ipfs` — tree-shakeable IPFSUploader import |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.6.4
```

### 1. Replace manual IPFS upload with publishAgent()

**Before (v0.6.3):**

```ts
import { generateAesKey, encryptPayload, packAgentForPublish } from '@agentxv2/sdk'

const aesKey = generateAesKey()
const encrypted = encryptPayload(privatePayload, aesKey)
const packResult = packAgentForPublish(agentPayload, publicKey, aesKey)
// Manually upload encrypted.data to IPFS (not provided by SDK)
// Manually upload agent metadata to IPFS (not provided by SDK)
```

**After (v0.6.4):**

```ts
import { IPFSUploader, publishAgent } from '@agentxv2/sdk'

const uploader = new IPFSUploader({ pinataJwt: 'eyJ...' })

const result = await publishAgent({ agent, publicKey, uploader })
// result.encryptedCid, result.publicCid — ready for on-chain minting
```

### 2. Use IPFSUploader directly

```ts
import { IPFSUploader } from '@agentxv2/sdk/ipfs'

const uploader = new IPFSUploader({
  pinataJwt: 'eyJ...',           // required for Pinata
  // customEndpoint: '...',      // alternative to Pinata
  gatewayUrl: 'https://ipfs.io', // default
})

// Upload JSON
const { cid, url } = await uploader.uploadJSON({ key: 'value' })

// Upload encrypted agent payload
const { cid } = await uploader.uploadEncryptedPayload(encryptedPayload, 'agent-name')
```

### 3. AgentLoop IPFS tools

The following tools are now available in AgentLoop:

| Tool Name | Description |
|-----------|-------------|
| `agentx_ipfs_upload` | Upload JSON data to IPFS |
| `agentx_ipfs_upload_encrypted` | Encrypt and upload agent payload |
| `agentx_ipfs_get_url` | Build public gateway URL from CID |

### Breaking Changes

None. All v0.6.3 APIs remain fully compatible.

### Pinata Setup

1. Go to [pinata.cloud](https://pinata.cloud) → API Keys
2. Create a key with `pinFileToIPFS` and `pinJSONToIPFS` permissions
3. Copy the JWT token
4. Pass it to `IPFSUploader({ pinataJwt: '...' })`
