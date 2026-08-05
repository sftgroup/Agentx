# R13 外部项目方自助申请 API Key — 变更说明

> 适用提交：`e8689f7`（功能实现）+ `defc031`（边界修补）
> 变更日期：2026-08-06
> 分支：`main`（已合并并推送，远程同步）
> 状态：已上线生产

---

## 1. 需求背景

R11 建立了"多调用方接入配置管理"（`integration_partners` 表 + admin Integrations Tab），
但 key 由运营**线下手动签发**（`POST /api/v1/admin/integrations`），外部项目方缺少
**自助申请入口**——无法自行提交接入申请、无法获知审核进度、也没有对外的表单。

R13 目标：复用 P7-5 的 B 端申请模型（`partner_applications`）+ R11 的自动建租户/签发 key
逻辑，为外部项目方提供一条完整的自助链路：

```
项目方 → /apply 页提交申请 → admin 审批 → 自动创建集成租户 + 签发 agentx_ key
       → 运营线下分发 key（申请方无账号体系，沿用 R11 分发模式）
```

## 2. 变更概览

| 层 | 变更 | 提交 |
|---|---|---|
| 数据库 | migration 015：`partner_applications` 增加 `type` 判别字段 | `e8689f7` |
| Gateway | 新增公开端点 `POST /api/v1/developer/apply` | `e8689f7` |
| Gateway | `POST /admin/applications/:id/decide` 按 `type` 分流（developer 自动建租户 + 签发 key） | `e8689f7` |
| Gateway | admin `GET /applications` 返回 `type` 字段 | `e8689f7` |
| 前端 | `/apply` 双 Tab（渠道合作 / API 接入） | `e8689f7` |
| 前端 | admin Applications Tab 支持 developer 审批并展示一次性 key | `e8689f7` |
| 测试 | `gateway/test/developer.test.ts`（3 用例） | `e8689f7` |
| 边界修补 | ON CONFLICT 更新 `api_key`、slug 分配上限、全空格字段校验 | `defc031` |

## 3. 架构设计

### 3.1 type 判别字段

`partner_applications` 增加 `type TEXT NOT NULL DEFAULT 'channel'`，取值：

- `'channel'` — 渠道合作申请（P7-5 原有流程，approve → 建 channel）
- `'developer'` — API 接入申请（R13 新流程，approve → 自动建租户 + 签发 key + 注册 partner）

`DEFAULT 'channel'` 保证存量数据无需回填，老申请走原有 channel 逻辑不受影响。

### 3.2 审批分流

`POST /api/v1/admin/applications/:id/decide` 在事务内按 `app.type` 分流：

```
decision = 'approved'
├── app.type === 'developer'
│   ├── 1. 生成 slug（公司名 slugify，与既有 integration_partners 冲突时追加 -N，上限 50 次）
│   ├── 2. 生成 api_key（agentx_ + crypto.randomBytes(16).toString('hex')，39 字符）
│   ├── 3. 解析 enterprise plan（不存在则抛错回滚）
│   ├── 4. INSERT tenants（wallet=partner-<slug>，quota_daily=0，rpm=100，concurrent=10）
│   ├── 5. INSERT integration_partners（slug 唯一，gateway_url=PUBLIC_GATEWAY_URL）
│   ├── 6. UPDATE partner_applications → approved
│   └── 响应：{ api_key（仅此一次）, integration }；⚠ 明文 key 只在审批响应返回一次
└── 其他 → 原有 channel 创建逻辑不变
```

### 3.3 Key 生命周期

- 签发：`agentx_` + 32 hex，明文存储在 `tenants.api_key`（004 迁移惯例，与 JWT 注册租户一致）
- 分发：审批响应 `api_key` 一次性返回，运营复制后线下发给申请方（配合 `AGENTX_GATEWAY_URL`）
- 认证：调用方以 `X-Api-Key: <key>` 请求 gateway；`GET /api/v1/tenant/me` 返回租户 + 套餐信息
- 轮换/吊销：通过 admin Integrations Tab（R11 已有 rotate-key / delete）

