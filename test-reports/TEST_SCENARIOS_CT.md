# AgentX — CT 合约 / SDK 集成测试场景

> 项目: AgentX (ERC-8004 AI Agent Protocol)
> 合约模块: IdentityRegistry / SubscriptionManager(v2) / PaymentGateway / A2AProtocol
> 网络: Sepolia (11155111) / OxaChain L1 (19505)
> 生成时间: 2026-07-20

---

## 概述

AgentX 基于 6 大链上合约模块提供去中心化 AI Agent 经济基础设施。CT 测试覆盖：
- **IdentityRegistry** — Agent NFT 铸造 / 元数据存储
- **SubscriptionManager v2** — 订阅计划 / 支付 / 释放
- **PaymentGateway** — 按次支付 / 托管 / 争议仲裁
- **A2AProtocol** — Agent 间协作 / 任务调度
- **AgentX SDK (crypto)** — AES-256-GCM + ECIES 双重加密 / 解密
- **Gateway Auth** — EIP-191 签名认证 / JWT 管理

---

## CT-1: Agent 注册与 NFT 铸造 (IdentityRegistry)

### CT-1.1: 基本 Agent 注册 (register)
| 项目 | 内容 |
|------|------|
| **目标** | 验证 `register()` 成功铸造 ERC-8004 NFT |
| **前置条件** | 钱包连接 Sepolia，持有 ETH |
| **操作步骤** | 1. 调用 `register()` 附带 0.001 ETH 注册费<br/>2. 等待交易确认<br/>3. 查询 `getCurrentAgentId()` 获取新 agentId<br/>4. 查询 `ownerOf(agentId)` 验证所有权<br/>5. 查询 `agentExists(agentId)` 确认存在 |
| **预期结果** | `agentId` 递增 1，owner 为调用地址，`agentExists` 返回 true |
| **验证事件** | `Registered(agentId, tokenURI, owner)` |

### CT-1.2: Agent 注册带 tokenURI (register)
| 项目 | 内容 |
|------|------|
| **目标** | 验证 `register(tokenURI)` 将 IPFS CID 写入链上 |
| **前置条件** | 已将 Agent 元数据上传 IPFS 获得 CID |
| **操作步骤** | 1. 构造 `tokenURI = ipfs://<CID>`<br/>2. 调用 `register(tokenURI)` 附带 0.001 ETH<br/>3. 查询 `tokenURI(agentId)` 读取存储的 URI |
| **预期结果** | `tokenURI(agentId)` 返回精确的 `ipfs://<CID>` |

### CT-1.3: Agent 注册带链上元数据 (registerWithMetadata)
| 项目 | 内容 |
|------|------|
| **目标** | 验证 `registerWithMetadata()` 在链上存储 name/description/pricing/encryption-key |
| **前置条件** | Agent 已通过 Studio 配置完成 |
| **操作步骤** | 1. 构造 metadata pairs: name, description, pricing_type, price_wei, aes_key_hex, tags<br/>2. 调用 `registerWithMetadata(tokenURI, metadata)`<br/>3. 对每个 key 调用 `getMetadata(agentId, key)` 验证存储值 |
| **预期结果** | 6 组 metadata 全部正确存储为 bytes |
| **字节编码** | 所有 value 为 `0x` + hex(Buffer.from(str, 'utf8')) |

### CT-1.4: 验证用户 Agent 列表 (getAgentsByOwner)
| 项目 | 内容 |
|------|------|
| **目标** | 验证地址→Agent 映射正确 |
| **操作步骤** | 1. 同一地址铸造 3 个 Agent<br/>2. 调用 `getAgentsByOwner(address)` |
| **预期结果** | 返回 [1, 2, 3] 数组 |

### CT-1.5: 重复元数据覆盖 (setMetadata)
| 项目 | 内容 |
|------|------|
| **目标** | 验证 Agent owner 可覆盖元数据 |
| **操作步骤** | 1. 调用 `setMetadata(agentId, "name", newBytes)`<br/>2. 调用 `getMetadata(agentId, "name")` |
| **预期结果** | 返回新值；非 owner 调用应 revert |

---

## CT-2: 订阅管理 (SubscriptionManager v2)

