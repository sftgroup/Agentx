# AgentX Deployment Log

> 三端代码同步：本地 workspace ↔ 测试服务器 (43.156.78.59) ↔ GitHub (sftgroup/erc8004)
> 
> 最后更新: 2026-07-11 19:20 GMT+8
> 
> **Git MCP 标准流程**: 参照 [飞书文档](https://my.feishu.cn/docx/W34OddYBOouHo9xQk7IceV5Nnc2) — raw 端口 3088 处理大文件

---

## 部署环境

| 环境 | 地址 | 用途 |
|------|------|------|
| 测试服务器 | 43.156.78.59:8080 | Next.js production 预览 |
| GitHub | https://github.com/sftgroup/erc8004 | 代码仓库 |
| Git MCP | 43.156.46.187:3082 | 集中式代码仓库管理 |
| Git MCP Raw | 43.156.46.187:3088 | 大文件传输（无 64KB 限制） |
| Build MCP | 43.156.46.187:3081 | 构建服务（v2.0 异步模式） |
| 本地 Workspace | /home/ubuntu/workspace/agentx | 开发主副本 |

## Git MCP 标准流程

### 本地 → GitHub（推送代码）

```bash
# Step 1: 打包（排除 node_modules + .next）
tar czf /tmp/agentx.tar.gz --exclude=node_modules --exclude=.next -C /home/ubuntu/workspace agentx/

# Step 2: raw 端口上传（MCP tool 返回 upload_url，这里直接 curl）
curl -s --data-binary @/tmp/agentx.tar.gz http://43.156.46.187:3088/raw-upload/erc8004

# Step 3: MCP tool commit + sync
git__git_push(name="erc8004", message="type(scope): what changed")
git__git_sync(name="erc8004")
```

### GitHub → 本地（拉取代码）

```bash
# Step 1: 从 GitHub 拉取到 MCP
git__git_pull(name="erc8004")

# Step 2: 获取下载链接并下载
git__code_export(name="erc8004")
# → 返回 download_url

curl -o /tmp/erc8004.tar.gz http://43.156.46.187:3088/raw/erc8004
tar xzf /tmp/erc8004.tar.gz -C /home/ubuntu/workspace/agentx/
```

### 数据流方向

```
本地 Workspace ──curl 3088──▶ Git MCP ──MCP tool──▶ GitHub
本地 Workspace ◀─curl 3088──  Git MCP ◀──MCP tool── GitHub
```

## 三端代码结构

```
agentx/
├── sdk/           # @agentx/sdk — 加密/注册/A2A 模块库
├── frontend/      # Next.js 14 Web App (AgentX Platform)
│   ├── app/       # 11 个页面路由
│   │   ├── page.tsx                          # Landing
│   │   ├── marketplace/page.tsx              # 市场
│   │   ├── marketplace/agent/[id]/page.tsx   # Agent 详情
│   │   ├── studio/page.tsx                   # 创建向导
│   │   ├── a2a/page.tsx                      # A2A 任务
│   │   ├── dashboard/agent/page.tsx          # 开发者面板
│   │   ├── user/dashboard/page.tsx           # 用户面板
│   │   ├── user/chat/[agentId]/page.tsx     # 对话
│   │   ├── user/settings/page.tsx            # API 配置
│   │   ├── user/subscriptions/[id]/page.tsx  # 订阅详情
│   │   └── user/subscriptions/[id]/renew/page.tsx # 续费
│   ├── components/  # 布局组件 (Header/Sidebar/AppLayout) + Wallet + hooks
│   └── globals.css  # 全局 Glassmorphism Dark 样式
```

## 构建部署

### 完整链路

```
git_push → git_sync → build_npm → build_status → build_export → curl → deploy
```

### Build MCP v2.0 异步构建（推荐方式）

> 参照: [build-mcp 升级指南](https://www.feishu.cn/docx/C73sdKMwhowLVNxfyUYcMTkXnuc)
> 升级人: team5-architect | 生效: 2026-07-11

**四步异步流程**:

```javascript
// Step 1: 发起构建
const { id } = await build_npm({
  repoUrl: "https://github.com/sftgroup/erc8004.git",
  buildDir: "agentx/frontend"      // monorepo 子目录
});
// → { id: "a1b2c3d4", status: "started" }

// Step 2: 轮询（10-30s 间隔，最多 10 分钟）
for (let i = 0; i < 30; i++) {
  await sleep(20000);
  const { builds } = await build_status({ buildId: id });
  if (builds[0].status !== "running") { result = builds[0]; break; }
}

// Step 3: 导出产物
const { downloadUrl } = await build_export({ buildId: id });
// → { downloadUrl: "http://43.156.46.187:3088/build-artifact/a1b2c3d4.tar.gz" }

// Step 4: 下载 + 部署
exec: curl -o /tmp/build.tar.gz {downloadUrl}
exec: scp /tmp/build.tar.gz ubuntu@43.156.78.59:/tmp/
exec: ssh ubuntu@43.156.78.59 'tar xzf /tmp/build.tar.gz -C /home/ubuntu/agentx-platform/ && npx next start --port 8080'
```

**注意事项**:
- ⚠️ 不要快速轮询（10-30s 间隔）
- ⚠️ 不要并发构建（build-mcp 是单实例）
- ⚠️ v1.0 的 `result.artifactDir` 已废弃，必须用轮询
- 🧹 `build_clean(olderThanHours=48)` 定期清理

### 测试服务器直接构建（备用方式）

测试服务器 43.156.78.59 内存小（1.9G+4G swap），仅在 build MCP 不可用时使用：

```bash
sshpass -p 'Asdf1234!' ssh ubuntu@43.156.78.59 '
  kill $(lsof -ti:8080) 2>/dev/null; sleep 1
  cd /home/ubuntu/agentx-platform
  rm -rf .next
  NODE_OPTIONS="--max-old-space-size=1024" npx next build 2>&1 | tail -5
  echo "BUILD EXIT: $?"
  nohup npx next start --port 8080 --hostname 0.0.0.0 > /tmp/agentx-next.log 2>&1 &
'
```

### 上传到测试服务器

```bash
# 上传单个文件
sshpass -p 'Asdf1234!' scp app/xxx/page.tsx ubuntu@43.156.78.59:/home/ubuntu/agentx-platform/app/xxx/page.tsx

# 构建 + 启动
sshpass -p 'Asdf1234!' ssh ubuntu@43.156.78.59 '
  kill $(lsof -ti:8080) 2>/dev/null; sleep 1
  cd /home/ubuntu/agentx-platform
  rm -rf .next
  NODE_OPTIONS="--max-old-space-size=1024" npx next build
  nohup npx next start --port 8080 --hostname 0.0.0.0 > /tmp/agentx-next.log 2>&1 &
'
```

### 推送到 GitHub

```bash
# 1. 打包上传到 Git MCP
tar czf /tmp/agentx.tar.gz --exclude=node_modules --exclude=.next agentx/
curl -s --data-binary @/tmp/agentx.tar.gz http://43.156.46.187:3088/raw-upload/erc8004

# 2. git_push + git_sync
# (通过 MCP tool)
```

### 验证三端一致

```bash
for f in $(find agentx/frontend/app -name 'page.tsx' | sort); do
  rel=$(echo "$f" | sed 's|agentx/frontend/app/||')
  local_md5=$(md5sum "$f" | cut -d' ' -f1)
  remote_md5=$(sshpass -p 'Asdf1234!' ssh ubuntu@43.156.78.59 "md5sum /home/ubuntu/agentx-platform/app/$rel | cut -d' ' -f1")
  [ "$local_md5" = "$remote_md5" ] && echo "✅ $rel" || echo "❌ $rel"
done
```

## 设计系统

- **风格**: Glassmorphism Dark
- **背景**: `#09090B`
- **毛玻璃**: `bg-white/3` + `backdrop-blur-2xl` + `border-white/5`
- **主色**: `#A855F7` (紫) / `#06B6D4` (青) / `#3B82F6` (蓝)
- **强调**: 紫色渐变光晕 `bg-accent-purple/5 blur-[80px]`
- **字体**: Inter (Google Fonts)

## 已知限制

- **构建**: 测试服务器内存不足（1.9G），需 `NODE_OPTIONS="--max-old-space-size=1024"` + 4G swap
- **IPFS**: 需要 `NEXT_PUBLIC_PINATA_JWT` 环境变量才能走加密发布流程
- **钱包**: wagmi hooks 保留自 ERC8004 合约，链上功能依赖 `NEXT_PUBLIC_CONTRACT_ADDRESS` 等环境变量
- **SDK 发布**: `@agentx/sdk` 尚未 npm publish，Studio 发布流程用浏览器 SubtleCrypto 内联

## Commit 记录

### 2026-07-13 — 合约 v2/v3 + A2A + 审计 + npm

| SHA | 描述 |
|-----|------|
| `a099b06` | chore(sdk): rename to agentx-protocol + npm publish v0.2.0 |
| `3a4627a` | feat(sdk): A2A Skill execution — Agent Composition |
| `6f66010` | docs: full v3 contract + progress sync |
| `03b2993` | feat(contracts): deploy SubscriptionManager v3 to Sepolia |
| `41aede7` | fix(contracts): resolve 5 audit High findings — v3 |
| `3a5ca93` | test: autotest + security audit reports |
| `f29ff03` | docs(contracts): CONTRACTS.md |
| `002abd1` | feat(contracts): v2 deploy Sepolia + address updates |
| `e75ea4a` | docs: INTEGRATION.md |
| `a0070bd` | feat(frontend): useSubscription v2 rewrite |
| `d5dfa73` | feat(sdk): SubscriptionManager v2 sync |
| `12f0ae5` | feat(contracts): SubscriptionManager v2 |

### 2026-07-12-13 — P0/P1/P2/P3 功能开发

| SHA | 描述 |
|-----|------|
| `cc20db12` | feat: P2 #16 Studio 路由拆分 (4 子路由 + StudioContext) |
| `618810e3` | feat: P2 #14-17 + P3 #18-21 批量部署 |
| `128bfb9` | docs(sdk): README.md — API ref + architecture + quick start |
| `0b7313ff` | feat: P1 #10-11 Skill Schema + Reviews |
| `32b2853e` | feat: P1 #6-9 deploy (A2A index, Dashboard, Agents, Subscriptions) |
| `8bb862c9` | feat: P0 #1 Chat SDK E2E 加密链路 |

### 2026-07-12 前 — 基础建设

| SHA | 描述 |
|-----|------|
| `5233b1e` | refactor: Dashboard rewrite — pure Glassmorphism Dark |
| `b8242b3` | feat: Studio publish flow — AES + IPFS + on-chain mint |
| `27f2d18` | refactor: complete rewrite — pure Glassmorphism Dark (marketplace/agent/settings/subscriptions) |
| `38f5e41` | feat: Agent Studio — 4-step creation wizard |
| `3ec3902` | feat: 4 new pages — Glassmorphism Dark complete |
| `5c87913` | feat: redesigned Landing Page for AgentX |
| `bf31b60` | fix: RevenueDisplay Recharts Tooltip + next.config.js |
| `ef4709c` | refactor: Glassmorphism Dark rebrand |
