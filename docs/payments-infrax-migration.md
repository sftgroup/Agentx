# AgentX 支付引擎迁移方案：`@agentxv2/payments` → `@0xinfrax/payments`

> 版本：0.1（执行依据）
> 决策：① 通用支付引擎整体移交 infraX 团队，以 **`@0xinfrax/payments`** 发布到 npm（registry），AgentX 不再自维护通用包；② AgentX **保留定制支付 SDK**（`@agentxv2/sdk` 的 `SubscriptionPayments` + 协议客户端 re-export），应用方升级 sdk 即完成迁移，业务代码零改动；③ gateway 依赖从 `file:../payments` 切换为 registry 包；④ 依赖方向固定为 **AgentX → @0xinfrax/payments**（无反向）。

---

## 一、背景与目标

通用支付引擎（chain / Stripe / x402 / MPP / 稳定币 / period 授权制 / a2a-pay）已完成零业务耦合设计（`metadata` 透传、`PaymentStore` 接缝、`onWebhookEvent`/`onCredit` 回调），具备独立维护条件。本次将其移交 infraX：

- **infraX 侧**（已完成）：源码迁入 `sftgroup/infraX` 仓库 `projects/payments/`，以 `@0xinfrax/payments@0.1.0` 发布，解耦验证 19 项断言全绿。
- **AgentX 侧**（本方案）：切换依赖来源，保留定制层，发布 sdk 新版本，通知应用方升级。

## 二、目标依赖形态

```
应用方（frontend / conversation-service / gateway）
   └── @agentxv2/sdk@0.11.x（定制层：SubscriptionPayments + 协议客户端 re-export）
         └── @0xinfrax/payments@^0.1.0（通用引擎，registry）

gateway（直接依赖）
   └── @0xinfrax/payments@^0.1.0（替代 file:../payments）
```

应用方**不直接**依赖支付引擎，升级 `@agentxv2/sdk` 即完成迁移。

## 三、已完成的准备（本方案落盘时的状态）

| 项 | 状态 |
|---|---|
| `@0xinfrax/payments@0.1.0` 发布到 npm（39 文件：dist + db/migrations 5 个 SQL） | ✅ |
| `@0xinfrax` scope 发布权限验证（stevenwang000x，read-write） | ✅ |
| 解耦验证 19 项断言全绿（infraX 侧，独立库形态） | ✅ |
| sdk 代码改造：`src/payment/*` import 换包、`PAYMENT_VERSION`→0.1.0、`package.json` 依赖 | ✅ 已改未提交 |
| gateway 代码改造：`package.json` `file:../payments`→`@0xinfrax/payments@^0.1.0`、8 个 src 文件换包 | ✅ 已改未提交 |
| sdk / gateway `npm install` 后 lock 解析到 `@0xinfrax/payments@0.1.0` | ✅ |
| 生产 registry 注意（腾讯云镜像，安装新包需 `--registry=https://registry.npmjs.org/`） | ✅ 已记录 |

改动范围：**sdk 7 个文件 + gateway 11 个文件**，均未提交（执行前可 review / revert）。

## 四、执行步骤（按序，串行，注意低资源占用）

> **执行状态：✅ 全部完成（2026-08-10）**，对应 AgentX `docs/PROGRESS.md` R17 清单 A-E + F1；F2（首次跟随演练）待 infraX 发布 `@0xinfrax/payments@0.1.1`。

