#!/usr/bin/env node
/**
 * AgentX 架构结构分析脚本（R17.6 增量更新）
 * 读取 ua-arch-input.json，输出结构统计到 ua-arch-results.json
 */
const fs = require('fs');

const [,, inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error('用法: node ua-arch-analyze.js <input.json> <output.json>');
  process.exit(1);
}

const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const { fileNodes = [], importEdges = [], allEdges = [] } = input;
const nodes = fileNodes;
const ids = new Set(nodes.map(n => n.id));

/** 兼容 filePath/path 两种 schema */
const pathOf = n => n.filePath || n.path || null;

/** 目录分组键：优先路径前 2 段；特殊根目录取单段；无路径按 ID 启发式 */
function dirKey(n) {
  const p = pathOf(n);
  if (p) {
    const seg = p.split('/');
    if (seg[0] === 'test-reports' || seg[0] === 'memory' || seg[0] === 'docs') return seg[0];
    return seg.slice(0, 2).join('/');
  }
  const id = n.id;
  if (/^file:node-(19|20)-/.test(id)) return 'gateway/deploy';
  if (/^file:node-18-/.test(id)) return 'frontend/legacy';
  if (/^file:batch-/.test(id)) return 'legacy/batch';
  return 'unknown';
}

/** 顶层归属（用于依赖方向/组间统计） */
function topLevel(n) {
  const d = dirKey(n);
  const seg = d.split('/')[0];
  return seg;
}

// ---------- 基础清单 ----------
const nodeManifest = nodes.map(n => ({
  id: n.id,
  type: n.type,
  label: n.label || n.name || null,
  path: pathOf(n),
  category: n.category || n.fileCategory || null,
  language: n.language || null
}));

// ---------- 目录分组 ----------
const dirMap = new Map();
for (const n of nodes) {
  const k = dirKey(n);
  if (!dirMap.has(k)) dirMap.set(k, []);
  dirMap.get(k).push(n.id);
}
const directoryGroups = [...dirMap.entries()]
  .map(([dir, nodeIds]) => ({ dir, count: nodeIds.length, nodeIds }))
  .sort((a, b) => b.count - a.count);

// ---------- 节点类型分组 ----------
const typeCount = new Map();
for (const n of nodes) typeCount.set(n.type, (typeCount.get(n.type) || 0) + 1);
const nodeTypeGroups = [...typeCount.entries()].map(([type, count]) => ({ type, count }));

// ---------- 类别分组 ----------
const catCount = new Map();
for (const n of nodes) {
  const c = n.category || n.fileCategory || 'unknown';
  catCount.set(c, (catCount.get(c) || 0) + 1);
}
const categoryGroups = [...catCount.entries()].map(([category, count]) => ({ category, count }));

// ---------- imports 邻接矩阵与 fan-in/fan-out ----------
const adj = new Map();
const fanIn = new Map();
const fanOut = new Map();
for (const n of nodes) { adj.set(n.id, new Set()); fanIn.set(n.id, 0); fanOut.set(n.id, 0); }
const selfLoops = [];
for (const e of importEdges) {
  if (!ids.has(e.source) || !ids.has(e.target)) continue;
  if (e.source === e.target) { selfLoops.push(e); continue; }
  adj.get(e.source).add(e.target);
}
for (const [src, targets] of adj) {
  fanOut.set(src, targets.size);
  for (const t of targets) fanIn.set(t, (fanIn.get(t) || 0) + 1);
}
const fanStats = [...nodes].map(n => ({
  id: n.id, path: pathOf(n), fanIn: fanIn.get(n.id), fanOut: fanOut.get(n.id)
})).sort((a, b) => (b.fanIn + b.fanOut) - (a.fanIn + a.fanOut));

// ---------- 跨类别依赖矩阵 ----------
const catOf = n => n.category || n.fileCategory || 'unknown';
const cats = [...new Set(nodes.map(catOf))];
const crossCategoryMatrix = {};
for (const a of cats) { crossCategoryMatrix[a] = {}; for (const b of cats) crossCategoryMatrix[a][b] = 0; }
const nodeById = new Map(nodes.map(n => [n.id, n]));
for (const e of importEdges) {
  const s = nodeById.get(e.source), t = nodeById.get(e.target);
  if (!s || !t || e.source === e.target) continue;
  crossCategoryMatrix[catOf(s)][catOf(t)]++;
}

