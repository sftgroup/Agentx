#!/usr/bin/env node
/**
 * ua-tour-analyze.js — Tour 设计分析器
 * 用法: node ua-tour-analyze.js <input.json> <output.json>
 * input: { nodes:[], edges:[], layers:[] }（layers 为空时回退读取同目录 .ua/intermediate/layers.json）
 * output: {
 *   fanInRanking, fanOutRanking, entryPointCandidates,
 *   bfsTraversal, nonCodeInventory, tightClusters,
 *   layers, nodeSummaryIndex, stats
 * }
 */
const fs = require('fs');
const path = require('path');

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error('Usage: node ua-tour-analyze.js <input.json> <output.json>');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const nodes = raw.nodes || [];
const edges = raw.edges || [];
let layers = raw.layers || [];

// 回退读取 layers.json（输入文件 layers 为空时）
if (!layers.length) {
  const fallback = path.join(path.dirname(path.dirname(inputPath)), 'intermediate', 'layers.json');
  if (fs.existsSync(fallback)) {
    layers = JSON.parse(fs.readFileSync(fallback, 'utf8'));
    console.error('[layers] 回退读取:', fallback, `(${layers.length} 层)`);
  }
}

const nodeById = new Map(nodes.map(n => [n.id, n]));

// 有意义的耦合边（排除 contains 内部包含关系与 documents/configures 文档说明关系）
const COUPLING_EDGES = new Set(['imports', 'calls', 'references', 'related', 'depends_on', 'exports', 'implements', 'tested_by', 'migrates', 'configures']);

// ---------- fan-in / fan-out ----------
const fanIn = new Map();  // nodeId -> incoming edge count (coupling only)
const fanOut = new Map();
for (const n of nodes) { fanIn.set(n.id, 0); fanOut.set(n.id, 0); }
for (const e of edges) {
  if (!COUPLING_EDGES.has(e.type)) continue;
  if (nodeById.has(e.source) && fanOut.has(e.source)) fanOut.set(e.source, fanOut.get(e.source) + 1);
  if (nodeById.has(e.target) && fanIn.has(e.target)) fanIn.set(e.target, fanIn.get(e.target) + 1);
}

const fanInRanking = [...fanIn.entries()]
  .sort((a, b) => b[1] - a[1] || String(nodeById.get(a[0])?.label || a[0]).localeCompare(String(nodeById.get(b[0])?.label || b[0])))
  .slice(0, 20)
  .map(([id, count]) => ({ id, count, label: nodeById.get(id)?.label, type: nodeById.get(id)?.type, filePath: nodeById.get(id)?.filePath }));

const fanOutRanking = [...fanOut.entries()]
  .sort((a, b) => b[1] - a[1] || String(nodeById.get(a[0])?.label || a[0]).localeCompare(String(nodeById.get(b[0])?.label || b[0])))
  .slice(0, 20)
  .map(([id, count]) => ({ id, count, label: nodeById.get(id)?.label, type: nodeById.get(id)?.type, filePath: nodeById.get(id)?.filePath }));

// ---------- 入口点候选评分 ----------
// 根目录文档
const isRootMd = (fp) => /^[^/]+\.md$/.test(fp || '');
const isReadme = (fp) => /(^|\/)README\.md$/i.test(fp || '');
const isIndexLike = (fp, label) => {
  const base = (label || '').toLowerCase();
  const p = (fp || '').toLowerCase();
  return /(^|\/)(index|main|app|server)(\.|$)/.test(p) || ['index', 'main', 'app', 'server'].includes(base);
};
const depthOf = (fp) => (fp || '').split('/').filter(Boolean).length;
const isSrcDepth = (fp) => {
  const parts = (fp || '').split('/').filter(Boolean);
  // 项目根或位于 src/ 一级目录
  if (parts.length <= 2) return true;
  const idx = parts.indexOf('src');
  return idx >= 0 && idx <= 1;
};

const sortedFanOut = [...fanOut.values()].sort((a, b) => b - a);
const highFanOutThreshold = sortedFanOut[Math.max(0, Math.floor(sortedFanOut.length * 0.25))] || 0;

const entryScores = [];
for (const n of nodes) {
  if (n.type === 'section' || n.type === 'batch') continue; // 排除图表噪声节点
  let score = 0;
  let why = [];
  const fp = n.filePath || '';
  const label = n.label || n.name || '';
  if (isReadme(fp)) { score += 5; why.push('README +5'); }
  else if (isRootMd(fp)) { score += 2; why.push('根目录 md +2'); }
  if (isIndexLike(fp, label)) { score += 3; why.push('index/main/app/server +3'); }
  if (isSrcDepth(fp)) { score += 1; why.push('项目根/src 深度 +1'); }
  const fo = fanOut.get(n.id) || 0;
  if (fo >= highFanOutThreshold && fo > 0) { score += 1; why.push('高 fan-out +1'); }
  const fi = fanIn.get(n.id) || 0;
  if (fi === 0) { score += 1; why.push('低 fan-in +1'); }
  if (score > 0) entryScores.push({ id: n.id, score, type: n.type, label, filePath: fp, fanIn: fi, fanOut: fo, why });
}
entryScores.sort((a, b) => b.score - a.score || b.fanOut - a.fanOut || String(a.label).localeCompare(String(b.label)));

const entryPointCandidates = entryScores.slice(0, 30);

