#!/usr/bin/env node
/**
 * AgentX 架构层分配脚本（R17.6 增量更新）
 * 沿用 previous-layers.json 的 8 个层（id/name 不变），
 * 保留既有节点，分配新增节点，交叉校验后写出 layers.json
 */
const fs = require('fs');

const INPUT = '/home/steven/Agentx/.ua/tmp/ua-arch-input.json';
const PREV = '/home/steven/Agentx/.ua/tmp/previous-layers.json';
const OUT = '/home/steven/Agentx/.ua/intermediate/layers.json';

const input = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const prevLayers = JSON.parse(fs.readFileSync(PREV, 'utf8'));
const allIds = new Set(input.fileNodes.map(n => n.id));
if (allIds.size !== input.fileNodes.length) {
  console.error(`输入中存在重复节点 ID：${input.fileNodes.length} 条记录 / ${allIds.size} 个唯一 ID`);
  process.exit(1);
}

/** R17.6 新增节点 → 层分配（按目录分组归属） */
const ADDITIONS = {
  'layer:gateway': [
    'file:gateway/src/services/payments-bridge.ts',
    'service:gateway/src/services/payments.ts:paymentsService',
    'file:gateway/src/routes/chat-tasks.ts',
    'file:gateway/src/services/agent-access.ts'
  ],
  'layer:deploy-scripts': ['file:.github/workflows/publish-sdk.yml'],
  'layer:database': [
    'file:gateway/db/migrations/020_agents_category.sql',
    'file:conversation-service/migrations/001_memory.sql'
  ],
  'layer:contracts': ['file:contracts/script/DeployOxaChain.s.sol'],
  'layer:sdk': ['file:sdk/src/payment/payments.ts'],
  'layer:docs': ['document:docs/integration-callers.md', 'document:docs/publish-subscribe-pay.md'],
  'layer:frontend': [],
  'layer:conversation-service': []
};

/** 各层 description（中文，项目特指，按 R17.6 结构微调） */
const DESCRIPTIONS = {
  'layer:contracts': '包含 contracts/ 目录下的 Solidity 智能合约源码（ERC-8004 身份注册核心与接口）、Foundry 开发配置（foundry.toml、.solhint.json）、Foundry 部署脚本 DeployOxaChain.s.sol 以及合约说明文档 CONTRACTS.md。',
  'layer:sdk': '包含 sdk/ 目录下的 TypeScript SDK：agent 运行器、agent-loop、llm 提供方、ipfs、mcp 连接器、reputation、subscription（x402）、payment（统一支付端点 payments.ts 及 x402/fiat 客户端 a2a-client、period-client）、react hooks、configuration、endpoint、a2a、registry、skills、memory、conversation 客户端，各模块 barrel 入口、package.json / tsconfig.json 配置及 UPGRADE 升级文档。',
  'layer:gateway': '包含 gateway/ 目录下基于 Express 的网关服务端代码：路由（agents、chat、a2a、admin、tenant、skills、agent-runs、mcp、chat-tasks、payments）、中间件（auth、adminAuth、rate-limiter、error-handler）、服务（a2a-worker、agent-indexer、conversation-proxy、agent-access、payments、payments-a2a-period、payments-bridge）、工具库（db、crypto）以及 package.json、tsconfig.json、.env.example 等配置。',
  'layer:conversation-service': '包含 conversation-service/ 目录下的多租户对话与 Agent 执行服务：路由（runs、tenants）、服务（agent-runner、memory-engine、tool-executor、agent-context-loader、tenant-llm-resolver）、入口 index.ts、配置及 .env.example、package.json。',
  'layer:frontend': '包含 frontend/ 目录下的 Next.js 前端应用：App Router 页面（首页、marketplace、studio、user dashboard、admin、a2a、ipfs 上传接口等）、组件（agent dashboard、studio、wallet、layout、providers、chat、guard、aimarket）、hooks、lib（ipfs、i18n、wagmi）、合约 ABI 定义与配置文件，以及旧版遗留的 frontend 相关无路径节点（node-18 系列）。',
  'layer:database': '包含网关与对话服务的数据库迁移 SQL（gateway/db/migrations、conversation-service/migrations，含 R17.6 新增的 agents 分类迁移 020_agents_category.sql 与 memory 表初始化 001_memory.sql）与核心数据表（tenants、plans、agents、platform_api_keys、tenant_api_keys、usage_logs、chat_messages、a2a_task_results、memories 等）。',
  'layer:deploy-scripts': '包含部署与运维脚本：gateway/deploy/ 下的 shell 与 Python 脚本、frontend/deploy.sh、SDK 发布 CI/CD 工作流（.github/workflows/publish-sdk.yml）、scripts/local-payments 本地支付流程脚本，以及无路径的 Python 部署/SSH 运维脚本节点（node 系列）。',
  'layer:docs': '包含项目根目录的各类文档（README、DEPLOYMENT、INTEGRATION、MCP_SETUP、CONVERSATION_SERVICE、CODE_REVIEW_REPORT、FRONTEND_PRD、PROPOSAL、TOOLS-NOTES、CHANGELOG）、docs/ 目录文档（PROGRESS、payments-infrax-migration、integration-callers、publish-subscribe-pay）、memory/ 进度文档、sdk/README.md 以及 test-reports/ 测试报告文档及其章节节点。'
};

const layers = prevLayers.map(prev => {
  const nodeIds = prev.nodeIds.filter(id => allIds.has(id));
  for (const add of ADDITIONS[prev.id] || []) nodeIds.push(add);
  return {
    id: prev.id,
    name: prev.name,
    description: DESCRIPTIONS[prev.id] || prev.description,
    nodeIds
  };
});

// ---------- 交叉校验 ----------
const assigned = new Map();
let total = 0;
const seen = new Set();
const errors = [];
for (const l of layers) {
  for (const id of l.nodeIds) {
    total++;
    if (!allIds.has(id)) errors.push(`非法节点 ID（不在输入中）：${id}（层 ${l.id}）`);
    if (seen.has(id)) errors.push(`重复分配：${id}`);
    seen.add(id);
  }
  assigned.set(l.id, l.nodeIds.length);
}
if (total !== allIds.size) errors.push(`节点总数 ${total} ≠ 输入节点数 ${allIds.size}`);
for (const id of allIds) {
  if (!seen.has(id)) errors.push(`未分配节点：${id}`);
}

if (errors.length) {
  console.error('校验失败：');
  for (const e of errors.slice(0, 20)) console.error(' - ' + e);
  process.exit(1);
}

fs.mkdirSync('/home/steven/Agentx/.ua/intermediate', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(layers, null, 2) + '\n', 'utf8');
console.log(`校验通过：${total} 个节点，${layers.length} 个层 -> ${OUT}`);
for (const l of layers) console.log(`  ${l.id} (${l.name}): ${l.nodeIds.length}`);
process.exit(0);
