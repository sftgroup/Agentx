# AgentX Deployment Guide

> Production: `43.156.99.215` (Full-Stack) · Last updated: 2026-07-17

---

## Production Server: 43.156.99.215

| Spec | Value |
|------|-------|
| **OS** | Ubuntu 22.04 LTS |
| **RAM** | 7.3 GB |
| **Disk** | 79 GB SSD (27G used) |
| **Node.js** | v22.23.1 |
| **npm** | 10.9.8 |
| **PostgreSQL** | 14 |
| **Swap** | via RAM |

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
sudo ufw allow 18545/tcp  # OxaChain RPC (if external access needed)
```

### SSH Access (RSA Key via Jump Host)

```bash
# Direct (may timeout): ssh -i agentx_new_prod.pem ubuntu@43.156.99.215
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

# Start standalone
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/
cd .next/standalone
PORT=3100 HOSTNAME=0.0.0.0 nohup node server.js > /tmp/fe.log 2>&1 &
```

### Key Config: `next.config.js`
```js
{
  output: 'standalone',
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => ({
    ...config,
    resolve: {
      ...config.resolve,
      alias: { ...config.resolve.alias, '@x402/evm': false, '@x402/svm': false },
      fallback: { ...config.resolve.fallback, '@x402/evm': false, '@x402/svm': false },
    },
  }),
}
```

### `.env.production` (key values)
```
NEXT_PUBLIC_APP_URL=http://43.156.99.215:3100
NEXT_PUBLIC_AGENTX_GATEWAY_URL=http://43.156.99.215:3090
NEXT_PUBLIC_DEFAULT_CHAIN_ID=11155111
NEXT_PUBLIC_OXACHAIN_RPC_URL=http://localhost:18545
NEXT_PUBLIC_SEPOLIA_A2A_PROTOCOL=0x309C7447d89f3087A9924BB686d88df020F7e9cB
NEXT_PUBLIC_OXACHAIN_A2A_PROTOCOL=0xDF2939EFafEe6439eB2226DbEd07AD6F5Ae2112B
```

---

## 2. Gateway Deploy

### Path: `/home/ubuntu/agentx-gateway`

```bash
cd /home/ubuntu/agentx-gateway

# Install deps
npm install

# Build TypeScript
npx tsc

# Run
nohup npx tsx src/index.ts > /tmp/gw.log 2>&1 &
```

### `.env` (key values)
```
PORT=3090
NODE_ENV=production
DATABASE_URL=postgresql://agentx:AgentX2024!Gateway@localhost:5432/agentx_gateway
JWT_SECRET=agentx-prod-jwt-secret-key-2026
MASTER_ENCRYPTION_KEY=agentx-master-encryption-key-32b
SESSION_TTL_SEC=86400
RPC_URL_OXACHAIN=http://localhost:18545
```

---

## 3. PostgreSQL Setup

```bash
# Install
sudo apt-get install -y postgresql postgresql-client

# Start
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create user + DB
sudo -u postgres psql -c "CREATE USER agentx WITH PASSWORD 'AgentX2024!Gateway' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE agentx_gateway OWNER agentx;"
```

### Schema (6 tables)
| Table | Purpose |
|-------|---------|
| `plans` | Free / Pro tiers (slug, quota_daily, rpm_limit) |
| `tenants` | Wallet address → plan binding |
| `platform_api_keys` | Encrypted platform keys |
| `tenant_api_keys` | BYOK keys (encrypted, provider-specific) |
| `usage_logs` | Per-request token + tool call tracking |
| `chat_messages` | Conversation history |

---

## 4. Quick Deploy (from tar)

```bash
# Upload source tar
scp -J ubuntu@43.156.78.59 -i agentx_new_prod.pem agentx_fe.tar.gz ubuntu@43.156.99.215:/tmp/

