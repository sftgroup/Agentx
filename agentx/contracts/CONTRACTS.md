# AgentX Contracts — Deployment & Reference

> Last updated: 2026-07-14 01:45 (OxaChain L1 full 6-contract deploy)

---

## Repository

- **主仓库**: [sftgroup/Agentx](https://github.com/sftgroup/Agentx) — AgentX 全平台 monorepo
- **原始合约**: [sftgroup/erc8004](https://github.com/sftgroup/erc8004) — ERC-8004 原始合约 + AgentX 完整备份

---

## Core Platform Contracts (6) — Dual-Chain

| # | Contract | Solc | Sepolia (11155111) | OxaChain L1 (19505) |
|---|----------|------|--------|--------|
| 1 | IdentityRegistry | 0.8.24 | `0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F` | `0xbf5F9db266c8c97E3334466C88597Eb758AfE212` |
| 2 | SubscriptionManager v3 | 0.8.24 | `0xC15fE80b9d800abb72121F353a6ae6d6E9077E63` | `0x019AC9d945467478Dd371CDbD70cb2f325800E6B` |
| 3 | ReputationRegistry | 0.8.20 | `0xeb6B410ea71b8d9dA0c96f6A91d35027CE143DC9` | `0x6a18C2664E1b42063860d864b6448b824d7B843F` |
| 4 | A2AProtocolRegistry | 0.8.20 | `0xEdb0022c250B38e281B3EF1418037889fC5C6092` | `0x61b7E7Eed21F013e35a90FC5de5c352780ec5169` |
| 5 | ConfigurationRegistry | 0.8.20 | `0x68DcE00e4C9077c94BC68016cD14B09557faEA6c` | `0x07280674ccc2898Fd038A9e3C22005CA83ffD2F8` |
| 6 | MultiEndpointRegistry | 0.8.20 | `0xEB5e866f186d4B73F97aa0d70B86f2C6e2e21Cb7` | `0xB361d04F49000013FC131D3C59C41c8486C64f8c` |

> All 12 Sepolia contracts verified on Blockscout. OxaChain L1 deployment: forge script DeployOxaChainFull.s.sol --via-ir --legacy, 6 txns.

---

## Archived / Deprecated Contracts

These 6 contracts are in the repo for reference but **not part of AgentX**:

| Contract | Reason |
|----------|--------|
| PaymentGateway | Replaced by SM v3 + AgentX402 |
| AgentFactory | IR direct registration, no template factory flow |
| AgentWallet | No per-agent wallet requirement |
| TokenPriceOracle | No multi-currency conversion |
| ValidationRegistry | No on-chain validation requirement |
| BaseReputationRegistry | Abstract contract |

> Source preserved in `contracts/src/erc8004-core/` and `erc8004-extensions/`.

---

## Chains

| Chain | Chain ID | RPC | Explorer |
|-------|----------|-----|----------|
| Sepolia | 11155111 | `https://ethereum-sepolia-rpc.publicnode.com` | https://eth-sepolia.blockscout.com |
| OxaChain L1 | 19505 | `http://43.156.99.215:18545` | http://43.156.99.215:18400 |

---

## Deployers

| Chain | Address |
|-------|---------|
| Sepolia | `0x4F7744F97AaC9Ad7f0a67de75b149aDb87464103` |
| OxaChain L1 | `0x8E869A0624fF9e766Df71b5B08897d00E4d260ba` |

---

## Deploy Scripts

### OxaChain L1 Full (6 contracts)

```bash
cd agentx/contracts
export PATH="$HOME/.foundry/bin:$PATH"
export PRIVATE_KEY=<deployer-key>

forge script script/DeployOxaChainFull.s.sol:DeployOxaChainFull \
  --rpc-url http://43.156.99.215:18545 \
  --broadcast --legacy --via-ir
```

> `--via-ir` required: ReputationRegistry stack-too-deep without IR compilation.

### Sepolia Single Contract

```bash
cd agentx/contracts
forge create --rpc-url "$SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY" \
  --legacy --broadcast src/SubscriptionManager.sol:SubscriptionManager \
  --constructor-args <initialFeeBps>
```

---

## SubscriptionManager v3

### Key Parameters

| Param | Value |
|-------|-------|
| platformFeeBps | 500 (5%) |
| Compiler | solc 0.8.24, optimizer 200 runs |
| EvmVersion | cancun |
| OxaChain L1 tx | forge script DeployOxaChainFull.s.sol (6-in-1) |
| Sepolia tx | `0x31b4224758f65789a8dd953759294cf974ead3ca49f26a59bebcbc95172ca90f` |

### V3 Audit Fixes

| Fix | Detail |
|-----|--------|
| Reentrancy Guard | OpenZeppelin `ReentrancyGuard`, `nonReentrant` on subscribe/cancel/release/withdraw |
| State-before-call | ETH refund + ERC20 transferFrom moved AFTER state writes |
| Creator Fund Lock | Old subscription escrow released before overwrite |

### Features

| Feature | Method |
|---------|--------|
| Subscribe (ETH/ERC20) | `subscribe(planId)` |
| Trial Escrow | `trialDays` param, funds held during trial |
| Release Funds | `releaseFunds(subscriptionId)` |
| Cancel + Refund | `cancelSubscription(subscriptionId)` (100% refund during trial) |
| Platform Fee | `platformFeeBps()` / `setPlatformFee(bps)` (0-2000 bps) |
| Fee Withdrawal | `withdrawPlatformFees(token, to)` |

---

## IdentityRegistry v1

### Key Features

| Feature | Method |
|---------|--------|
| Register Agent | `registerWithMetadata(metaUri, aesKeyHex, eciesPubKey)` |
| Check Agent | `isRegistered(agentId)` |
| Get Agent | `getAgent(agentId)` → { owner, metaUri, data, active, locked, createdAt } |
| List by Owner | `getAgentsByOwner(address)` |

---

## Post-Deploy Checklist

1. ✅ Update `sdk/src/config/config.ts` → `KNOWN_CHAINS`
2. ✅ Update `frontend/.env.production` → `NEXT_PUBLIC_OXACHAIN_*`
3. ✅ Rebuild + publish SDK → `@agentxv2/sdk`
4. ✅ Update this file (CONTRACTS.md)
5. ✅ Push all changes to GitHub

---

## Version History

| Date | Event |
|------|-------|
| 2026-07-14 | OxaChain L1: all 6 core contracts deployed |
| 2026-07-14 | SDK v0.5.1: MultiEndpointClient + ConfigurationClient |
| 2026-07-14 | SDK v0.5.0: KNOWN_CHAINS[19505] full addresses |
| 2026-07-13 | Sepolia: SM v3 deployed (ReentrancyGuard, audit fixes) |
| 2026-07-13 | Sepolia: IdentityRegistry v1 + SM v2 deployed |
| 2026-07-12 | Repo recovery: full ERC-8004 source from 43.163.105.172 |
