#!/usr/bin/env node
/**
 * ua-arch-analyze.js — 架构层分析的确定性证据计算脚本
 *
 * 用法: node ua-arch-analyze.js <input-json> <output-json>
 *
 * 计算内容:
 *  1. directoryGrouping        — 按目录(顶层目录)分组
 *  2. nodeTypeGrouping         — 按节点类型分组
 *  3. importAdjacency          — import 边 fan-in / fan-out
 *  4. crossCategoryMatrix      — 跨类别依赖矩阵 (sourceType × edgeType × targetType)
 *  5. interGroupImportMatrix   — 目录组之间的 import 频次矩阵
 *  6. intraGroupDensity        — 组内 import 密度
 *  7. dirPatternMatching       — 目录模式匹配 → 建议层
 *  8. deploymentTopology       — 部署拓扑检测 (deploys/serves/provisions/triggers + deploy 目录)
 *  9. dependencyDirection      — 依赖方向 (净导入/净导出)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const INPUT_PATH = process.argv[2];
const OUTPUT_PATH = process.argv[3];

if (!INPUT_PATH || !OUTPUT_PATH) {
  console.error('Usage: node ua-arch-analyze.js <input-json> <output-json>');
  process.exit(1);
}

let input;
try {
  input = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
} catch (err) {
  console.error('Failed to read/parse input JSON:', err.message);
  process.exit(1);
}

const fileNodes = Array.isArray(input.fileNodes) ? input.fileNodes : [];
const importEdges = Array.isArray(input.importEdges) ? input.importEdges : [];
const allEdges = Array.isArray(input.allEdges) ? input.allEdges : [];

const nodeById = new Map(fileNodes.map((n) => [n.id, n]));

/** 解析节点的真实路径: 优先 filePath, 否则从 ID 推断 */
function resolvePath(node) {
  if (node.filePath && node.filePath.trim()) return node.filePath.trim();
  const id = node.id || '';
  const type = node.type || 'file';
  const prefixes = ['file:', 'config:', 'document:', 'schema:', 'service:', 'pipeline:', 'resource:', 'endpoint:', 'table:'];
  for (const p of prefixes) {
    if (id.startsWith(p)) {
      const rest = id.slice(p.length);
      if (type === 'table') {
        // table:<path>:<name> 或 table:<name>
        const idx = rest.lastIndexOf(':');
        if (idx > 0) return rest.slice(0, idx);
        return rest;
      }
      if (rest && !/^node-\d+-\d+$/.test(rest) && !/^[0-9a-f]{12}$/.test(rest)) return rest;
    }
  }
  return null;
}

/** 顶层目录: 有 / 取第一段, 否则 'root' */
function topDir(node) {
  const p = resolvePath(node);
  if (!p) return '__unresolved__';
  const idx = p.indexOf('/');
  if (idx === -1) return 'root';
  return p.slice(0, idx);
}

// ---------- 1. 目录分组 ----------
const dirGroups = new Map(); // dir -> {nodeIds:Set, byType:{}}
for (const n of fileNodes) {
  const dir = topDir(n);
  if (!dirGroups.has(dir)) dirGroups.set(dir, { nodeIds: new Set(), byType: {} });
  const g = dirGroups.get(dir);
  g.nodeIds.add(n.id);
  g.byType[n.type] = (g.byType[n.type] || 0) + 1;
}

// 未解析节点的 ID 模式子分组
const unresolvedPattern = {};
for (const n of fileNodes) {
  if (topDir(n) !== '__unresolved__') continue;
  const id = n.id || '';
  let pat = 'other';
  if (/^file:node-(\d+)-/.test(id)) pat = 'file:node-' + id.match(/^file:node-(\d+)-/)[1] + '-*';
  else if (/^node-(\d+)-/.test(id)) pat = 'node-' + id.match(/^node-(\d+)-/)[1] + '-*';
  else if (/^file:[0-9a-f]{12}$/.test(id)) pat = 'file:<hash12>';
  unresolvedPattern[pat] = (unresolvedPattern[pat] || 0) + 1;
}

