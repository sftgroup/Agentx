#!/usr/bin/env node
/**
 * ua-layers-build.js — 从 ua-arch-input.json 生成 layers.json（架构层分配）
 * 规则基于目录/类型/ID 模式，逐层分配并做全量校验。
 */
'use strict';
const fs = require('fs');

const INPUT = '/home/steven/Agentx/.ua/tmp/ua-arch-input.json';
const OUTPUT = '/home/steven/Agentx/.ua/intermediate/layers.json';

const input = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const nodes = input.fileNodes;

function resolvePath(node) {
  if (node.filePath && node.filePath.trim()) return node.filePath.trim();
  const id = node.id || '';
  const type = node.type || 'file';
  const prefixes = ['file:', 'config:', 'document:', 'schema:', 'service:', 'pipeline:', 'resource:', 'endpoint:', 'table:'];
  for (const p of prefixes) {
    if (id.startsWith(p)) {
      const rest = id.slice(p.length);
      if (type === 'table') { const i = rest.lastIndexOf(':'); return i > 0 ? rest.slice(0, i) : rest; }
      if (rest && !/^node-\d+-\d+$/.test(rest) && !/^[0-9a-f]{12}$/.test(rest)) return rest;
    }
  }
  return null;
}

const nodePath = new Map(nodes.map((n) => [n.id, resolvePath(n)]));

// 旧图继承的 node-18 系列划分（frontend 17 / deploy 8），与 previous-layers.json 一致
const NODE18_FRONTEND = new Set([
  'file:node-18-1', 'file:node-18-7', 'file:node-18-10', 'file:node-18-12', 'file:node-18-15',
  'file:node-18-18', 'file:node-18-21', 'file:node-18-30', 'file:node-18-42', 'file:node-18-43',
  'file:node-18-48', 'file:node-18-74', 'file:node-18-79', 'file:node-18-83', 'file:node-18-84',
  'file:node-18-85', 'file:node-18-86',
]);
const NODE18_DEPLOY = new Set([
  'file:node-18-87', 'file:node-18-90', 'file:node-18-93', 'file:node-18-98',
  'file:node-18-99', 'file:node-18-102', 'file:node-18-105', 'file:node-18-106',
]);

// 校验 node-18 划分与节点元数据一致
for (const id of [...NODE18_FRONTEND]) {
  const n = nodes.find((x) => x.id === id);
  if (!n) throw new Error('missing node ' + id);
  if ((n.tags || []).some((t) => t === 'deploy-script' || t === 'ssh')) {
    throw new Error(`node-18 frontend 划分冲突: ${id} tags=${JSON.stringify(n.tags)}`);
  }
}
for (const id of [...NODE18_DEPLOY]) {
  const n = nodes.find((x) => x.id === id);
  if (!n) throw new Error('missing node ' + id);
  const tags = n.tags || [];
  if (!(tags.includes('deploy-script') || tags.includes('ssh') || tags.includes('python'))) {
    throw new Error(`node-18 deploy 划分冲突: ${id} tags=${JSON.stringify(tags)}`);
  }
}
// node-18 全集必须与输入一致
const node18All = nodes.filter((n) => /^file:node-18-\d+$/.test(n.id)).map((n) => n.id);
const node18Expect = [...NODE18_FRONTEND, ...NODE18_DEPLOY].sort();
if (JSON.stringify([...node18All].sort()) !== JSON.stringify(node18Expect)) {
  throw new Error('node-18 集合与输入不一致: ' + JSON.stringify(node18All));
}

const st = (n) => nodePath.get(n.id);

const assign = (pred, layerId) => {
  const ids = nodes.filter((n) => pred(n) && !assigned.has(n.id)).map((n) => n.id).sort();
  assignedLayers.set(layerId, ids);
  for (const id of ids) assigned.add(id);
  return ids;
};
const assigned = new Set();
const assignedLayers = new Map();