### CT-2.1: 创建订阅计划 (createPlan)
| 项目 | 内容 |
|------|------|
| **目标** | Agent creator 创建订阅计划 |
| **操作步骤** | 1. 以 agent owner 身份调用 `createPlan(agentId, price, "month", 0x0, 7)`<br/>   — price = 0.01 ETH (10000000000000000)<br/>   — period = "month"，payToken = zero address<br/>   — trialDays = 7<br/>2. 调用 `getPlan(planId)` 查询详情 |
| **预期结果** | planId 递增，creator/price/period/active/trialDays 正确 |

### CT-2.2: 用户订阅 (subscribe)
| 项目 | 内容 |
|------|------|
| **目标** | 验证 ETH 支付订阅创建 |
| **前置条件** | 已存在活跃计划，非 owner 地址 |
| **操作步骤** | 1. 用户调用 `subscribe(planId)` 附带计划 price 的 ETH<br/>2. 查询 `getUserSubscriptions(user)` |
| **预期结果** | subscriptionId 返回，status=0(Active)，startedAt/expiresAt 正确 |

### CT-2.3: 7 天免费试用 (trial)
| 项目 | 内容 |
|------|------|
| **目标** | 验证 trialDays 配置生效 |
| **操作步骤** | 1. 创建 trialDays=7 的计划<br/>2. 用户订阅（无需支付 ETH）<br/>3. 调用 `getSubscriptionDetail(subId)` 检查 trialActive/trialEndsAt |
| **预期结果** | trialActive=true, trialEndsAt = startedAt + 7天 |

### CT-2.4: 释放资金 (releaseFunds)
| 项目 | 内容 |
|------|------|
| **目标** | 验证 Agent owner 只能释放已交付服务的资金 |
| **操作步骤** | 1. 订阅完成后调用 `releaseFunds(subscriptionId)`<br/>2. 查询 `fundsReleased` 状态<br/>3. 验证 creator 余额增加 |
| **预期结果** | fundsReleased=true，creator 收到 ETH（扣除平台费） |

### CT-2.5: 取消订阅 (cancelSubscription)
| 项目 | 内容 |
|------|------|
| **目标** | 验证订阅方可取消活跃订阅 |
| **操作步骤** | 1. 订阅方调用 `cancelSubscription(subscriptionId)`<br/>2. 查询 `hasActiveSubscription(subscriber, agentId)` |
| **预期结果** | 状态变为 Cancelled(1)，hasActiveSubscription 返回 false |

### CT-2.6: 活跃订阅验证 (hasActiveSubscription)
| 项目 | 内容 |
|------|------|
| **目标** | 验证 SubscriptionGuard 门禁逻辑 |
| **操作步骤** | 1. 未订阅地址查询 `hasActiveSubscription(addr, agentId)`<br/>2. 订阅后再次查询<br/>3. 过期后再次查询 |
| **预期结果** | 未订阅→false, 活跃→true, 过期→false |

### CT-2.7: 平台费率查询 (platformFeeBps)
| 项目 | 内容 |
|------|------|
| **目标** | 验证平台抽成配置正确 |
| **操作步骤** | 调用 `platformFeeBps()` |
| **预期结果** | 返回费率基数点（非零） |

### CT-2.8: 代币白名单 (tokenWhitelist)
| 项目 | 内容 |
|------|------|
| **目标** | 验证非 ETH 代币支付支持 |
| **操作步骤** | 1. 查询 `tokenWhitelist(zeroAddress)` → false<br/>2. 查询 `tokenWhitelist(USDC)` → true（预期） |
| **预期结果** | 零地址为 ETH 原生支付，USDC 等稳定币应白名单 |

---

## CT-3: 支付网关 (PaymentGateway)

### CT-3.1: 创建托管支付 (createPayment + escrow)
| 项目 | 内容 |
|------|------|
| **目标** | 验证按次付费的托管支付流程 |
| **操作步骤** | 1. 客户端调用 `createPayment(agentId, token, amount, desc, useEscrow=true)`<br/>2. 附带 amount ETH<br/>3. 查询 `getPayment(paymentId)` |
| **预期结果** | status=Pending(0), isEscrowed=true, client/amount 正确 |

### CT-3.2: 完成支付 (completePayment)
| 项目 | 内容 |
|------|------|
| **目标** | 验证服务交付后支付完成 |
| **操作步骤** | 1. Agent owner 调用 `completePayment(paymentId)`<br/>2. 查询 `getPayment(paymentId)` 状态变化 |
| **预期结果** | status=Completed(1), completedAt > 0 |