# Extract + deploy
ssh -J ubuntu@43.156.78.59 -i agentx_new_prod.pem ubuntu@43.156.99.215 "
  rm -rf /home/ubuntu/agentx-frontend && mkdir -p /home/ubuntu/agentx-frontend &&
  cd /home/ubuntu/agentx-frontend && tar xzf /tmp/agentx_fe.tar.gz &&
  npm install --legacy-peer-deps &&
  npx next build &&
  cp -r .next/static .next/standalone/.next/static &&
  cp -r public .next/standalone/ &&
  sudo fuser -k 3100/tcp;
  cd .next/standalone && PORT=3100 HOSTNAME=0.0.0.0 nohup node server.js > /tmp/fe.log 2>&1 &
"
```

---

## 5. Health Checks

```bash
# Frontend
curl -sI http://43.156.99.215:3100/ | head -3
# → HTTP/1.1 200 OK

# Gateway
curl -s http://43.156.99.215:3090/api/v1/health
# → {"status":"ok","time":"2026-07-16T17:04:38.560Z"}

# MCP
curl -s -X POST http://43.156.99.215:3090/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
# → returns 29 tools

# Process check
ss -tlnp | grep -E '3100|3090'
```

---

## 6. A2A Contract Deployment

```bash
# Sepolia
cd /tmp/a2a_build
forge script script/DeployA2A.s.sol:DeployA2A \
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com \
  --broadcast --legacy

# OxaChain L1
forge script script/DeployA2A.s.sol:DeployA2A \
  --rpc-url http://43.156.99.215:18545 \
  --broadcast --legacy
```

### Current A2A v2 Addresses
| Chain | Address |
|-------|---------|
| Sepolia | `0x309C7447d89f3087A9924BB686d88df020F7e9cB` |
| OxaChain L1 | `0xDF2939EFafEe6439eB2226DbEd07AD6F5Ae2112B` |

### All Contract Addresses (Dual-Chain)

| # | Contract | Sepolia | OxaChain L1 |
|---|----------|---------|-------------|
| 1 | IdentityRegistry | `0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F` | `0xbf5F9db266c8c97E3334466C88597Eb758AfE212` |
| 2 | SubscriptionManager | `0xC15fE80b9d800abb72121F353a6ae6d6E9077E63` | `0x019AC9d945467478Dd371CDbD70cb2f325800E6B` |
| 3 | A2AProtocolRegistry | `0x309C7447d89f3087A9924BB686d88df020F7e9cB` | `0xDF2939EFafEe6439eB2226DbEd07AD6F5Ae2112B` |
| 4 | ReputationRegistry | `0xeb6B410ea71b8d9dA0c96f6A91d35027CE143DC9` | `0x6a18C2664E1b42063860d864b6448b824d7B843F` |
| 5 | ConfigurationRegistry | `0x68DcE00e4C9077c94BC68016cD14B09557faEA6c` | `0x07280674ccc2898Fd038A9e3C22005CA83ffD2F8` |
| 6 | MultiEndpointRegistry | `0xEB5e866f186d4B73F97aa0d70B86f2C6e2e21Cb7` | `0xB361d04F49000013FC131D3C59C41c8486C64f8c` |

| Chain | Chain ID | RPC URL |
|-------|----------|---------|
| Sepolia (Testnet) | 11155111 | `https://ethereum-sepolia-rpc.publicnode.com` |
| OxaChain L1 (Mainnet) | 19505 | `http://43.156.99.215:18545` |

---

## 7. npm SDK Publish

```bash
cd sdk/
npm run build
npm version patch        # bump to 0.6.x
npm publish --access public
```

Current: `@agentxv2/sdk@0.6.4`

---

## Legacy Servers

| Server | Role | Status |
|--------|------|--------|
| `43.156.225.164` | Old Production | Migrated to 99.215 |
| `43.156.78.59:8080` | Test Frontend | Stale |
| `101.33.109.117:3090` | Old Gateway | Retired |