const L = {
  contracts: (n) => (st(n) || '').startsWith('contracts/'),
  sdk: (n) => (st(n) || '').startsWith('sdk/') && n.id !== 'document:sdk/README.md',
  gateway: (n) => {
    const p = st(n) || '';
    return p.startsWith('gateway/src/') || p.startsWith('gateway/test/') ||
      ['gateway/package.json', 'gateway/tsconfig.json', 'gateway/.env.example'].includes(p);
  },
  'conversation-service': (n) => {
    const p = st(n) || '';
    return p.startsWith('conversation-service/src/') ||
      ['conversation-service/package.json', 'conversation-service/.env.example'].includes(p);
  },
  database: (n) => {
    const p = st(n) || '';
    return n.type === 'table' || n.type === 'schema' ||
      p.startsWith('gateway/db/migrations/') || p.startsWith('conversation-service/migrations/');
  },
  'deploy-scripts': (n) => {
    const p = st(n) || '';
    return p.startsWith('gateway/deploy/') || p.startsWith('scripts/') || p.startsWith('.github/') ||
      p === 'frontend/deploy.sh' || p === 'gateway/e2e_wallet.js' ||
      NODE18_DEPLOY.has(n.id) || /^file:node-19-\d+$/.test(n.id) || /^file:node-20-\d+$/.test(n.id);
  },
  frontend: (n) => {
    const p = st(n) || '';
    return (p.startsWith('frontend/') && p !== 'frontend/deploy.sh') || NODE18_FRONTEND.has(n.id);
  },
  docs: (n) => {
    const p = st(n) || '';
    return n.type === 'document' && !p.startsWith('contracts/') && n.id !== 'document:sdk/UPGRADE.md';
  },
};

// 按顺序分配
assign(L.contracts, 'layer:contracts');
assign(L.sdk, 'layer:sdk');
assign(L.gateway, 'layer:gateway');
assign(L['conversation-service'], 'layer:conversation-service');
assign(L.database, 'layer:database');
assign(L['deploy-scripts'], 'layer:deploy-scripts');
assign(L.frontend, 'layer:frontend');
assign(L.docs, 'layer:docs');

// ---------- 校验 ----------
const allIds = new Set(nodes.map((n) => n.id));
const unassigned = nodes.filter((n) => !assigned.has(n.id));
if (unassigned.length > 0) {
  throw new Error('未分配节点: ' + unassigned.map((n) => n.id).join(', '));
}
// 重复校验
const seen = new Set();
for (const [layerId, ids] of assignedLayers) {
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`节点重复: ${id}`);
    seen.add(id);
  }
}
// 悬空引用校验
for (const [layerId, ids] of assignedLayers) {
  for (const id of ids) if (!allIds.has(id)) throw new Error(`悬空节点 ${id} in ${layerId}`);
}
// 数量校验
const total = nodes.length;
let sum = 0;
for (const ids of assignedLayers.values()) sum += ids.length;
if (sum !== total) throw new Error(`数量不匹配: 分配 ${sum} != 输入 ${total}`);
for (const [layerId, ids] of assignedLayers) {
  if (ids.length === 0) throw new Error('空层: ' + layerId);
}