// ---------- 2. 节点类型分组 ----------
const typeGroups = {};
for (const n of fileNodes) {
  typeGroups[n.type] = typeGroups[n.type] || { count: 0, nodeIds: [] };
  typeGroups[n.type].count++;
  typeGroups[n.type].nodeIds.push(n.id);
}

// ---------- 3. import 邻接 (fan-in / fan-out) ----------
const fanIn = new Map();
const fanOut = new Map();
for (const e of importEdges) {
  fanOut.set(e.source, (fanOut.get(e.source) || 0) + 1);
  fanIn.set(e.target, (fanIn.get(e.target) || 0) + 1);
}
const fanInArr = [...fanIn.entries()].map(([id, c]) => ({ id, count: c, name: (nodeById.get(id) || {}).label }));
const fanOutArr = [...fanOut.entries()].map(([id, c]) => ({ id, count: c, name: (nodeById.get(id) || {}).label }));
fanInArr.sort((a, b) => b.count - a.count);
fanOutArr.sort((a, b) => b.count - a.count);

// ---------- 4. 跨类别依赖矩阵 ----------
const crossMatrix = {}; // key: "srcType|edgeType|tgtType" -> count
for (const e of allEdges) {
  const s = nodeById.get(e.source);
  const t = nodeById.get(e.target);
  const st = s ? s.type : 'unknown';
  const tt = t ? t.type : 'unknown';
  const key = `${st}|${e.type}|${tt}`;
  crossMatrix[key] = (crossMatrix[key] || 0) + 1;
}

// ---------- 5. 组间 import 频次矩阵 ----------
const groupOfNode = (id) => (nodeById.has(id) ? topDir(nodeById.get(id)) : '__unresolved__');
const groupImportMatrix = {}; // fromDir -> toDir -> count
for (const e of importEdges) {
  const from = groupOfNode(e.source);
  const to = groupOfNode(e.target);
  if (from === to) continue; // 组内单独统计
  groupImportMatrix[from] = groupImportMatrix[from] || {};
  groupImportMatrix[from][to] = (groupImportMatrix[from][to] || 0) + 1;
}

// ---------- 6. 组内 import 密度 ----------
const intraDensity = [];
for (const [dir, g] of dirGroups) {
  const ids = [...g.nodeIds];
  const n = ids.length;
  let internalEdges = 0;
  for (const e of importEdges) {
    if (groupOfNode(e.source) === dir && groupOfNode(e.target) === dir) internalEdges++;
  }
  const maxPossible = n > 1 ? (n * (n - 1)) / 2 : 0;
  intraDensity.push({
    dir,
    nodeCount: n,
    internalImportEdges: internalEdges,
    maxPossiblePairs: maxPossible,
    density: maxPossible > 0 ? +(internalEdges / maxPossible).toFixed(4) : 0,
  });
}
intraDensity.sort((a, b) => b.density - a.density);

// ---------- 7. 目录模式匹配 ----------
const PATTERN_RULES = [
  { re: /(^|\/)routes(\/|$)/, layer: 'api', label: 'API 路由' },
  { re: /(^|\/)services(\/|$)/, layer: 'service', label: '业务服务' },
  { re: /(^|\/)middleware(\/|$)/, layer: 'middleware', label: '中间件' },
  { re: /(^|\/)hooks(\/|$)/, layer: 'hooks', label: 'React hooks' },
  { re: /(^|\/)deploy(\/|$)/, layer: 'infrastructure', label: '部署基础设施' },
  { re: /(^|\/)migrations(\/|$)/, layer: 'database', label: '数据库迁移' },
  { re: /(^|\/)docs(\/|$)/, layer: 'documentation', label: '文档' },
  { re: /(^|\/)contracts(\/|$)/, layer: 'blockchain', label: '智能合约' },
  { re: /(^|\/)components(\/|$)/, layer: 'frontend-components', label: '前端组件' },
  { re: /(^|\/)app(\/|$)/, layer: 'frontend-app', label: '前端页面' },
  { re: /(^|\/)abis(\/|$)/, layer: 'blockchain-abis', label: '合约 ABI' },
  { re: /(^|\/)lib(\/|$)/, layer: 'library', label: '工具库' },
  { re: /(^|\/)test(s)?(\/|$)/, layer: 'test', label: '测试' },
  { re: /(^|\/)\.github(\/|$)/, layer: 'ci-cd', label: 'CI/CD' },
  { re: /(^|\/)script(s)?(\/|$)/, layer: 'scripts', label: '运维脚本' },
];
const dirPattern = [];
for (const dir of dirGroups.keys()) {
  const hits = [];
  for (const r of PATTERN_RULES) {
    if (r.re.test('/' + dir + '/')) hits.push({ pattern: r.re.source, layer: r.layer, label: r.label });
  }
  dirPattern.push({ dir, matched: hits.length ? hits : null });
}