1. **sdk 验证**：`npm run build` → `npm run typecheck` → `npm test`（在 `Agentx/sdk/`）— ✅ 32/32 全绿
2. **gateway 验证**：`npm run build` → `npm run typecheck` → `npm test`（在 `Agentx/gateway/`）— ✅ 46/46 全绿
3. **发布 sdk 0.11.0**：`npm version 0.11.0` → `npm publish`（确认 prepublish 构建产物）— ✅ `@agentxv2/sdk@0.11.0` 已发布（commit `3435a01` + tag `v0.11.0`）
4. **gateway 升级 sdk**：`npm install @agentxv2/sdk@^0.11.0` → 复跑 gateway 验证，确认 lock 彻底移除 `@agentxv2/payments` / `../payments` 残留 — ✅ lock 残留 0
5. **旧包处理**：`npm deprecate @agentxv2/payments@0.2.x`（提示迁移至 `@0xinfrax/payments`）；AgentX `payments/` 目录保留为历史 — ✅ 4 版本全部 deprecate
6. **文档**：sdk `CHANGELOG.md` 0.11.0 条目、`docs/PROGRESS.md` 记录、应用方通知通用文案（§五）— ✅ CHANGELOG + PROGRESS R17 已更新（D 阶段）；应用方通知见 F1
7. **生产升级（E）**：生产机（43.159.60.46，`~/Agentx`）`git pull` 至 `2e2aaa8` → gateway `npm install --registry=https://registry.npmjs.org/`（sdk=0.11.0 / @0xinfrax/payments=0.1.0）→ `npm run build` → `pm2 restart agentx-gateway` — ✅ 完成，冒烟 `/api/v1/payments/info`（统一引擎 payload，fiat/x402 disabled 按配置）与 `/access`（active:false）正常
8. **提交推送**：AgentX 仓库（本次涉及文件单独提交，不含无关改动）— ✅ E/F1 已分别提交推送（`8b3970f` / `35c51ec`，origin/main）

## 五、应用方通知（通用文案要点）

> 升级 `@agentxv2/sdk` 至 **0.11.x** 即可。支付引擎底层由 AgentX 自维护包切换为 InfraX 维护的 `@0xinfrax/payments`（能力与之前完全一致，仅依赖来源变化）。业务代码、API、配置均无需修改。

**应用方清单（2026-08-10 生产机 43.159.60.46 盘点）**：
- `aiservicer`（sdk `^0.9.1`）——未消费新支付引擎，`@agentxv2/payments@0.2.x` 已 deprecate 但 npm 仍可安装，**不受影响**；升级至 0.11.x 为推荐项（可选，非阻塞）
- `autoops` / `pocketx-wallet-deploy`——无 `@agentxv2/sdk` 依赖，无需升级
- AgentX 三服务（gateway/frontend/conversation-service）——gateway 已升级 0.11.0；frontend/conversation-service 保持 `^0.10.x`（仅用 ConversationClient，无支付引用，随下次升级即可）

## 六、长期跟随策略（infraX 后续发版）

- 依赖锁 `^0.1.0`：只自动跟随 0.1.x 补丁（bugfix/安全），`0.2.0+`（潜在 breaking / 新能力）不会自动进入。
- 生产环境有 lock 文件，**不重装不会变**；依赖生效需显式升级。
- infraX 每次发版 → AgentX 走固定 check-list：

```
infraX 发布 @0xinfrax/payments 新版
  → AgentX 升级该依赖
  → 解耦验证回归（19 项断言，run-decouple.sh）
  → sdk build + typecheck + test
  → 发布 @agentxv2/sdk 新版本
  → gateway / 消费方升级 sdk
```

- **安全补丁建议必跟**；功能 / breaking 按需评估，semver 已保护。

## 七、风险与回滚

- **Cloudflare 边缘缓存延迟**：发布后立即 `npm install` 可能 404（packument/tarball 边缘缓存）→ 使用 `--prefer-online` 或等待数分钟（本次迁移已踩过并解决）。
- **gateway lock 残留**：`node_modules/@agentxv2/payments → ../payments` 的 link 引用须待 sdk 0.11.0 发布、gateway 升级 sdk 后才会消除。
- **回滚**：旧包 `@agentxv2/payments@^0.2.2` 全部版本仍在 registry，可 `npm install @agentxv2/payments@^0.2.2` + `git revert` 双保险；新包 `0.1.0` 与原 `0.2.2` 功能完全一致（仅改名）。
