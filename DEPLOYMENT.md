# AgentX Deployment Guide

> Production: `43.156.225.164` (Full-Stack) · Last updated: 2026-07-17

---

## Production Server: 43.156.225.164

| Spec | Value |
|------|-------|
| **OS** | Ubuntu 24.04.4 LTS |
| **RAM** | 3.6 GB |
| **Disk** | 59 GB SSD (6.6G used) |
| **Node.js** | v22.23.1 |
| **npm** | 10.9.8 |
| **PostgreSQL** | 16 (system package) |
| **Swap** | 2 GB |

### Port Layout

```
43.156.225.164
├── :3000 → Next.js Frontend (standalone, Turbopack)
├── :3090 → Express Gateway (wallet auth / rate-limit / LLM proxy)
└── :5432 → PostgreSQL
```

---

## 1. Frontend Deploy

### Path: `/home/ubuntu/agentx-platform`

```bash
cd /home/ubuntu/agentx-platform

# Install deps
npm install --legacy-peer-deps

# Build (Turbopack, ~2-4 min)
NODE_OPTIONS='--max-old-space-size=2560' ./node_modules/.bin/next build

# Start
nohup ./node_modules/.bin/next start -p 3000 > /tmp/agentx-run.log 2>&1 &
```

### Key Config: `next.config.js`
```js
{
  output: 'standalone',
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
}
```

### `.env.production` (key values)
```
NEXT_PUBLIC_APP_URL=http://43.156.225.164:3000
NEXT_PUBLIC_AGENTX_GATEWAY_URL=http://43.156.225.164:3090
NEXT_PUBLIC_DEFAULT_CHAIN_ID=11155111
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
./node_modules/.bin/tsc

# Run
nohup node dist/index.js > /tmp/gw.log 2>&1 &
```

### `.env` (key values)
```
PORT=3090
NODE_ENV=production
DATABASE_URL=postgresql://agentx:AgentX2024!Gateway@localhost:5432/agentx_gateway
JWT_SECRET=agentx-prod-jwt-secret-20260717-gateway-key
SESSION_TTL_SEC=86400
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
scp agentx_fe.tar.gz ubuntu@43.156.225.164:/tmp/

# Extract + deploy
ssh ubuntu@43.156.225.164 "
  rm -rf /home/ubuntu/agentx-platform && mkdir -p /home/ubuntu/agentx-platform &&
  cd /home/ubuntu/agentx-platform && tar xzf /tmp/agentx_fe.tar.gz &&
  npm install --legacy-peer-deps &&
  NODE_OPTIONS='--max-old-space-size=2560' ./node_modules/.bin/next build &&
  fuser -k 3000/tcp; nohup ./node_modules/.bin/next start -p 3000 > /tmp/agentx-run.log 2>&1 &
"
```

---

## 5. Health Checks

```bash
# Frontend
curl -sI http://43.156.225.164:3000/ | head -3
# → HTTP/1.1 200 OK

# Gateway
curl -s http://43.156.225.164:3090/api/v1/health
# → {"status":"ok","time":"2026-07-16T17:04:38.560Z"}

# Process check
ss -tlnp | grep -E '3000|3090'
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

Current: `@agentxv2/sdk@0.6.2`

---

## Legacy Servers

| Server | Role | Status |
|--------|------|--------|
| `101.33.109.117:3090` | Old Gateway | ❌ Migrated to 164 |
| `43.156.78.59:8080` | Test Frontend | ⚠️ Stale |