## 4. 数据模型变更

**migration 015 `015_developer_applications.sql`**

```sql
ALTER TABLE partner_applications ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'channel';
CREATE INDEX IF NOT EXISTS idx_partner_applications_type ON partner_applications(type, status);
```

无破坏性变更；`IF NOT EXISTS` 支持重复执行。生产已执行。

## 5. API 变更

### 新增 `POST /api/v1/developer/apply`（公开，无需鉴权）

请求（snake_case）：

```json
{
  "company": "Acme Labs",
  "contact_name": "Jane",
  "contact_email": "jane@acme.io",
  "website": "https://acme.io",
  "description": "Trading signals bot"
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `company` | ✅ | trim 后非空，否则 400 |
| `contact_name` | ✅ | trim 后非空，否则 400 |
| `contact_email` | ✅ | trim 后非空，否则 400 |
| `website` / `description` | ❌ | 缺省映射为 NULL |

响应 `201`：

```json
{
  "application": { "id": "10", "company": "Acme Labs", "type": "developer", "status": "pending", "created_at": "..." }
}
```

### 扩展 `POST /api/v1/admin/applications/:id/decide`

新增响应形态（`type: 'developer'` 分支）：

```json
{
  "success": true,
  "decision": "approved",
  "type": "developer",
  "integration": { "id": "...", "slug": "acme-labs", "name": "Acme Labs", "gateway_url": "http://...:3090", "tenant_id": "...", "active": true },
  "api_key": "agentx_<32 hex>",
  "warning": "api_key is shown only on approval — store it in the caller's AGENTX_CONVERSATION_API_KEY"
}
```

channel 分支响应不变（`channelId`）。

### 扩展 `GET /api/v1/admin/applications`

SELECT 增加 `type` 列，admin 前端据此渲染类型徽标与审批按钮文案。

## 6. 前端变更

- **`/apply`**：双 Tab（Channel Partner / API Integration），按 kind 切换表单字段与提交端点；
  developer 表单提交至 `/api/v1/developer/apply`（snake_case body），成功页提示获批后由运营分发
  `AGENTX_GATEWAY_URL` + `AGENTX_CONVERSATION_API_KEY`。
- **admin Applications Tab**：Application 卡片显示类型徽标（API 紫 / Channel 青）；
  channel 专属字段（channel_id_hint / share_bps / wallet）仅 channel 类型展示；
  developer 类型审批按钮文案为 "Approve & Issue Key"，通过后弹出一次性 key 面板（复制分发）。

## 7. 边界情况分析与修复（`defc031`）

### 7.1 孤儿租户导致签发的 key 失效（真实漏洞，已修复）

**场景**：R11 `DELETE /admin/integrations/:id` 保留 tenant 审计。若某租户占用了 `partner-<slug>`
wallet（如曾删除的 partner 残留），developer 审批的 `INSERT ... ON CONFLICT (wallet_address)` 触发
但**只更新 `plan_id`，不更新 `api_key`** → 租户 key 保持旧值，新签发的 key 无法通过认证。

**修复**：`ON CONFLICT (wallet_address) DO UPDATE SET plan_id, api_key = EXCLUDED.api_key, updated_at = NOW()`。
同一缺陷存在于 R11 `POST /admin/integrations`，一并修复保持两处创建逻辑一致。

### 7.2 slug 分配无上限（防御性修复）

原 `for (let attempt = 1; ; attempt++)` 理论上可无限循环。现设 50 次上限，
超出抛错触发事务回滚（`could not allocate a unique partner slug`）。

### 7.3 全空格必填字段穿透校验（数据质量修复）

原校验 `!company` 对 `"   "`（truthy）放行，trim 后空字符串入库。现改为 trim 后校验，
全空格返回 400；新增单测覆盖。

### 7.4 已核查、无需处理的边界

| 边界 | 结论 |
|---|---|
| 存量数据 `type` 为空 | `DEFAULT 'channel'` + NOT NULL，安全走 channel 分支 |
| enterprise plan 缺失 | 抛错 → 事务 ROLLBACK → 500，无脏数据 |
| 重复审批 | `status !== 'pending'` 前置保护 |
| `api_key` UNIQUE 约束（004） | `agentx_` + 32 hex 随机，碰撞可忽略 |
| reject 路径 | developer 申请走通用 reject 分支 |
| `channel_id` / `share_bps` 误传 | developer 分支忽略（语义不适用） |
| 响应丢失 key | `COMMIT` 后 `res.json`，客户端未收到则不可恢复——设计使然，warning 已注明 |

## 8. 测试与验证

- **单测**：gateway 全量 **31/31 通过**（`developer.test.ts` 4 用例：缺字段 400 / 全空格 400 / 创建 201 含 trim / 可选字段映射 null）
- **类型检查**：`tsc --noEmit` 通过
- **构建**：gateway `tsc` + frontend `next build` 均成功
- **生产冒烟 4/4 PASS**：
  1. `developer/apply` → 创建 `type=developer` 申请（status=pending）
  2. admin approve → 返回 `type:'developer'` + `api_key`（39 字符）+ integration partner
  3. 新 key 经 `GET /tenant/me` → 200（enterprise plan · rpm=100 · concurrent=10 · quota_daily=5,000,000）
  4. channel 申请/审批回归 → 返回 `channelId`，无影响
- smoke 测试数据已清理（partner_applications / integration_partners / tenants 均无残留）

## 9. 生产部署记录

| 项 | 说明 |
|---|---|
| migration 015 | 已执行（`ALTER TABLE` + `CREATE INDEX`） |
| `.env` | 已追加 `PUBLIC_GATEWAY_URL` |
| gateway dist | `admin.js` / `developer.js` / `config.js` / `index.js` 已上传，`pm2 restart agentx-gateway` |
| 前端 | 生产 `git pull` 至 `defc031` 后 `next build` + `pm2 restart agentx-frontend` |
| 生产验证 | `http://<host>:3100/apply` HTTP 200；静态产物含双 Tab（API Integration） |