// ---------- 输出 ----------
const layers = [
  {
    id: 'layer:contracts',
    name: '智能合约层',
    description: '包含 contracts/ 目录下的 Solidity 智能合约源码（ERC-8004 身份注册核心与接口）、Foundry 开发配置（foundry.toml、.solhint.json）、Foundry 部署脚本 DeployOxaChain.s.sol 以及合约说明文档 CONTRACTS.md。',
  },
  {
    id: 'layer:sdk',
    name: 'SDK 层',
    description: '包含 sdk/ 目录下的 TypeScript SDK：agent 运行器、agent-loop（loop/executor/tool-builder/a2a-daemon）、llm 提供方（openai/gateway factory）、ipfs、mcp 连接器、reputation、subscription（含 agent-x402 周期支付）、payment（统一支付端点 payments.ts 及 a2a-client、period-client）、react hooks、configuration、endpoint、a2a、registry、skills、memory、conversation 客户端，各模块 barrel 入口、package.json / tsconfig.json 配置及 UPGRADE 升级文档。',
  },
  {
    id: 'layer:gateway',
    name: '网关后端层',
    description: '包含 gateway/ 目录下基于 Express 的网关服务端代码：路由（agents、chat、a2a、admin、admin-finance、tenant、skills、agent-runs、agent-mcp、mcp、mcp-executor、chat-tasks、payments）、中间件（auth、adminAuth、rate-limiter、error-handler）、服务（a2a-worker、agent-indexer、agent-access、chain-data-reader、conversation-proxy、payments、payments-a2a-period、payments-bridge）、工具库（db、crypto、constants）、入口 index.ts、配置（package.json、tsconfig.json、.env.example）及网关测试（test/mcp.test.ts）。',
  },
  {
    id: 'layer:conversation-service',
    name: '对话服务层',
    description: '包含 conversation-service/ 目录下的多租户对话与 Agent 执行服务：路由（runs、tenants）、服务（agent-runner、memory-engine、tool-executor、agent-context-loader、tenant-llm-resolver）、工具库（crypto、db）、入口 index.ts、配置 config.ts、.env.example 与 package.json。',
  },
  {
    id: 'layer:frontend',
    name: '前端层',
    description: '包含 frontend/ 目录下的 Next.js 前端应用：App Router 页面（首页、marketplace、studio、user dashboard、admin、a2a、ipfs 上传接口等）、组件（agent dashboard、studio、wallet、layout、providers、chat、guard、aimarket）、hooks、lib（ipfs、i18n、wagmi）、合约 ABI 定义与配置文件，以及旧版遗留的 frontend 相关无路径节点（node-18 系列）。',
  },
  {
    id: 'layer:database',
    name: '数据库层',
    description: '包含网关与对话服务的数据库迁移 SQL（gateway/db/migrations、conversation-service/migrations，含 020_agents_category.sql、021_payments_a2a_period_selfhost.sql 与 001_memory.sql）与核心数据表（tenants、plans、agents、platform_api_keys、tenant_api_keys、usage_logs、chat_messages、a2a_task_results、memories、payment_intents、payment_authorizations 等）。',
  },
  {
    id: 'layer:deploy-scripts',
    name: '部署与脚本层',
    description: '包含部署与运维脚本：gateway/deploy/ 下的 shell 与 Python 脚本及 .env.deploy.example、gateway/e2e_wallet.js、frontend/deploy.sh、SDK 发布 CI/CD 工作流（.github/workflows/publish-sdk.yml）、scripts/local-payments 本地支付流程脚本，以及无路径的 Python 部署/SSH 运维脚本节点（node-18/19/20 系列）。',
  },
  {
    id: 'layer:docs',
    name: '文档层',
    description: '包含项目根目录的各类文档（README、DEPLOYMENT、INTEGRATION、MCP_SETUP、CONVERSATION_SERVICE、CODE_REVIEW_REPORT、FRONTEND_PRD、PROPOSAL、TOOLS-NOTES、CHANGELOG）、docs/ 目录文档（PROGRESS、code-review-2026-08-11、payments-infrax-migration、integration-callers、publish-subscribe-pay）、memory/ 进度文档、sdk/README.md 以及 test-reports/ 测试报告文档。',
  },
].map((layer) => ({ ...layer, nodeIds: assignedLayers.get(layer.id) }));

fs.mkdirSync('/home/steven/Agentx/.ua/intermediate', { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(layers, null, 2));
console.log(`OK: wrote ${OUTPUT}`);
for (const l of layers) console.log(`  ${l.id}  ${l.name}: ${l.nodeIds.length} files`);
console.log(`TOTAL: ${sum} / ${total}`);
