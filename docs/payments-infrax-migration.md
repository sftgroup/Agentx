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

### 两个 SDK 的定位区分（易混淆，务必区分）

| 维度 | AgentX 定制 SDK | InfraX 通用支付通道 SDK |
|---|---|---|
| 包名 | `@agentxv2/sdk` | `@0xinfrax/payments` |
| 维护方 / 归属 | AgentX（sftgroup/Agentx 仓库） | InfraX（sftgroup/infraX，`projects/payments/`） |
| 定位 | AgentX 平台**业务 SDK**（定制层，支付只是其能力之一） | **通用支付引擎**（微服务客户端，与 WAAS/MPC 平级） |
| 支付部分 | `SubscriptionPayments`（chain/fiat/x402 三轨封装 + MPP/A2A/Period/X402/Payments 协议客户端 **re-export**），保持 AgentX 既有 API 与行为 | 支付引擎本体：`PaymentsService` / 客户端 / `PaymentStore` 接缝 / db migrations，能力=链上+x402+法币+stablecoin+MPP+a2a-pay |
| 依赖方向 | **依赖** `@0xinfrax/payments@^0.1.0` | **零 AgentX 依赖**（仅 pg+viem，express optional peer） |
| 升级语义 | 升级 sdk = AgentX 业务能力升级（支付引擎跟随其内部版本） | 升级 payments = 支付引擎能力升级（bugfix / 新通道 / 新链） |
| 升级触发 | 应用方业务接入升级 `@agentxv2/sdk`（如 0.11.x） | AgentX 侧由 sdk/gateway 间接跟随；直接消费方自行管理版本（跟随 check-list） |

> 一句话：**`@agentxv2/sdk` 是 AgentX 卖给你的业务 SDK，`@0xinfrax/payments` 是它底下帮你接好的通用支付通道**——应用方只面对前者；后者由 AgentX 作为消费方负责跟随。

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

> **执行状态：✅ 全部完成（2026-08-10）**，对应 AgentX `docs/PROGRESS.md` R17 清单 A-E + F1 + F2（F2 已随 infraX 发布 `@0xinfrax/payments@0.1.1` 完成，见 §六）；**R17.5（`0.1.2` 剥离 a2a/period 应对、业务侧重建）与 R17.6（`0.1.3` 恢复后切换回模块委托）亦已完成**，详见 §六。

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

**R17.5 发布后通知结论（2026-08-10，`@agentxv2/sdk@0.11.2`）**：
- 本次为 patch（本地化 A2AClient/PeriodClient + `@0xinfrax/payments@0.1.2` exact），**业务 API / HTTP 契约完全不变**——B 端调用方无任何改动，升级为推荐项（可选，非阻塞）
- 本地依赖盘点（`aiservicer ^0.8.1`、`aihunter-saas/backend ^0.6.5`、`aitrader/backend ^0.6.4`、`autoops`/`pocketx-wallet-deploy` 无 sdk 依赖）：**全部未消费新支付引擎**（0.11.x 才引入 A2AClient/PeriodClient），不升级零影响——本次**不主动向 B 端调用方发升级通知**，仅在例行沟通中附带说明即可
- 已通知 **infraX**（0.1.2 剥离 a2a/period 的回应，issue #1 评论已发送，见 PROGRESS R17.5「infraX 通知文案」）

**R17.6 发布后通知结论（2026-08-10，`@agentxv2/sdk@0.11.3` + `@0xinfrax/payments@0.1.3`）**：
- 0.1.3 **恢复 a2a/period rails（模块内置）**，AgentX 切回模块委托——**业务 API / HTTP 契约逐字不变，B 端调用方零改动**；`npm install` 吸收 0.11.3 即可（锁精确版本者升级至 0.11.3）
- 唯一需知悉：曾用 **0.11.1 ESM 构建**（启动崩溃）的调用方必须升级 ≥0.11.2；`PAYMENT_VERSION` 0.1.2 → 0.1.3 仅当断言该常量时需感知

## 六、长期跟随策略（infraX 后续发版）

> **F2 首次跟随演练（✅ 2026-08-10）**：infraX 发布 `@0xinfrax/payments@0.1.1`（补丁版，新增 `createWebhookForwarder` + `rpcHeaders`）后，按下方 check-list 完整走通一遍：AgentX 升级依赖 `^0.1.1` → 解耦回归 19 项断言通过（`run-decouple.sh` 已改为消费**已安装的 npm 包** `gateway/node_modules/@0xinfrax/payments`，而非本地历史 `payments/`）→ sdk build+typecheck+32/32 → 发布 `@agentxv2/sdk@0.11.1`（tag `v0.11.1`，`PAYMENT_VERSION='0.1.1'`）→ gateway 升级 `^0.11.1`，build+typecheck+46/46。

> **R17.5 剥离跟随（✅ 2026-08-10，`@0xinfrax/payments@0.1.2`）**：0.1.2 按「通用引擎只提供通用通道」定位**移除 a2a rail 与 period 授权 rail**（行为变更）。AgentX 应对：sdk/gateway 依赖 `^0.1.1` → **`0.1.2`（exact，commit `6071ce6` 先锁 0.1.1 防静默拉到剥离版）** → 决策**业务侧重建**（gateway 自持 `payment_intents`/`payment_authorizations` 表（迁移 021）+ `A2APeriodService`，sdk 本地化 `A2AClient`/`PeriodClient`，HTTP 契约与 sdk API 不变）→ 发布 `@agentxv2/sdk@0.11.2`（依赖 0.1.2 exact）→ GitHub issue #1 留痕 + 评论回复 infraX 并请求协助评估。详见 AgentX `docs/PROGRESS.md` R17.5。

> **R17.6 恢复跟随（✅ 2026-08-10，`@0xinfrax/payments@0.1.3`）**：0.1.3 **恢复 a2a/period rails（模块内置）**并新增 batch/invite/transfer rails（回应 R17.5 评估）。AgentX **迁移回模块委托**：`services/payments-a2a-period.ts` 的 `createPayment('a2a')`/`a2aSettle`/`chargePeriod`/`getAuthorization` 改委托模块（保留自托管 `createPeriodAuthorization`，模块无公开创建接口）、`payments.ts` 注入模块 `PgAuthorizationStore`、`payments-bridge.ts` 新增 `recordIntent`/`updateIntentStatus` 审计 seam → 发布 `@agentxv2/sdk@0.11.3`（依赖 0.1.3，`A2AClient` 继续本地实现以规避 0.11.1 ESM 崩溃）→ 生产部署 + 自测全绿（`4648bb8` 修复委托路径禁用/缺参 500 → 优雅 4xx）。**B 端调用方零改动**。详见 AgentX `docs/PROGRESS.md` R17.6 与 root CHANGELOG.md。

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
