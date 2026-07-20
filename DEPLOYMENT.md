# AgentX Deployment Guide

> Production: `43.156.99.215` (Full-Stack) · Last updated: 2026-07-20

---

## Production Server: 43.156.99.215

| Spec | Value |
|------|-------|
| **OS** | Ubuntu 22.04 LTS |
| **RAM** | 7.3 GB |
| **Disk** | 79 GB SSD (~40G used) |
| **Node.js** | v22.23.1 |
| **npm** | 10.9.8 |
| **PostgreSQL** | 14 |
| **Swap** | 2 GB |

### Port Layout

```
43.156.99.215
├── :3100 → Next.js Frontend (standalone)
├── :3090 → Express Gateway (wallet auth / rate-limit / LLM proxy / MCP Server)
├── :5432 → PostgreSQL (localhost only)
├── :18545 → OxaChain L1 Geth Node (Clique PoA)
└── :3000 → Reserved (root indexer service)
```

### Firewall — Ports to Open

```
sudo ufw allow 3090/tcp   # Gateway + MCP
sudo ufw allow 3100/tcp   # Frontend
sudo ufw allow 18545/tcp  # OxaChain RPC (REQUIRED for browser wallet RPC calls)
```

### SSH Access

```bash
# Direct: ssh ubuntu@43.156.99.215
# Via jump host:
ssh -J ubuntu@43.156.78.59 -i agentx_new_prod.pem ubuntu@43.156.99.215
```

---

## 1. Frontend Deploy

### Path: `/home/ubuntu/agentx-frontend`

```bash
cd /home/ubuntu/agentx-frontend

# Install deps
npm install --legacy-peer-deps

# Build (Turbopack, ~3-5 min)
npx next build

# Copy static files for standalone
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/

# Kill old process & restart
sudo fuser -k 3100/tcp
cd .next/standalone
PORT=3100 HOSTNAME=0.0.0.0 nohup node server.js > /tmp/fe.log 2>&1 &
```

### `.env.production` (key values)

```
NEXT_PUBLIC_APP_URL=http://43.156.99.215:3100
NEXT_PUBLIC_SITE_URL=http://43.156.99.215:3100
NEXT_PUBLIC_AGENTX_GATEWAY_URL=http://43.156.99.215:3090
NEXT_PUBLIC_DEFAULT_CHAIN_ID=19505
NEXT_PUBLIC_OXACHAIN_RPC_URL=http://43.156.99.215:18545
NEXT_PUBLIC_OXACHAIN_EXPLORER=http://43.156.99.215:18400
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=b405f4f15938582260758473465a651b
```

### Wallet auto-switch to OxaChain L1

After connecting wallet, `WalletConnect.tsx` automatically calls `switchChain({ chainId: 19505 })`. MetaMask will prompt the user to add OxaChain L1 network if not already configured:

| Field | Value |
|-------|-------|
| Network Name | OxaChain L1 |
| Chain ID | 19505 |
| RPC URL | `http://43.156.99.215:18545` |
| Currency Symbol | T0x |
| Block Explorer | `http://43.156.99.215:18400` |

---

## 2. Gateway Deploy

### Path: `/home/ubuntu/agentx-gateway`

```bash
cd /home/ubuntu/agentx-gateway

# Install deps
npm install

# Build TypeScript
npx tsc

# Restart
sudo fuser -k 3090/tcp
nohup node dist/index.js > /tmp/gw.log 2>&1 &
```

### `.env` (all required variables)

```
PORT=3090
NODE_ENV=production
DATABASE_URL=postgresql://agentx:AgentX2024!Gateway@localhost:5432/agentx_gateway
REDIS_URL=redis://localhost:6379
JWT_SECRET=agentx-prod-jwt-secret-key-2026
MASTER_ENCRYPTION_KEY=agentx-master-encryption-key-32b
SESSION_TTL_SEC=86400
FREE_PLAN_ID=
CORS_ORIGIN=http://43.156.99.215:3100
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
RPC_URL_OXACHAIN=http://localhost:18545
CHAIN_ID=11155111
CHAIN_ID_OXACHAIN=19505
IDENTITY_REGISTRY=0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F
IDENTITY_REGISTRY_OXACHAIN=0xbf5F9db266c8c97E3334466C88597Eb758AfE212
SUBSCRIPTION_MANAGER=0xC15fE80b9d800abb72121F353a6ae6d6E9077E63
SUBSCRIPTION_MANAGER_OXACHAIN=0x019AC9d945467478Dd371CDbD70cb2f325800E6B
A2A_PROTOCOL=0x309C7447d89f3087A9924BB686d88df020F7e9cB
A2A_PROTOCOL_OXACHAIN=0xDF2939EFafEe6439eB2226DbEd07AD6F5Ae2112B
REPUTATION_REGISTRY=0xeb6B410ea71b8d9dA0c96f6A91d35027CE143DC9
REPUTATION_REGISTRY_OXACHAIN=0x6a18C2664E1b42063860d864b6448b824d7B843F
CONFIGURATION_REGISTRY=0x68DcE00e4C9077c94BC68016cD14B09557faEA6c
CONFIGURATION_REGISTRY_OXACHAIN=0x07280674ccc2898Fd038A9e3C22005CA83ffD2F8
MULTI_ENDPOINT=0xEB5e866f186d4B73F97aa0d70B86f2C6e2e21Cb7
MULTI_ENDPOINT_OXACHAIN=0xB361d04F49000013FC131D3C59C41c8486C64f8c
```