// ---------- 8. 部署拓扑检测 ----------
const infraEdgeTypes = ['deploys', 'serves', 'provisions', 'triggers'];
const deployEdges = allEdges.filter((e) => infraEdgeTypes.includes(e.type));
const deployTopology = {
  infraEdgeTypesFound: {},
  edges: deployEdges.map((e) => ({
    source: e.source,
    sourceName: (nodeById.get(e.source) || {}).label,
    sourceDir: groupOfNode(e.source),
    target: e.target,
    targetName: (nodeById.get(e.target) || {}).label,
    targetDir: groupOfNode(e.target),
    type: e.type,
  })),
  deployDirFiles: [],
};
for (const e of allEdges) {
  deployTopology.infraEdgeTypesFound[e.type] = (deployTopology.infraEdgeTypesFound[e.type] || 0) + 1;
}
for (const n of fileNodes) {
  const p = resolvePath(n);
  if (p && (/(^|\/)deploy(\/|$)/.test('/' + p + '/') || /deploy(\.|_)/.test(path.basename(p)) || p.startsWith('.github/workflows/'))) {
    deployTopology.deployDirFiles.push({ id: n.id, filePath: p, type: n.type });
  }
}

// ---------- 9. 依赖方向 ----------
const dirImportCounts = {}; // dir -> {in, out}
for (const e of importEdges) {
  const from = groupOfNode(e.source);
  const to = groupOfNode(e.target);
  dirImportCounts[from] = dirImportCounts[from] || { in: 0, out: 0 };
  dirImportCounts[to] = dirImportCounts[to] || { in: 0, out: 0 };
  dirImportCounts[from].out++;
  dirImportCounts[to].in++;
}
const dependencyDirection = Object.entries(dirImportCounts).map(([dir, c]) => ({
  dir,
  importsOut: c.out,
  importsIn: c.in,
  net: c.out - c.in,
  role: c.out - c.in > 0 ? 'provider(被依赖方)' : c.out - c.in < 0 ? 'consumer(依赖方)' : 'neutral',
}));
dependencyDirection.sort((a, b) => b.net - a.net);

// ---------- 汇总输出 ----------
const results = {
  summary: {
    totalFileNodes: fileNodes.length,
    totalImportEdges: importEdges.length,
    totalAllEdges: allEdges.length,
    edgeTypes: allEdges.reduce((a, e) => { a[e.type] = (a[e.type] || 0) + 1; return a; }, {}),
    nodeTypes: fileNodes.reduce((a, n) => { a[n.type] = (a[n.type] || 0) + 1; return a; }, {}),
  },
  directoryGrouping: Object.fromEntries(
    [...dirGroups.entries()].map(([dir, g]) => [dir, { count: g.nodeIds.size, byType: g.byType, nodeIds: [...g.nodeIds].sort() }])
  ),
  unresolvedPatterns: unresolvedPattern,
  nodeTypeGrouping: typeGroups,
  importAdjacency: { topFanIn: fanInArr.slice(0, 25), topFanOut: fanOutArr.slice(0, 25), fanInCount: fanIn.size, fanOutCount: fanOut.size },
  crossCategoryMatrix: crossMatrix,
  interGroupImportMatrix: groupImportMatrix,
  intraGroupDensity: intraDensity,
  dirPatternMatching: dirPattern,
  deploymentTopology: deployTopology,
  dependencyDirection,
};

try {
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
  console.log(`OK: wrote ${OUTPUT_PATH} (${fileNodes.length} nodes, ${importEdges.length} imports, ${allEdges.length} edges)`);
  process.exit(0);
} catch (err) {
  console.error('Failed to write output JSON:', err.message);
  process.exit(1);
}