## 10. 运维注意事项

1. **key 仅展示一次**：审批响应是明文 key 的唯一获取点，务必在响应页复制；丢失需走 admin
   Integrations Tab 的 rotate-key 重新签发。
2. **申请方无账号体系**：key 需运营线下分发，配合 `AGENTX_GATEWAY_URL` 一起提供
   （环境变量：`AGENTX_GATEWAY_URL` + `AGENTX_CONVERSATION_API_KEY`）。
3. **删除 partner 保留租户**：如需彻底回收，需同时删除对应 `tenants` 行；否则同 slug 重新
   审批会触发 `ON CONFLICT`（现已正确更新 key）。
4. **并发审批同名公司**：两个并发事务可能复用 slug（partner 行 ON CONFLICT 收敛），
   后提交者覆盖 `tenant_id`——admin 并发审批概率极低，可接受。
5. **enterprise plan 为审批硬依赖**：`plans` 表缺少 `enterprise` 时审批返回 500，
   需先确保平台套餐数据完整。

## 11. 相关文档

- [PROGRESS.md](PROGRESS.md) — R13 需求章节（已更新为"已上线" + 冒烟记录）
- [integration-callers.md](integration-callers.md) — 调用方接入指南
- [CHANGELOG.md](../CHANGELOG.md) — 变更记录
- [gateway/test/developer.test.ts](../gateway/test/developer.test.ts) — 单测
- [gateway/src/routes/developer.ts](../gateway/src/routes/developer.ts) — 申请端点实现
- [gateway/db/migrations/015_developer_applications.sql](../gateway/db/migrations/015_developer_applications.sql) — 数据模型