### CT-3.3: 托管释放 (releaseEscrow)
| 项目 | 内容 |
|------|------|
| **目标** | 验证托管资金释放 |
| **操作步骤** | 1. 托管期过后调用 `releaseEscrow(paymentId)`<br/>2. 验证 owner 余额和合约余额 |
| **预期结果** | 资金从合约转入 owner 地址，事件 `EscrowReleased` |

### CT-3.4: 争议流程 (raiseDispute → resolveDispute)
| 项目 | 内容 |
|------|------|
| **目标** | 验证争议仲裁机制 |
| **操作步骤** | 1. 客户端调用 `raiseDispute(paymentId, reason)`<br/>2. 管理员调用 `resolveDispute(disputeId, refundApproved=true)`<br/>3. 验证资金退还 |
| **预期结果** | dispute 创建→解决→资金退还客户端 |

### CT-3.5: 收益查询 (getAgentEarnings)
| 项目 | 内容 |
|------|------|
| **目标** | 验证 Agent owner 收益累计 |
| **操作步骤** | 1. 完成多笔支付后<br/>2. 调用 `getAgentEarnings(owner)` |
| **预期结果** | 累计收益 = 所有已完成支付之和（扣平台费后） |

---

## CT-4: Agent-to-Agent 协议 (A2AProtocol)

### CT-4.1: 创建 Agent 卡片 (createAgentCard)
| 项目 | 内容 |
|------|------|
| **目标** | 验证 Agent 在 A2A 网络注册 |
| **操作步骤** | 1. 调用 `createAgentCard(agentId, name, desc, version, capabilities, tasks, protocol, auth, uri)`<br/>2. 查询 `getAgentCard(agentId)` |
| **预期结果** | cardId 返回，所有字段正确存储 |

### CT-4.2: 注册技能 (registerSkill + addAgentSkill)
| 项目 | 内容 |
|------|------|
| **目标** | 验证 MCP 技能链上注册 |
| **操作步骤** | 1. 调用 `registerSkill(name, desc, inputSchema, outputSchema, [], complexity)`<br/>2. 调用 `addAgentSkill(agentId, skillId, endpoint, version, price, token)`<br/>3. 查询 `getAgentSkills(agentId)` 和 `getAllSkills()` |
| **预期结果** | 技能正确关联到 Agent |

### CT-4.3: 创建与完成任务 (createTask + completeTask)
| 项目 | 内容 |
|------|------|
| **目标** | 验证 A2A 任务生命周期 |
| **操作步骤** | 1. 客户端调用 `createTask(agentId, taskType, inputData)`<br/>2. Agent 执行后调用 `completeTask(taskId, outputData, status)`<br/>3. 查询 `getTask(taskId)` |
| **预期结果** | taskId 创建→status 变化→outputData 记录 |

### CT-4.4: 用户任务列表 (getUserTasks)
| 项目 | 内容 |
|------|------|
| **目标** | 验证前端 A2A Tasks 页面数据 |
| **操作步骤** | 1. 创建 3 个任务<br/>2. 调用 `getUserTasks(address)` |
| **预期结果** | 返回 3 个 taskId |

---

## CT-5: AgentX SDK 加密管线

### CT-5.1: AES 密钥生成 (generateAesKey)
| 项目 | 内容 |
|------|------|
| **目标** | 验证 SDK `generateAesKey()` 产生 256 位密钥 |
| **操作步骤** | 1. 调用 `generateAesKey()` 10 次<br/>2. 验证每次输出不同 64 字符 hex |
| **预期结果** | 每次 64 hex 字符，互不相同 |

### CT-5.2: AES-256-GCM 加密/解密 (encryptPayload / decryptPayload)
| 项目 | 内容 |
|------|------|
| **目标** | 验证 Agent payload 加密完整周期 |
| **操作步骤** | 1. 构造 PrivatePayload { prompt, skills, mcp }<br/>2. `encryptPayload(payload, aesKey)` → EncryptedPayload<br/>3. `decryptPayload(encrypted, aesKey)` → PrivatePayload |
| **预期结果** | 解密后 payload 与原始完全一致 |