// 顶层 CODE 入口点（评分最高的代码节点）
const codeEntry = entryScores.find(s => s.type !== 'document' && s.type !== 'config');
const topEntry = entryScores[0];

// ---------- BFS：从顶层 CODE 入口点沿 imports+calls 边遍历 ----------
function bfsFrom(startId, edgeTypes) {
  const visited = new Set();
  const order = [];
  const queue = [startId];
  visited.add(startId);
  while (queue.length) {
    const cur = queue.shift();
    order.push(cur);
    for (const e of edges) {
      if (e.source !== cur || !edgeTypes.has(e.type)) continue;
      if (!visited.has(e.target)) { visited.add(e.target); queue.push(e.target); }
    }
  }
  return order;
}

const bfsTraversal = codeEntry
  ? bfsFrom(codeEntry.id, new Set(['imports', 'calls', 'depends_on', 'references']))
      .map(id => ({ id, label: nodeById.get(id)?.label, type: nodeById.get(id)?.type, filePath: nodeById.get(id)?.filePath }))
  : [];

// ---------- 非代码文件清单 ----------
const NON_CODE_CATEGORY_LABELS = {
  document: 'documentation',
  config: 'config',
  schema: 'database',
  table: 'database',
  script: 'infrastructure',
  page: 'frontend',
  component: 'frontend',
  batch: 'data',
};
const nonCodeInventory = nodes
  .filter(n => (n.category && n.category !== 'code') || NON_CODE_CATEGORY_LABELS[n.type])
  .map(n => ({
    id: n.id,
    type: n.type,
    label: n.label || n.name,
    filePath: n.filePath || '',
    group: n.type === 'document' ? 'documentation' : (NON_CODE_CATEGORY_LABELS[n.type] || n.category || 'other'),
    summary: (n.summary || '').slice(0, 160),
  }))
  .sort((a, b) => a.group.localeCompare(b.group) || String(a.filePath).localeCompare(String(b.filePath)));

// ---------- 紧密耦合簇：双向边对扩展 ----------
const pairKey = (a, b) => (a < b ? a + '\u0000' + b : b + '\u0000' + a);
const biPairs = new Set();
for (const e of edges) {
  if (!['imports', 'calls', 'references', 'related', 'depends_on'].includes(e.type)) continue;
  if (edges.some(x => x.source === e.target && x.target === e.source && ['imports', 'calls', 'references', 'related', 'depends_on'].includes(x.type))) {
    biPairs.add(pairKey(e.source, e.target));
  }
}
// 用双向关系构成连通分量
const adj = new Map();
const expandPair = (k) => {
  const [a, b] = k.split('\u0000');
  for (const x of [a, b]) if (!adj.has(x)) adj.set(x, []);
  adj.get(a).push(b); adj.get(b).push(a);
};
biPairs.forEach(expandPair);
const visitedClusters = new Set();
const tightClusters = [];
for (const start of adj.keys()) {
  if (visitedClusters.has(start)) continue;
  const comp = [];
  const stack = [start];
  visitedClusters.add(start);
  while (stack.length) {
    const cur = stack.pop();
    comp.push(cur);
    for (const nb of adj.get(cur) || []) {
      if (!visitedClusters.has(nb)) { visitedClusters.add(nb); stack.push(nb); }
    }
  }
  if (comp.length >= 2) {
    tightClusters.push(comp.map(id => ({ id, label: nodeById.get(id)?.label, type: nodeById.get(id)?.type, filePath: nodeById.get(id)?.filePath })));
  }
}
tightClusters.sort((a, b) => b.length - a.length);

// ---------- 层列表 ----------
const layerList = layers.map(l => ({
  id: l.id,
  name: l.name,
  description: (l.description || '').slice(0, 200),
  nodeCount: (l.nodeIds || []).length,
}));

// ---------- nodeSummaryIndex ----------
const nodeSummaryIndex = {};
for (const n of nodes) {
  nodeSummaryIndex[n.id] = {
    label: n.label || n.name || n.id,
    type: n.type,
    filePath: n.filePath || '',
    category: n.category || '',
    summary: (n.summary || '').slice(0, 220),
    tags: n.tags || [],
  };
}

const result = {
  stats: {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    layerCount: layerList.length,
    topCodeEntry: codeEntry ? { id: codeEntry.id, label: codeEntry.label, score: codeEntry.score, why: codeEntry.why } : null,
    topOverallEntry: topEntry ? { id: topEntry.id, label: topEntry.label, score: topEntry.score, type: topEntry.type } : null,
    bfsVisitedCount: bfsTraversal.length,
    tightClusterCount: tightClusters.length,
    nonCodeCount: nonCodeInventory.length,
  },
  fanInRanking,
  fanOutRanking,
  entryPointCandidates,
  bfsTraversal,
  nonCodeInventory,
  tightClusters,
  layers: layerList,
  nodeSummaryIndex,
};

fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
console.log('OK — 输出:', outputPath);
console.log('  nodes=' + nodes.length, 'edges=' + edges.length, 'layers=' + layerList.length);
console.log('  顶层入口:', JSON.stringify(result.stats.topOverallEntry));
console.log('  顶层 CODE 入口:', JSON.stringify(result.stats.topCodeEntry));
console.log('  BFS 覆盖:', bfsTraversal.length, '个节点 | 紧密簇:', tightClusters.length, '个 | 非代码文件:', nonCodeInventory.length, '个');