// ---------- 组间 import 频率（顶层目录 × 顶层目录） ----------
const tlKeys = [...new Set(nodes.map(topLevel))];
const interGroupImport = {};
for (const a of tlKeys) { interGroupImport[a] = {}; for (const b of tlKeys) interGroupImport[a][b] = 0; }
for (const e of importEdges) {
  const s = nodeById.get(e.source), t = nodeById.get(e.target);
  if (!s || !t || e.source === e.target) continue;
  interGroupImport[topLevel(s)][topLevel(t)]++;
}

// ---------- 组内密度（dirKey 分组） ----------
const intraGroupDensity = directoryGroups.map(g => {
  const n = g.nodeIds.length;
  let inner = 0;
  const inGroup = new Set(g.nodeIds);
  for (const e of importEdges) {
    if (inGroup.has(e.source) && inGroup.has(e.target) && e.source !== e.target) inner++;
  }
  const density = n > 1 ? +(inner / (n * (n - 1) / 2)).toFixed(4) : 0;
  return { dir: g.dir, nodes: n, innerEdges: inner, density };
});

// ---------- 目录模式匹配 ----------
const PATTERNS = ['api', 'service', 'data', 'ui', 'config', 'test', 'types', 'hooks', 'state', 'infrastructure', 'ci-cd', 'documentation', 'entry'];
const dirPatternMatches = directoryGroups.map(g => {
  const lower = g.dir.toLowerCase();
  const matches = PATTERNS.filter(p => new RegExp(`(^|/|[-_])${p}(/|[-_]|$)`).test(lower));
  return { dir: g.dir, count: g.count, matches };
});

// ---------- 部署拓扑 / 数据管道 / 文档覆盖率 ----------
const deployPattern = /(deploy|setup|ecosystem|\.sh$|\.py$|\.mjs$|\.yml$|\.yaml$)/i;
const deploymentTopology = nodes.filter(n => deployPattern.test(pathOf(n) || '') || /deploy/i.test(n.id))
  .map(n => ({ id: n.id, path: pathOf(n) || n.id }));

const dataPipeline = nodes.filter(n => n.type === 'schema' || n.type === 'table' || /\.sql$/.test(pathOf(n) || ''))
  .map(n => ({ id: n.id, type: n.type, path: pathOf(n) || n.id }));

const docsNodes = nodes.filter(n => n.type === 'document' || n.type === 'section' || /\.md$/.test(pathOf(n) || ''));
const docsByDir = new Map();
for (const n of docsNodes) {
  const d = pathOf(n) ? pathOf(n).split('/')[0] : 'section-fragment';
  docsByDir.set(d, (docsByDir.get(d) || 0) + 1);
}
const documentationCoverage = [...docsByDir.entries()].map(([dir, count]) => ({ dir, count }));

// ---------- 与上一版层定义的差异（新增/移除节点） ----------
let previousLayers = [];
const prevPath = '/home/steven/Agentx/.ua/tmp/previous-layers.json';
if (fs.existsSync(prevPath)) {
  previousLayers = JSON.parse(fs.readFileSync(prevPath, 'utf8'));
}
const prevIds = new Set(previousLayers.flatMap(l => l.nodeIds));
const addedNodes = nodes.filter(n => !prevIds.has(n.id)).map(n => ({ id: n.id, path: pathOf(n) || n.id }));
const removedNodes = [...prevIds].filter(id => !ids.has(id));

const results = {
  meta: { generatedAt: new Date().toISOString(), nodeCount: nodes.length, importEdgeCount: importEdges.length, allEdgeCount: allEdges.length },
  summary: {
    nodeCount: nodes.length,
    importEdges: importEdges.length,
    directoryGroupCount: directoryGroups.length,
    nodeTypes: nodeTypeGroups,
    categories: categoryGroups
  },
  nodeManifest,
  directoryGroups,
  nodeTypeGroups,
  categoryGroups,
  fanStats,
  crossCategoryMatrix,
  interGroupImport,
  intraGroupDensity,
  dirPatternMatches,
  deploymentTopology,
  dataPipeline,
  documentationCoverage,
  dependencyDirection: interGroupImport,
  delta: {
    addedNodes: addedNodes.slice(0, 300),
    addedCount: addedNodes.length,
    removedNodes: removedNodes.slice(0, 300),
    removedCount: removedNodes.length
  },
  unresolvedPaths: nodes.filter(n => !pathOf(n)).map(n => n.id)
};

fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
console.log(`OK: ${results.summary.nodeCount} nodes, ${results.summary.importEdges} import edges -> ${outputPath}`);
process.exit(0);