### CT-5.3: ECIES 密钥包裹 (wrapAesKey / unwrapAesKey)
| 项目 | 内容 |
|------|------|
| **目标** | 验证 ECIES(secp256k1) 密钥包裹和解包裹 |
| **操作步骤** | 1. 生成 AES key + ECDSA keypair<br/>2. 用接收方公钥 `wrapAesKey(aesKey, pubKey)` → wrapped<br/>3. 用接收方私钥 `unwrapAesKey(wrapped, privKey)` → aesKey |
| **预期结果** | 解包裹后 AES key 与原始一致 |

### CT-5.4: 完整发布打包周期 (packAgentForPublish)
| 项目 | 内容 |
|------|------|
| **目标** | 验证 SDK `packAgentForPublish()` 输出正确格式 |
| **操作步骤** | 1. 构造 AgentPayload + PrivatePayload + aesKey<br/>2. 调用 `packAgentForPublish(agentPayload, '', aesKey)`<br/>3. 验证返回的 PackResult 包含 encrypted.data 和 metadata |
| **预期结果** | encrypted.data 为加密 base64，metadata 包含 name/description/tags/pricing/version |

### CT-5.5: 订阅方解密流程
| 项目 | 内容 |
|------|------|
| **目标** | 验证完整发布→订阅→解密链路 |
| **操作步骤** | 1. Creator 发布 Agent（encrypt → IPFS → registerWithMetadata，aes_key_hex 存链上 metadata）<br/>2. Subscriber 订阅获取 NFT<br/>3. Subscriber 从链上 metadata 读取 aes_key_hex<br/>4. 从 IPFS 获取 encrypted.data<br/>5. 使用 aes_key_hex 解密获取 payload |
| **预期结果** | 解密后 prompt/skills/mcp 完整可读 |

---

## CT-6: Gateway EIP-191 认证

### CT-6.1: Challenge 获取
| 项目 | 内容 |
|------|------|
| **目标** | 验证 `/api/v1/auth/challenge?address=` 返回有效 challenge |
| **操作步骤** | 1. GET `{gateway}/api/v1/auth/challenge?address=0x...` |
| **预期结果** | JSON: `{ challenge: "agentx:auth:{ts}:{nonce}", timestamp, nonce }` |

### CT-6.2: Challenge 签名验证
| 项目 | 内容 |
|------|------|
| **目标** | 验证 `/api/v1/auth/verify` JWT 签发 |
| **操作步骤** | 1. walletClient.signMessage(challenge) → signature<br/>2. POST `verify` body: { wallet_address, signature, timestamp, nonce } |
| **预期结果** | JSON: `{ access_token, expires_in, tenant }`，access_token 为有效 JWT |

### CT-6.3: Tenant 自动创建
| 项目 | 内容 |
|------|------|
| **目标** | 验证首次登录自动创建 tenant |
| **操作步骤** | 1. 新地址完成 challenge→verify 流程<br/>2. GET `/api/v1/tenant/me` 带 Bearer token |
| **预期结果** | tenant.plan.slug='free', plan.quota_daily=0, plan.byok_enabled=true |

### CT-6.4: Token 过期处理
| 项目 | 内容 |
|------|------|
| **目标** | 验证 JWT 过期后 401 响应 |
| **操作步骤** | 1. 等待 token 过期（或使用过期 token）<br/>2. GET `/api/v1/tenant/me` |
| **预期结果** | 401 `{ error: "Invalid or expired token" }` |

---

## 合约地址速查

| 合约 | Sepolia | OxaChain L1 |
|------|---------|-------------|
| IdentityRegistry | `NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS` | 同（多链部署） |
| SubscriptionManager | `NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS` | TBD |
| PaymentGateway | `NEXT_PUBLIC_PAYMENT_GATEWAY_ADDRESS` | TBD |
| A2AProtocol | `NEXT_PUBLIC_A2A_PROTOCOL_ADDRESS` | TBD |

---

## 测试统计

| 分类 | 场景数 |
|------|--------|
| CT-1: IdentityRegistry | 5 |
| CT-2: SubscriptionManager v2 | 8 |
| CT-3: PaymentGateway | 5 |
| CT-4: A2AProtocol | 4 |
| CT-5: AgentX SDK Crypto | 5 |
| CT-6: Gateway Auth | 4 |
| **合计** | **31** |