---

## 3. PostgreSQL Setup

```bash
sudo apt-get install -y postgresql postgresql-client
sudo systemctl start postgresql
sudo systemctl enable postgresql
sudo -u postgres psql -c "CREATE USER agentx WITH PASSWORD 'AgentX2024!Gateway' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE agentx_gateway OWNER agentx;"
psql -U agentx -d agentx_gateway -f db/migrations/001_init.sql
```

### Schema (6 tables)

| Table | Purpose |
|-------|---------|
| `plans` | Free / Pro tiers |
| `tenants` | Wallet address → plan binding |
| `platform_api_keys` | Encrypted platform keys |
| `tenant_api_keys` | BYOK keys (encrypted) |
| `usage_logs` | Per-request token + tool call tracking |
| `chat_messages` | Conversation history |

---

## 4. Contract Deployment (Foundry)

```bash
cd contracts/

# Install dependencies
forge install OpenZeppelin/openzeppelin-contracts@v5.0.2
forge install foundry-rs/forge-std@v1.9.2

# Compile (requires via_ir=true in foundry.toml for ReputationRegistry)
forge build

# Deploy (IdentityRegistry + SubscriptionManager)
forge script script/DeployOxaChain.s.sol \
  --rpc-url http://43.156.99.215:18545 \
  --broadcast --legacy

# Full 6-contract suite
forge script script/DeployOxaChainFull.s.sol \
  --rpc-url http://43.156.99.215:18545 \
  --broadcast --legacy
```

> `via_ir = true` required in `foundry.toml` (ReputationRegistry stack-too-deep).

### Gas Note

`subscribe()` needs **~615K** gas. SDK should use `gasLimit: 2_000_000`.

---

## 5. Health Checks

```bash
# Frontend
curl -sI http://43.156.99.215:3100/ | head -1

# Gateway
curl -s http://43.156.99.215:3090/api/v1/health

# MCP
curl -s -X POST http://43.156.99.215:3090/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# OxaChain RPC
curl -s -X POST http://43.156.99.215:18545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Processes
ss -tlnp | grep -E '3100|3090|18545'
```

---

## 6. Contract Addresses (Dual-Chain)

| # | Contract | Sepolia | OxaChain L1 |
|---|----------|---------|-------------|
| 1 | IdentityRegistry | `0xe94a...96e5F` | `0xbf5F...E212` |
| 2 | SubscriptionManager v3 | `0xC15f...7E63` | `0x019A...0E6B` |
| 3 | A2AProtocolRegistry v2 | `0x309C...7e9cB` | `0xDF29...112B` |
| 4 | ReputationRegistry | `0xeb6B...3DC9` | `0x6a18...843F` |
| 5 | ConfigurationRegistry | `0x68Dc...EA6c` | `0x0728...D2F8` |
| 6 | MultiEndpointRegistry | `0xEB5e...1Cb7` | `0xB361...4f8c` |

| Chain | Chain ID | RPC URL |
|-------|----------|---------|
| Sepolia (Testnet) | 11155111 | `https://ethereum-sepolia-rpc.publicnode.com` |
| **OxaChain L1 (Mainnet)** | **19505** | `http://43.156.99.215:18545` |

---

## 7. npm SDK Publish

```bash
cd sdk/
npm run build
npm version patch
npm publish --access public --registry https://registry.npmjs.org/
```

Current: `@agentxv2/sdk@0.6.4` · Git tag: `v0.6.4`

### SDK v0.6.4 New Features

| Feature | Module | Description |
|---------|--------|-------------|
| `IPFSUploader` | `@agentxv2/sdk/ipfs` | Upload to IPFS via Pinata API or custom endpoint |
| `publishAgent()` | `@agentxv2/sdk` | One-shot encrypt + IPFS upload + pack pipeline |
| IPFS Platform Tools | AgentLoop | `agentx_ipfs_upload` / `upload_encrypted` / `get_url` |

### PINATA_JWT Configuration

For IPFS upload functionality, set the Pinata JWT in the Gateway `.env`:

```bash
PINATA_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
IPFS_GATEWAY_URL=https://ipfs.io
```

---

## Legacy Servers

| Server | Role | Status |
|--------|------|--------|
| `43.156.225.164` | Old Production | Migrated |
| `43.156.78.59:8080` | Test Frontend | Stale |
| `101.33.109.117:3090` | Old Gateway | Retired |
