"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  McpClient: () => McpClient
});
module.exports = __toCommonJS(index_exports);

// src/client.ts
var McpClient = class _McpClient {
  constructor(config) {
    this.requestId = 0;
    const base = config.gatewayUrl.replace(/\/+$/, "");
    this.url = `${base}/mcp`;
    this.defaultChain = config.defaultChain ?? "sepolia";
    this.headers = { "Content-Type": "application/json", ...config.headers };
    this.timeoutMs = config.timeoutMs ?? 3e4;
  }
  // ── Low-level MCP protocol ───────────────────────────────────────────────
  /** Perform a raw JSON-RPC request. */
  async rpc(method, params) {
    const id = ++this.requestId;
    const body = { jsonrpc: "2.0", id, method, params };
    const res = await fetch(this.url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    if (!res.ok) {
      throw new Error(`MCP HTTP ${res.status}: ${await res.text().catch(() => "")}`);
    }
    const json = await res.json();
    if (json.error) {
      const err = new Error(`MCP error [${json.error.code}]: ${json.error.message}`);
      err.data = json.error.data;
      throw err;
    }
    return json.result;
  }
  /** Parse a tool call result (JSON inside `content[0].text`), tolerant of non-JSON text. */
  static parseToolResult(result) {
    const envelope = result;
    const text = envelope?.content?.[0]?.text;
    if (typeof text === "string" && text.length > 0) {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    return result;
  }
  /** `initialize` MCP handshake (cached). */
  async initialize() {
    if (this.serverInfo) return this.serverInfo;
    const result = await this.rpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "@agentxv2/mcp", version: "0.1.0" }
    });
    this.serverInfo = result.serverInfo ?? {};
    return this.serverInfo;
  }
  /** `tools/list` — all tools registered on the server. */
  async listTools() {
    const result = await this.rpc("tools/list");
    return result.tools ?? [];
  }
  /** `tools/call` — invoke any tool and return the parsed result. */
  async callTool(name, args = {}) {
    await this.initialize();
    const result = await this.rpc("tools/call", { name, arguments: args });
    return _McpClient.parseToolResult(result);
  }
  // ── IdentityRegistry ─────────────────────────────────────────────────────
  /** `agentx_identity_list_all` — batch query with filters (same as SDK `getAllAgents`). */
  listAgents(opts = {}) {
    return this.callTool("agentx_identity_list_all", {
      chain: opts.chain ?? this.defaultChain,
      ...opts.fromId !== void 0 && { fromId: opts.fromId },
      ...opts.toId !== void 0 && { toId: opts.toId },
      ...opts.activeOnly !== void 0 && { activeOnly: opts.activeOnly },
      ...opts.capabilities !== void 0 && { capabilities: opts.capabilities }
    });
  }
  /** `agentx_identity_metadata` — structured metadata for one agent. */
  getAgentMetadata(agentId, chain) {
    return this.callTool("agentx_identity_metadata", { chain: chain ?? this.defaultChain, agentId });
  }
  /** `agentx_identity_total_count` — total registered agents. */
  totalAgents(chain) {
    return this.callTool("agentx_identity_total_count", { chain: chain ?? this.defaultChain });
  }
  /** `agentx_identity_exists` — on-chain existence check. */
  agentExists(agentId, chain) {
    return this.callTool("agentx_identity_exists", { chain: chain ?? this.defaultChain, agentId });
  }
  /** `agentx_identity_list` — agent IDs owned by a wallet. */
  agentsOfOwner(ownerAddress, chain) {
    return this.callTool("agentx_identity_list", { chain: chain ?? this.defaultChain, ownerAddress });
  }
  // ── SubscriptionManager ──────────────────────────────────────────────────
  /** `agentx_subscription_plans` — single plan details (price is a decimal wei string). */
  getPlan(planId, chain) {
    return this.callTool("agentx_subscription_plans", { chain: chain ?? this.defaultChain, planId });
  }
  /** `agentx_subscription_create_plan` — WRITE descriptor (sign & submit with a wallet). */
  createPlan(args) {
    return this.callTool("agentx_subscription_create_plan", {
      chain: args.chain ?? this.defaultChain,
      agentId: args.agentId,
      price: args.price,
      period: args.period,
      ...args.payToken !== void 0 && { payToken: args.payToken },
      ...args.trialDays !== void 0 && { trialDays: args.trialDays }
    });
  }
  /** `agentx_subscription_check` — active subscription for (wallet, agent). */
  checkSubscription(subscriberAddress, agentId, chain) {
    return this.callTool("agentx_subscription_check", { chain: chain ?? this.defaultChain, subscriberAddress, agentId });
  }
  /** `agentx_subscription_detail` — full subscription detail. */
  subscriptionDetail(subscriptionId, chain) {
    return this.callTool("agentx_subscription_detail", { chain: chain ?? this.defaultChain, subscriptionId });
  }
  /** `agentx_subscription_my_list` — all subscription IDs of a wallet. */
  mySubscriptions(userAddress, chain) {
    return this.callTool("agentx_subscription_my_list", { chain: chain ?? this.defaultChain, userAddress });
  }
  /** `agentx_subscription_subscribe` — WRITE descriptor. */
  subscribe(planId, opts = {}) {
    return this.callTool("agentx_subscription_subscribe", {
      chain: opts.chain ?? this.defaultChain,
      planId,
      ...opts.valueWei !== void 0 && { valueWei: opts.valueWei }
    });
  }
  /** `agentx_subscription_cancel` — WRITE descriptor. */
  cancelSubscription(subscriptionId, chain) {
    return this.callTool("agentx_subscription_cancel", { chain: chain ?? this.defaultChain, subscriptionId });
  }
  /** `agentx_subscription_release` — WRITE descriptor (release escrowed funds). */
  releaseFunds(subscriptionId, chain) {
    return this.callTool("agentx_subscription_release", { chain: chain ?? this.defaultChain, subscriptionId });
  }
  /** `agentx_subscription_fee` — current platform fee in basis points. */
  platformFee(chain) {
    return this.callTool("agentx_subscription_fee", { chain: chain ?? this.defaultChain });
  }
  // ── Gateway ──────────────────────────────────────────────────────────────
  /** `agentx_gateway_health` — gateway health + indexer status. */
  gatewayHealth() {
    return this.callTool("agentx_gateway_health", {});
  }
  /** `agentx_gateway_tenant` — current tenant info (needs `X-Api-Key` header). */
  gatewayTenant() {
    return this.callTool("agentx_gateway_tenant", {});
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  McpClient
});
