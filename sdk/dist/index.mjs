import {
  A2AProtocol,
  A2A_VERSION
} from "./chunk-NIHBLVPG.mjs";
import {
  A2ADaemon,
  AgentLoop,
  ToolExecutor,
  buildPlatformTools,
  buildSystemPrompt,
  buildTools,
  executePlatformTool,
  getAllPlatformToolNames,
  wrapPlatformToolsAsSkills
} from "./chunk-6C3GJJVB.mjs";
import {
  AgentXError,
  AgentXErrorCode
} from "./chunk-7NDFWV7O.mjs";
import {
  aesDecrypt,
  aesEncrypt,
  bytesToHex,
  decryptPayload,
  eciesDecrypt,
  eciesEncrypt,
  encryptPayload,
  generateAesKey,
  generateKeyPair,
  getPublicKey,
  hexToBytes,
  packAgentForPublish,
  publishAgent,
  randomBytes,
  unpackAgent
} from "./chunk-GUYL7LUN.mjs";
import {
  hexToString,
  stringToHex
} from "./chunk-SELDLMV6.mjs";
import "./chunk-XGB3TDIC.mjs";

// src/registry/ipfs-fetcher.ts
var IPFSFetcher = class {
  gateway;
  fallbackGateways;
  timeoutMs;
  cache = /* @__PURE__ */ new Map();
  maxCache;
  pending = /* @__PURE__ */ new Map();
  failed = /* @__PURE__ */ new Set();
  constructor(config = {}) {
    this.gateway = config.gateway ?? "ipfs.io";
    this.fallbackGateways = config.fallbackGateways ?? [
      "gateway.pinata.cloud",
      "dweb.link",
      "cf-ipfs.com"
    ];
    this.timeoutMs = config.timeoutMs ?? 1e4;
    this.maxCache = config.maxCache ?? 200;
  }
  // ── Public API ──────────────────────────────────────────────────────────
  /** Fetch JSON from a single IPFS CID. */
  async fetchJSON(cid) {
    const cached = this.cache.get(cid);
    if (cached) return cached.data;
    if (this.failed.has(cid)) throw new Error(`CID ${cid} previously failed`);
    const pending = this.pending.get(cid);
    if (pending) return pending;
    const promise = this._doFetch(cid);
    this.pending.set(cid, promise);
    try {
      const data = await promise;
      this._cacheSet(cid, data);
      return data;
    } catch (e) {
      this.failed.add(cid);
      throw e;
    } finally {
      this.pending.delete(cid);
    }
  }
  /** Fetch encrypted agent payload (validates algorithm). */
  async fetchEncryptedPayload(cid) {
    const raw = await this.fetchJSON(cid);
    if (!raw.encrypted || raw.algorithm !== "AES-256-GCM" || typeof raw.data !== "string") {
      throw new Error(`Invalid EncryptedPayload at CID ${cid}`);
    }
    return raw;
  }
  /** Batch fetch multiple CIDs with concurrency control. */
  async fetchBatch(cids, concurrency = 5) {
    const results = /* @__PURE__ */ new Map();
    const unique = [...new Set(cids)].filter((c) => this.isValidCID(c));
    for (let i = 0; i < unique.length; i += concurrency) {
      const batch = unique.slice(i, i + concurrency);
      const settled = await Promise.allSettled(
        batch.map((cid) => this.fetchJSON(cid))
      );
      settled.forEach((r, j) => {
        if (r.status === "fulfilled") results.set(batch[j], r.value);
      });
      if (i + concurrency < unique.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    return results;
  }
  /** Check if a string looks like a valid IPFS CID. */
  isValidCID(cid) {
    return /^(Qm[1-9A-HJ-NP-Za-km-z]{44,}|b[a-z2-7]{58,}|[A-Za-z0-9+/]{46,})$/.test(cid);
  }
  /** Clear cache (optionally for a specific CID). */
  clearCache(cid) {
    if (cid) {
      this.cache.delete(cid);
    } else {
      this.cache.clear();
    }
    this.failed.clear();
  }
  /** Number of cached entries. */
  get cacheSize() {
    return this.cache.size;
  }
  // ── Internal ─────────────────────────────────────────────────────────────
  async _doFetch(cid) {
    if (!this.isValidCID(cid)) throw new Error(`Invalid CID: ${cid}`);
    try {
      return await this._fetchFrom(cid, this.gateway, this.timeoutMs);
    } catch {
    }
    for (const gw of this.fallbackGateways) {
      try {
        return await this._fetchFrom(cid, gw, this.timeoutMs);
      } catch {
      }
    }
    throw new Error(`All IPFS gateways failed for CID ${cid}`);
  }
  async _fetchFrom(cid, gateway, timeoutMs) {
    const url = `https://${gateway}/ipfs/${cid}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }
  _cacheSet(cid, data) {
    this.cache.set(cid, { data, timestamp: Date.now() });
    if (this.cache.size > this.maxCache) {
      const oldest = [...this.cache.entries()].sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      )[0];
      if (oldest) this.cache.delete(oldest[0]);
    }
  }
};
var defaultIPFSFetcher = new IPFSFetcher();

// src/agent/agent-runner.ts
var AgentRunner = class {
  reader;
  wallet;
  ipfs;
  constructor(config) {
    this.reader = config.reader;
    this.wallet = config.wallet;
    this.ipfs = config.ipfsFetcher ?? new IPFSFetcher({
      fallbackGateways: config.ipfsGateways ?? [
        "gateway.pinata.cloud",
        "dweb.link",
        "cf-ipfs.com"
      ]
    });
  }
  // ── Primary API: useAgent ────────────────────────────────────────────────
  /**
   * Load and decrypt an Agent, returning a run context ready to inject
   * into any LLM conversation.
   *
   * Steps:
   *   1. Verify on-chain subscription (frontend check)
   *   2. Fetch metadata → get encryptedPayloadCid + eciesEncryptedKey
   *   3. IPFS fetch encrypted payload
   *   4. ECIES decrypt AES key (using wallet private key)
   *   5. AES-256-GCM decrypt payload → { prompt, skills, mcp }
   *   6. Build RunnableSkill wrappers (Open: local stub, Closed: MCP remote)
   */
  async useAgent(agentId) {
    const address = await this.wallet.getAddress();
    const isActive = await this.reader.hasActiveSubscription(address, agentId);
    if (!isActive) {
      const err = new AgentXError(
        "NOT_SUBSCRIBED" /* NOT_SUBSCRIBED */,
        `No active subscription for Agent #${agentId}. Check error.paymentInfo for auto-subscribe via wallet/X402.`
      );
      err.paymentInfo = {
        agentId
      };
      throw err;
    }
    const attrs = await this.reader.getAttributes(agentId);
    const encryptedPayloadCid = attrs.encryptedPayloadCid;
    const eciesEncryptedKey = attrs.eciesEncryptedKey;
    if (!encryptedPayloadCid || !eciesEncryptedKey) {
      throw new AgentXError(
        "AGENT_NOT_FOUND" /* AGENT_NOT_FOUND */,
        `Agent #${agentId} metadata incomplete \u2014 missing encryptedPayloadCid or eciesEncryptedKey`
      );
    }
    let encryptedPayload;
    try {
      encryptedPayload = await this.ipfs.fetchEncryptedPayload(encryptedPayloadCid);
    } catch (e) {
      throw new AgentXError(
        "IPFS_FETCH_FAILED" /* IPFS_FETCH_FAILED */,
        `Failed to fetch encrypted payload for agent #${agentId}: ${e}`
      );
    }
    let privatePayload;
    try {
      const privKey = await this._getPrivateKey();
      privatePayload = unpackAgent(encryptedPayload, eciesEncryptedKey, privKey);
    } catch (e) {
      throw new AgentXError(
        "DECRYPTION_FAILED" /* DECRYPTION_FAILED */,
        `Failed to decrypt agent #${agentId}: ${e}`
      );
    }
    const skills = privatePayload.skills.map((s) => this._wrapSkill(s));
    return {
      agentId,
      prompt: privatePayload.prompt,
      skills,
      mcp: {
        type: privatePayload.mcp.type,
        url: privatePayload.mcp.url,
        toolFilter: privatePayload.mcp.toolFilter
      },
      subscriptionExpiry: 0
    };
  }
  // ── Publishing ───────────────────────────────────────────────────────────
  /**
   * Pack an AgentPayload for publishing (encryption only, no IPFS upload).
   * Caller is responsible for IPFS upload and on-chain registration.
   */
  packForPublish(payload, publicKey) {
    const key = generateAesKey();
    return {
      encryptedCid: "",
      publicCid: "",
      aesKeyHex: key,
      eciesEncryptedKeyHex: eciesEncrypt(key, publicKey)
    };
  }
  // ── Internals ────────────────────────────────────────────────────────────
  /** Wrap a SkillDef into a RunnableSkill with execute(). */
  _wrapSkill(skill) {
    let mode = "open";
    let executeFn;
    if (skill.execution) {
      if (skill.execution.type === "mcp") {
        mode = "mcp";
        const endpoint = skill.execution.endpoint ?? "";
        const toolName = skill.execution.toolName ?? skill.name;
        executeFn = async (input) => {
          return this._executeMCPTool(endpoint, toolName, input);
        };
      } else if (skill.execution.type === "a2a") {
        mode = "a2a";
        executeFn = async (input) => {
          return this._executeA2ASkill(skill, input);
        };
      } else {
        throw new AgentXError(
          "INVALID_SCHEMA" /* INVALID_SCHEMA */,
          `Unknown execution type "${skill.execution.type}" for skill "${skill.name}"`
        );
      }
    } else {
      executeFn = async () => {
        throw new AgentXError(
          "INVALID_SCHEMA" /* INVALID_SCHEMA */,
          `Open skill "${skill.name}" has no local executor. Implement execute() or switch to execution.type = "mcp" or "a2a".`
        );
      };
    }
    return {
      name: skill.name,
      description: skill.description,
      inputSchema: skill.inputSchema,
      outputSchema: skill.outputSchema,
      mode,
      execute: executeFn,
      /** If A2A, carry delegation metadata so the LLM can see it */
      a2aTargetAgentId: skill.execution?.type === "a2a" ? skill.execution.targetAgentId : void 0
    };
  }
  /** Call a tool on the publisher's MCP server (Closed skill). */
  async _executeMCPTool(endpoint, toolName, params) {
    const address = await this.wallet.getAddress();
    const timestamp = Math.floor(Date.now() / 1e3);
    const message = `agentx:mcp:${toolName}:${timestamp}`;
    const signature = await this.wallet.signMessage(message);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Subscriber-Address": address,
        "X-Signature": signature,
        "X-Timestamp": String(timestamp)
      },
      body: JSON.stringify({
        method: "tools/call",
        params: {
          name: toolName,
          arguments: params
        }
      })
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 403) {
        throw new AgentXError(
          "SUBSCRIPTION_EXPIRED" /* SUBSCRIPTION_EXPIRED */,
          `MCP server rejected request: subscription may have expired. ${text}`
        );
      }
      throw new AgentXError(
        "TX_FAILED" /* TX_FAILED */,
        `MCP tool "${toolName}" failed (HTTP ${res.status}): ${text}`
      );
    }
    const data = await res.json();
    const content = data.content?.[0];
    if (content?.type === "text" && content.text) {
      try {
        return JSON.parse(content.text);
      } catch {
        return content.text;
      }
    }
    return data;
  }
  /**
   * Execute an A2A skill — delegate to another AgentX Agent.
   *
   * Standard Interface:
   *   Input:  { task, ...taskSpecificParams }
   *   Output: { agentId, prompt, skills[] }
   *
   * The caller (LLM) receives the sub-Agent's prompt + skill list.
   * The LLM then decides how to use the sub-Agent — typically by
   * injecting the sub-Agent's system prompt and calling its skills.
   */
  async _executeA2ASkill(skill, input) {
    const exec = skill.execution;
    if (!exec || exec.type !== "a2a") {
      throw new AgentXError(
        "INVALID_SCHEMA" /* INVALID_SCHEMA */,
        `Skill "${skill.name}" is not an A2A delegation skill`
      );
    }
    const targetAgentId = exec.targetAgentId;
    let subContext;
    try {
      subContext = await this.useAgent(targetAgentId);
    } catch (e) {
      throw new AgentXError(
        "AGENT_NOT_FOUND" /* AGENT_NOT_FOUND */,
        `A2A delegation failed: cannot load Agent #${targetAgentId}. ${e}`
      );
    }
    if (exec.skillFilter && exec.skillFilter.length > 0) {
      const filterSet = new Set(exec.skillFilter);
      subContext = {
        ...subContext,
        skills: subContext.skills.filter((s) => filterSet.has(s.name))
      };
    }
    if (exec.promptOverride) {
      subContext = { ...subContext, prompt: exec.promptOverride };
    }
    return {
      agentId: targetAgentId,
      prompt: subContext.prompt,
      skills: subContext.skills.map((s) => ({
        name: s.name,
        description: s.description,
        inputSchema: s.inputSchema
      })),
      // Pass the caller's input to the sub-agent's context
      callerInput: input
    };
  }
  async _getPrivateKey() {
    if (this.wallet.getPrivateKey) return this.wallet.getPrivateKey();
    throw new AgentXError(
      "WALLET_NOT_CONNECTED" /* WALLET_NOT_CONNECTED */,
      "Wallet must support getPrivateKey() for ECIES decryption."
    );
  }
};

// src/llm/openai-provider.ts
var DEFAULT_ENDPOINT = "https://api.openai.com/v1";
var OpenAIProvider = class {
  config;
  constructor(config) {
    this.config = {
      endpoint: config.endpoint ?? DEFAULT_ENDPOINT,
      model: config.model,
      apiKey: config.apiKey,
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 4096,
      timeoutMs: config.timeoutMs ?? 6e4
    };
  }
  async *chatStream(request, signal) {
    const endpoint = `${this.config.endpoint}/chat/completions`;
    const body = JSON.stringify({
      model: request.model || this.config.model,
      messages: request.messages,
      tools: request.tools,
      temperature: request.temperature ?? this.config.temperature,
      max_tokens: request.maxTokens ?? this.config.maxTokens,
      stream: true,
      stream_options: { include_usage: true }
    });
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.apiKey}`
        },
        body,
        signal
      });
    } catch (err) {
      if (err.name === "AbortError") {
        yield { type: "error", error: new Error("Request aborted") };
      } else {
        yield { type: "error", error: err instanceof Error ? err : new Error(String(err)) };
      }
      return;
    }
    if (!response.ok) {
      let errorText = "";
      try {
        errorText = await response.text();
      } catch {
      }
      yield { type: "error", error: new Error(`HTTP ${response.status}: ${errorText}`) };
      return;
    }
    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: "error", error: new Error("No response body") };
      return;
    }
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === "[DONE]") {
            continue;
          }
          let data;
          try {
            data = JSON.parse(dataStr);
          } catch {
            continue;
          }
          if (data.usage) {
            yield {
              type: "done",
              usage: {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens
              }
            };
            continue;
          }
          const choice = data.choices?.[0];
          if (!choice) continue;
          if (choice.delta?.content) {
            yield { type: "text_delta", content: choice.delta.content };
          }
          if (choice.delta?.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              if (tc.id && tc.function?.name) {
                yield { type: "tool_call_start", callId: tc.id, name: tc.function.name };
              }
              if (tc.function?.arguments) {
                yield {
                  type: "tool_call_delta",
                  callId: tc.id ?? `call_${tc.index}`,
                  arguments: tc.function.arguments
                };
              }
            }
          }
          if (choice.finish_reason === "stop" && !data.usage) {
            yield {
              type: "done",
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
            };
          }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        yield { type: "error", error: err instanceof Error ? err : new Error(String(err)) };
      }
    } finally {
      reader.releaseLock();
    }
  }
};

// src/llm/gateway-provider.ts
var GatewayProvider = class {
  config;
  constructor(config) {
    this.config = {
      gatewayUrl: config.gatewayUrl.replace(/\/$/, ""),
      accessToken: config.accessToken,
      keySource: config.keySource ?? "platform",
      model: config.model,
      tenantKeyId: config.tenantKeyId,
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 4096,
      timeoutMs: config.timeoutMs ?? 12e4
    };
  }
  async *chatStream(request, signal) {
    const endpoint = `${this.config.gatewayUrl}/api/v1/chat/completions`;
    const body = {
      model: request.model || this.config.model || "gpt-4o",
      messages: request.messages,
      stream: true,
      key_source: this.config.keySource
    };
    if (request.tools && request.tools.length > 0) body.tools = request.tools;
    if (request.temperature !== void 0) body.temperature = request.temperature;
    if (request.maxTokens !== void 0) body.max_tokens = request.maxTokens;
    if (this.config.tenantKeyId) body.tenant_key_id = this.config.tenantKeyId;
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.accessToken}`
        },
        body: JSON.stringify(body),
        signal
      });
    } catch (err) {
      if (err.name === "AbortError") {
        yield { type: "error", error: new Error("Request aborted") };
      } else {
        yield { type: "error", error: err instanceof Error ? err : new Error(String(err)) };
      }
      return;
    }
    if (!response.ok) {
      let errorMsg = `Gateway HTTP ${response.status}`;
      try {
        const errBody = await response.json();
        errorMsg = errBody.error || errBody.message || errorMsg;
      } catch {
      }
      yield { type: "error", error: new Error(errorMsg) };
      return;
    }
    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: "error", error: new Error("No response body from gateway") };
      return;
    }
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === "[DONE]") continue;
          let data;
          try {
            data = JSON.parse(dataStr);
          } catch {
            continue;
          }
          if (data.error) {
            yield { type: "error", error: new Error(data.error.message) };
            return;
          }
          if (data.usage) {
            yield {
              type: "done",
              usage: {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens
              }
            };
            continue;
          }
          const choice = data.choices?.[0];
          if (!choice) continue;
          if (choice.delta?.content) {
            yield { type: "text_delta", content: choice.delta.content };
          }
          if (choice.delta?.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              if (tc.id && tc.function?.name) {
                yield { type: "tool_call_start", callId: tc.id, name: tc.function.name };
              }
              if (tc.function?.arguments) {
                yield {
                  type: "tool_call_delta",
                  callId: tc.id ?? `call_${tc.index}`,
                  arguments: tc.function.arguments
                };
              }
            }
          }
          if (choice.finish_reason === "stop" && !data.usage) {
            yield {
              type: "done",
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
            };
          }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        yield { type: "error", error: err instanceof Error ? err : new Error(String(err)) };
      }
    } finally {
      reader.releaseLock();
    }
  }
};

// src/llm/factory.ts
function createLLMProvider(config) {
  switch (config.type) {
    case "gateway":
      if (!config.gatewayUrl || !config.accessToken) {
        throw new Error("GatewayProvider requires gatewayUrl and accessToken");
      }
      return new GatewayProvider({
        gatewayUrl: config.gatewayUrl,
        accessToken: config.accessToken,
        model: config.model,
        keySource: config.keySource,
        tenantKeyId: config.tenantKeyId,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        timeoutMs: config.timeoutMs
      });
    case "openai":
      if (!config.apiKey) {
        throw new Error("OpenAIProvider requires apiKey");
      }
      return new OpenAIProvider({
        apiKey: config.apiKey,
        endpoint: config.endpoint,
        model: config.model ?? "gpt-4o",
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        timeoutMs: config.timeoutMs
      });
    case "direct":
      if (!config.apiKey) {
        throw new Error("Direct provider requires apiKey");
      }
      return new OpenAIProvider({
        apiKey: config.apiKey,
        endpoint: config.endpoint,
        model: config.model ?? "gpt-4o",
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        timeoutMs: config.timeoutMs
      });
    default:
      throw new Error(`Unknown provider type: ${config.type}`);
  }
}

// src/registry/agent-registry.ts
var IDENTITY_REGISTRY_ABI = {
  // Register
  register: {
    inputs: [],
    name: "register",
    outputs: [{ name: "agentId", type: "uint256" }],
    stateMutability: "payable",
    type: "function"
  },
  registerWithTokenURI: {
    inputs: [{ name: "tokenURI", type: "string" }],
    name: "register",
    outputs: [{ name: "agentId", type: "uint256" }],
    stateMutability: "payable",
    type: "function"
  },
  registerWithMetadata: {
    inputs: [
      { name: "tokenURI", type: "string" },
      {
        name: "metadata",
        type: "tuple[]",
        components: [
          { name: "key", type: "string" },
          { name: "value", type: "bytes" }
        ]
      }
    ],
    name: "registerWithMetadata",
    outputs: [{ name: "agentId", type: "uint256" }],
    stateMutability: "payable",
    type: "function"
  },
  // Queries
  getAgentsByOwner: {
    inputs: [{ name: "owner", type: "address" }],
    name: "getAgentsByOwner",
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
    type: "function"
  },
  getCurrentAgentId: {
    inputs: [],
    name: "getCurrentAgentId",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  agentExists: {
    inputs: [{ name: "agentId", type: "uint256" }],
    name: "agentExists",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  tokenURI: {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "tokenURI",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function"
  },
  getAgentMetadata: {
    inputs: [{ name: "agentId", type: "uint256" }],
    name: "getAgentMetadata",
    outputs: [{ name: "", type: "tuple[]", components: [{ name: "key", type: "string" }, { name: "value", type: "bytes" }] }],
    stateMutability: "view",
    type: "function"
  }
};
var AgentRegistry = class {
  address;
  publicClient;
  walletClient;
  constructor(config) {
    this.address = config.contractAddress;
    this.publicClient = config.publicClient;
    this.walletClient = config.walletClient;
  }
  // ── Write: Register Agent ───────────────────────────────────────────────
  /**
   * Register a new Agent NFT on-chain.
   *
   * @param tokenURI    IPFS URI of the public metadata (ipfs://...)
   * @param metadata    Key-value metadata (encryptedPayloadCid, eciesEncryptedKey, etc.)
   * @param valueWei    Optional: native currency to send with registration
   * @returns           { agentId: number, txHash: Hash }
   */
  async register(tokenURI, metadata, valueWei) {
    const [account] = await this.walletClient.getAddresses();
    if (!account) throw new Error("Wallet not connected");
    const encodedMetadata = metadata.map((m) => ({
      key: m.key,
      value: stringToHex(m.value)
    }));
    const { request } = await this.publicClient.simulateContract({
      account,
      address: this.address,
      abi: [IDENTITY_REGISTRY_ABI.registerWithMetadata],
      functionName: "registerWithMetadata",
      args: [tokenURI, encodedMetadata],
      value: valueWei
    });
    const hash = await this.walletClient.writeContract(request);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    const agentId = this._parseAgentIdFromReceipt(receipt);
    return { agentId, txHash: hash };
  }
  /**
   * Simple register — just a tokenURI, no extra metadata.
   */
  async registerSimple(tokenURI, valueWei) {
    const [account] = await this.walletClient.getAddresses();
    if (!account) throw new Error("Wallet not connected");
    const abi = tokenURI ? [IDENTITY_REGISTRY_ABI.registerWithTokenURI] : [IDENTITY_REGISTRY_ABI.register];
    const args = tokenURI ? [tokenURI] : [];
    const { request } = await this.publicClient.simulateContract({
      account,
      address: this.address,
      abi,
      functionName: "register",
      args,
      value: valueWei
    });
    const hash = await this.walletClient.writeContract(request);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    const agentId = this._parseAgentIdFromReceipt(receipt);
    return { agentId, txHash: hash };
  }
  // ── Read: Query ──────────────────────────────────────────────────────────
  /** Get all agent IDs owned by an address. */
  async getAgentsByOwner(owner) {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: [IDENTITY_REGISTRY_ABI.getAgentsByOwner],
      functionName: "getAgentsByOwner",
      args: [owner]
    });
    return result.map(Number);
  }
  /** Get the current total agent count. */
  async getCurrentAgentId() {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: [IDENTITY_REGISTRY_ABI.getCurrentAgentId],
      functionName: "getCurrentAgentId"
    });
    return Number(result);
  }
  /** Check if an agent exists. */
  async agentExists(agentId) {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: [IDENTITY_REGISTRY_ABI.agentExists],
      functionName: "agentExists",
      args: [BigInt(agentId)]
    });
    return result;
  }
  /** Get the tokenURI for an agent. */
  async tokenURI(agentId) {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: [IDENTITY_REGISTRY_ABI.tokenURI],
      functionName: "tokenURI",
      args: [BigInt(agentId)]
    });
    return result;
  }
  /** Get all metadata attributes for an agent as key-value pairs. */
  async getAttributes(agentId) {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: [IDENTITY_REGISTRY_ABI.getAgentMetadata],
      functionName: "getAgentMetadata",
      args: [BigInt(agentId)]
    });
    const attrs = {};
    for (const item of result) {
      attrs[item.key] = hexToString(item.value);
    }
    return attrs;
  }
  // ── Helpers ──────────────────────────────────────────────────────────────
  /** Extract tokenId from the Transfer event in the receipt. */
  _parseAgentIdFromReceipt(receipt) {
    for (const log of receipt.logs) {
      const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
      if (log.topics[0] === transferTopic && log.topics.length >= 4) {
        return Number(BigInt(log.topics[3]));
      }
    }
    throw new Error("Could not parse agentId from Transfer event in receipt");
  }
};
function cidFromURI(uri) {
  return uri.replace(/^ipfs:\/\//, "");
}

// src/registry/index.ts
var REGISTRY_VERSION = "0.1.0";

// src/subscription/subscription.ts
var SUBSCRIPTION_ABI_V2 = {
  // Admin
  platformFeeBps: {
    inputs: [],
    name: "platformFeeBps",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  tokenWhitelist: {
    inputs: [{ name: "token", type: "address" }],
    name: "tokenWhitelist",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  // Plans
  createPlan: {
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "price", type: "uint256" },
      { name: "period", type: "string" },
      { name: "payToken", type: "address" },
      { name: "trialDays", type: "uint256" }
    ],
    name: "createPlan",
    outputs: [{ name: "planId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  getPlan: {
    inputs: [{ name: "planId", type: "uint256" }],
    name: "getPlan",
    outputs: [
      { name: "planId", type: "uint256" },
      { name: "agentId", type: "uint256" },
      { name: "creator", type: "address" },
      { name: "price", type: "uint256" },
      { name: "period", type: "string" },
      { name: "active", type: "bool" },
      { name: "payToken", type: "address" },
      { name: "trialDays", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  // Subscribe
  subscribe: {
    inputs: [{ name: "planId", type: "uint256" }],
    name: "subscribe",
    outputs: [{ name: "subscriptionId", type: "uint256" }],
    stateMutability: "payable",
    type: "function"
  },
  // Trial / Release
  releaseFunds: {
    inputs: [{ name: "subscriptionId", type: "uint256" }],
    name: "releaseFunds",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  cancelSubscription: {
    inputs: [{ name: "subscriptionId", type: "uint256" }],
    name: "cancelSubscription",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  // Queries
  getSubscription: {
    inputs: [
      { name: "subscriber", type: "address" },
      { name: "agentId", type: "uint256" }
    ],
    name: "getSubscription",
    outputs: [
      { name: "subscriptionId", type: "uint256" },
      { name: "subscriber", type: "address" },
      { name: "agentId", type: "uint256" },
      { name: "status", type: "uint8" },
      { name: "startedAt", type: "uint256" },
      { name: "expiresAt", type: "uint256" },
      { name: "period", type: "string" }
    ],
    stateMutability: "view",
    type: "function"
  },
  hasActiveSubscription: {
    inputs: [
      { name: "subscriber", type: "address" },
      { name: "agentId", type: "uint256" }
    ],
    name: "hasActiveSubscription",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  getUserSubscriptions: {
    inputs: [{ name: "user", type: "address" }],
    name: "getUserSubscriptions",
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
    type: "function"
  },
  getSubscriptionDetail: {
    inputs: [{ name: "subscriptionId", type: "uint256" }],
    name: "getSubscriptionDetail",
    outputs: [
      { name: "subscriptionId", type: "uint256" },
      { name: "subscriber", type: "address" },
      { name: "agentId", type: "uint256" },
      { name: "status", type: "uint8" },
      { name: "startedAt", type: "uint256" },
      { name: "expiresAt", type: "uint256" },
      { name: "period", type: "string" },
      { name: "payToken", type: "address" },
      { name: "amountPaid", type: "uint256" },
      { name: "trialActive", type: "bool" },
      { name: "trialEndsAt", type: "uint256" },
      { name: "fundsReleased", type: "bool" }
    ],
    stateMutability: "view",
    type: "function"
  }
};
var ERC20_ABI = {
  approve: {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  allowance: {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
};
var SubscriptionManager = class {
  address;
  publicClient;
  walletClient;
  constructor(config) {
    this.address = config.contractAddress;
    this.publicClient = config.publicClient;
    this.walletClient = config.walletClient;
  }
  // ── Config Read ──────────────────────────────────────────────────────────
  /** Get current platform fee in basis points (e.g. 250 = 2.5%). */
  async getPlatformFeeBps() {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: [SUBSCRIPTION_ABI_V2.platformFeeBps],
      functionName: "platformFeeBps"
    });
    return Number(result);
  }
  /** Check if a token is whitelisted for payments. */
  async isTokenWhitelisted(token) {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: [SUBSCRIPTION_ABI_V2.tokenWhitelist],
      functionName: "tokenWhitelist",
      args: [token]
    });
    return result;
  }
  // ── Plans ────────────────────────────────────────────────────────────────
  /** Get full plan details with v2 fields. */
  async getPlan(planId) {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: [SUBSCRIPTION_ABI_V2.getPlan],
      functionName: "getPlan",
      args: [BigInt(planId)]
    });
    const [pid, aid, creator, price, period, active, payToken, trialDays] = result;
    return {
      planId: Number(pid),
      agentId: Number(aid),
      creator,
      price,
      period,
      active,
      payToken,
      trialDays: Number(trialDays)
    };
  }
  // ── Subscribe ────────────────────────────────────────────────────────────
  /**
   * Subscribe to a plan.
   * For ETH plans: pass valueWei = plan.price.
   * For ERC20 plans: auto-detects from plan.payToken, calls approve + subscribe.
   *                    User must have approved this contract for plan.price tokens.
   */
  async subscribe(planId, opts) {
    const [account] = await this.walletClient.getAddresses();
    if (!account) throw new Error("Wallet not connected");
    const plan = await this.getPlan(planId);
    if (!plan.active) throw new Error("Plan not active");
    if (plan.payToken === "0x0000000000000000000000000000000000000000") {
      const value = opts?.valueWei ?? plan.price;
      const { request } = await this.publicClient.simulateContract({
        account,
        address: this.address,
        abi: [SUBSCRIPTION_ABI_V2.subscribe],
        functionName: "subscribe",
        args: [BigInt(planId)],
        value
      });
      const hash = await this.walletClient.writeContract(request);
      return { subscriptionId: 0, txHash: hash };
    } else {
      if (opts?.approveTokenFirst !== false) {
        const allowance = await this.publicClient.readContract({
          address: plan.payToken,
          abi: [ERC20_ABI.allowance],
          functionName: "allowance",
          args: [account, this.address]
        });
        if (allowance < plan.price) {
          const { request: approveReq } = await this.publicClient.simulateContract({
            account,
            address: plan.payToken,
            abi: [ERC20_ABI.approve],
            functionName: "approve",
            args: [this.address, plan.price]
          });
          await this.walletClient.writeContract(approveReq);
        }
      }
      const { request } = await this.publicClient.simulateContract({
        account,
        address: this.address,
        abi: [SUBSCRIPTION_ABI_V2.subscribe],
        functionName: "subscribe",
        args: [BigInt(planId)]
      });
      const hash = await this.walletClient.writeContract(request);
      return { subscriptionId: 0, txHash: hash };
    }
  }
  /** Release escrowed funds to creator after trial window ends. */
  async releaseFunds(subscriptionId) {
    const [account] = await this.walletClient.getAddresses();
    if (!account) throw new Error("Wallet not connected");
    const { request } = await this.publicClient.simulateContract({
      account,
      address: this.address,
      abi: [SUBSCRIPTION_ABI_V2.releaseFunds],
      functionName: "releaseFunds",
      args: [BigInt(subscriptionId)]
    });
    return this.walletClient.writeContract(request);
  }
  /** Cancel subscription (trial refund if within window). */
  async cancel(subscriptionId) {
    const [account] = await this.walletClient.getAddresses();
    if (!account) throw new Error("Wallet not connected");
    const { request } = await this.publicClient.simulateContract({
      account,
      address: this.address,
      abi: [SUBSCRIPTION_ABI_V2.cancelSubscription],
      functionName: "cancelSubscription",
      args: [BigInt(subscriptionId)]
    });
    return this.walletClient.writeContract(request);
  }
  // ── Read ─────────────────────────────────────────────────────────────────
  async hasActiveSubscription(subscriber, agentId) {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: [SUBSCRIPTION_ABI_V2.hasActiveSubscription],
      functionName: "hasActiveSubscription",
      args: [subscriber, BigInt(agentId)]
    });
    return result;
  }
  async getSubscription(subscriber, agentId) {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: [SUBSCRIPTION_ABI_V2.getSubscription],
      functionName: "getSubscription",
      args: [subscriber, BigInt(agentId)]
    });
    const [subId, sub, aId, status, started, expires, period] = result;
    if (Number(subId) === 0) return null;
    return {
      subscriptionId: Number(subId),
      subscriber: sub,
      agentId: Number(aId),
      status: ["active", "expired", "cancelled", "pending"][status],
      startedAt: Number(started),
      expiresAt: Number(expires),
      period
    };
  }
  /** Get full subscription detail with v2 fields (trial, payToken, fundsReleased). */
  async getSubscriptionDetail(subscriptionId) {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: [SUBSCRIPTION_ABI_V2.getSubscriptionDetail],
      functionName: "getSubscriptionDetail",
      args: [BigInt(subscriptionId)]
    });
    const [
      sid,
      sub,
      aId,
      status,
      started,
      expires,
      period,
      payToken,
      amountPaid,
      trialActive,
      trialEndsAt,
      fundsReleased
    ] = result;
    return {
      subscriptionId: Number(sid),
      subscriber: sub,
      agentId: Number(aId),
      status,
      startedAt: Number(started),
      expiresAt: Number(expires),
      period,
      payToken,
      amountPaid,
      trialActive,
      trialEndsAt: Number(trialEndsAt),
      fundsReleased
    };
  }
  async getUserSubscriptions(user) {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: [SUBSCRIPTION_ABI_V2.getUserSubscriptions],
      functionName: "getUserSubscriptions",
      args: [user]
    });
    return result.map(Number);
  }
};
async function guardSubscription(manager, user, agentId) {
  const active = await manager.hasActiveSubscription(user, agentId);
  if (!active) {
    throw new Error(
      `No active subscription for agent #${agentId}. Address ${user} must purchase a subscription first.`
    );
  }
  const sub = await manager.getSubscription(user, agentId);
  if (!sub) throw new Error(`Subscription not found for agent #${agentId}`);
  return sub;
}

// src/subscription/agent-x402.ts
var getPlanAbi = {
  inputs: [{ name: "planId", type: "uint256" }],
  name: "getPlan",
  outputs: [
    { name: "planId", type: "uint256" },
    { name: "agentId", type: "uint256" },
    { name: "creator", type: "address" },
    { name: "price", type: "uint256" },
    { name: "period", type: "string" },
    { name: "active", type: "bool" },
    { name: "payToken", type: "address" },
    { name: "trialDays", type: "uint256" }
  ],
  stateMutability: "view",
  type: "function"
};
var subscribeAbi = {
  inputs: [{ name: "planId", type: "uint256" }],
  name: "subscribe",
  outputs: [{ name: "subscriptionId", type: "uint256" }],
  stateMutability: "payable",
  type: "function"
};
var hasActiveSubAbi = {
  inputs: [
    { name: "subscriber", type: "address" },
    { name: "agentId", type: "uint256" }
  ],
  name: "hasActiveSubscription",
  outputs: [{ name: "", type: "bool" }],
  stateMutability: "view",
  type: "function"
};
var AgentX402 = class {
  constructor(config) {
    this.config = config;
  }
  config;
  /**
   * Require active subscription — or throw with auto-pay info.
   *
   * Usage:
   *   await x402.requireSubscription(agentId, address, { planIds: [1,2,3] })
   *
   * On success, returns silently.
   * On failure, throws AgentXError with paymentInfo populated
   * so the caller can auto-pay via wallet/X402.
   */
  async requireSubscription(agentId, address, opts) {
    const { publicClient, subscriptionManagerAddress } = this.config;
    const isActive = await publicClient.readContract({
      address: subscriptionManagerAddress,
      abi: [hasActiveSubAbi],
      functionName: "hasActiveSubscription",
      args: [address, BigInt(agentId)]
    });
    if (isActive) return;
    const plans = [];
    if (opts?.planIds && opts.planIds.length > 0) {
      for (const planId of opts.planIds) {
        try {
          const plan = await publicClient.readContract({
            address: subscriptionManagerAddress,
            abi: [getPlanAbi],
            functionName: "getPlan",
            args: [BigInt(planId)]
          });
          const planAgentId = Number(plan[1]);
          const planActive = plan[5];
          if (planActive && planAgentId === agentId) {
            plans.push({
              planId: Number(plan[0]),
              price: plan[3],
              period: plan[4],
              payToken: plan[6],
              trialDays: Number(plan[7])
            });
          }
        } catch {
        }
      }
    }
    const err = new AgentXError(
      "NOT_SUBSCRIBED" /* NOT_SUBSCRIBED */,
      `No active subscription for Agent #${agentId}. Use error.paymentInfo for auto-subscribe via X402/wallet.`
    );
    err.paymentInfo = {
      agentId,
      plans: plans.length > 0 ? plans : void 0
    };
    throw err;
  }
  /**
   * Subscribe to a plan + wait for receipt.
   * Returns subscriptionId from the Subscribed event.
   *
   * NOTE: For ERC20 plans, the caller must approve token spending
   * BEFORE calling this method. Use X402 SDK or wagmi's useWriteContract
   * for the approve step.
   */
  async subscribeAndWait(planId, price, payToken) {
    const { publicClient, walletClient, subscriptionManagerAddress } = this.config;
    const isETH = payToken === "0x0000000000000000000000000000000000000000";
    const { request } = await publicClient.simulateContract({
      address: subscriptionManagerAddress,
      abi: [subscribeAbi],
      functionName: "subscribe",
      args: [BigInt(planId)],
      account: walletClient.account?.address,
      value: isETH ? price : 0n
    });
    const hash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const subIdHex = receipt.logs[0]?.topics?.[1];
    if (!subIdHex || subIdHex === "0x") {
      throw new Error("Failed to parse subscriptionId from Subscribed event");
    }
    return Number(BigInt(subIdHex));
  }
};

// src/subscription/index.ts
var SUBSCRIPTION_VERSION = "0.2.0";

// src/mcp/connector.ts
var MCPConnector = class _MCPConnector {
  config;
  constructor(config) {
    this.config = { timeoutMs: 3e4, transport: "http", ...config };
  }
  /** Create from an Agent's McpConnection. */
  static fromAgent(mcp, opts) {
    return new _MCPConnector({
      url: mcp.url ?? "",
      transport: mcp.type === "sse" ? "sse" : "http",
      authHeader: mcp.authHeader,
      ...opts
    });
  }
  // ── Tool Discovery ───────────────────────────────────────────────────────
  /** List available tools from the MCP server. */
  async listTools() {
    const res = await this._request("tools/list", {});
    return res.tools ?? [];
  }
  // ── Tool Execution ───────────────────────────────────────────────────────
  /** Call a tool on the MCP server. */
  async callTool(name, args = {}) {
    return this._request("tools/call", { name, arguments: args });
  }
  // ── Resources (optional) ─────────────────────────────────────────────────
  async listResources() {
    const res = await this._request("resources/list", {});
    return res.resources ?? [];
  }
  async readResource(uri) {
    return this._request("resources/read", { uri });
  }
  // ── Internal ─────────────────────────────────────────────────────────────
  async _request(method, params) {
    const headers = {
      "Content-Type": "application/json"
    };
    if (this.config.authHeader) {
      headers["Authorization"] = this.config.authHeader;
    }
    if (this.config.subscriberAddress) {
      headers["X-Subscriber-Address"] = this.config.subscriberAddress;
    }
    if (this.config.signature) {
      headers["X-Signature"] = this.config.signature;
    }
    if (this.config.timestamp) {
      headers["X-Timestamp"] = String(this.config.timestamp);
    }
    const res = await fetch(this.config.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 3e4)
    });
    if (!res.ok) {
      throw new Error(`MCP request failed: HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.error) {
      throw new Error(`MCP error: ${data.error.message}`);
    }
    return data.result ?? {};
  }
};

// src/mcp/index.ts
var MCP_VERSION = "0.1.0";

// src/reputation/reputation.ts
var REPUTATION_ABI = {
  rateAgent: {
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "rating", type: "uint8" },
      { name: "comment", type: "string" }
    ],
    name: "rateAgent",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  getRating: {
    inputs: [{ name: "agentId", type: "uint256" }],
    name: "getRating",
    outputs: [
      { name: "averageRating", type: "uint256" },
      { name: "totalRatings", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  getReviews: {
    inputs: [{ name: "agentId", type: "uint256" }],
    name: "getReviews",
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "reviewer", type: "address" },
          { name: "rating", type: "uint8" },
          { name: "comment", type: "string" },
          { name: "timestamp", type: "uint256" }
        ]
      }
    ],
    stateMutability: "view",
    type: "function"
  }
};
var ReputationRegistry = class {
  address;
  publicClient;
  walletClient;
  constructor(config) {
    this.address = config.contractAddress;
    this.publicClient = config.publicClient;
    this.walletClient = config.walletClient;
  }
  get account() {
    return this.walletClient.getAddresses().then((a) => {
      if (!a[0]) throw new Error("Wallet not connected");
      return a[0];
    });
  }
  /** Submit a rating (1-5) with optional comment. */
  async rate(agentId, rating, comment = "") {
    if (rating < 1 || rating > 5) throw new Error("Rating must be 1-5");
    const acct = await this.account;
    const { request } = await this.publicClient.simulateContract({
      account: acct,
      address: this.address,
      abi: [REPUTATION_ABI.rateAgent],
      functionName: "rateAgent",
      args: [BigInt(agentId), rating, comment]
    });
    return this.walletClient.writeContract(request);
  }
  /** Get average rating and total count. */
  async getRating(agentId) {
    const r = await this.publicClient.readContract({
      address: this.address,
      abi: [REPUTATION_ABI.getRating],
      functionName: "getRating",
      args: [BigInt(agentId)]
    });
    const [avg, total] = r;
    return { averageRating: Number(avg), totalRatings: Number(total) };
  }
  /** Get all reviews for an agent. */
  async getReviews(agentId) {
    const r = await this.publicClient.readContract({
      address: this.address,
      abi: [REPUTATION_ABI.getReviews],
      functionName: "getReviews",
      args: [BigInt(agentId)]
    });
    return r.map((x) => ({
      reviewer: x.reviewer,
      rating: x.rating,
      comment: x.comment,
      timestamp: Number(x.timestamp)
    }));
  }
  /** Get full reputation summary. */
  async getReputation(agentId) {
    const [rating, reviews] = await Promise.all([
      this.getRating(agentId),
      this.getReviews(agentId)
    ]);
    return { agentId, ...rating, reviews };
  }
};

// src/reputation/index.ts
var REPUTATION_VERSION = "0.1.0";

// src/config/config.ts
var CONFIG_ABI = {
  setConfig: {
    inputs: [{ name: "key", type: "string" }, { name: "value", type: "bytes" }],
    name: "setConfig",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  getConfig: {
    inputs: [{ name: "key", type: "string" }],
    name: "getConfig",
    outputs: [{ name: "", type: "bytes" }],
    stateMutability: "view",
    type: "function"
  },
  getAllConfig: {
    inputs: [],
    name: "getAllConfig",
    outputs: [{ name: "", type: "tuple[]", components: [{ name: "key", type: "string" }, { name: "value", type: "bytes" }] }],
    stateMutability: "view",
    type: "function"
  }
};
var KNOWN_CHAINS = {
  // Sepolia Testnet
  // v3 (deployed 2026-07-13): platformFee=250bps(2.5%), ReentrancyGuard, audit fixes
  11155111: {
    chainId: 11155111,
    contracts: {
      identityRegistry: "0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F",
      subscriptionManager: "0xC15fE80b9d800abb72121F353a6ae6d6E9077E63",
      a2aProtocolRegistry: "0x309C7447d89f3087A9924BB686d88df020F7e9cB",
      reputationRegistry: "0xeb6B410ea71b8d9dA0c96f6A91d35027CE143DC9",
      configurationRegistry: "0x68DcE00e4C9077c94BC68016cD14B09557faEA6c",
      multiEndpointRegistry: "0xEB5e866f186d4B73F97aa0d70B86f2C6e2e21Cb7"
    },
    ipfsGateways: ["ipfs.io", "gateway.pinata.cloud", "dweb.link", "cf-ipfs.com"]
  },
  // OxaChain L1 Mainnet
  // Chain ID 19505, Clique PoA, Shanghai+Cancun, gas token OXA
  // Deployer: 0x8E869A0624fF9e766Df71b5B08897d00E4d260ba
  // RPC: https://rpc-oxa.0xainet.top
  // Explorer: https://explorer-oxa.0xainet.top
  // All 6 core contracts deployed 2026-07-14
  19505: {
    chainId: 19505,
    contracts: {
      identityRegistry: "0xbf5F9db266c8c97E3334466C88597Eb758AfE212",
      subscriptionManager: "0x019AC9d945467478Dd371CDbD70cb2f325800E6B",
      a2aProtocolRegistry: "0x7F42a7dC4A0F3C107664C3750bE1B5B6fa6BEb86",
      reputationRegistry: "0x6a18C2664E1b42063860d864b6448b824d7B843F",
      configurationRegistry: "0x07280674ccc2898Fd038A9e3C22005CA83ffD2F8",
      multiEndpointRegistry: "0xB361d04F49000013FC131D3C59C41c8486C64f8c"
    },
    ipfsGateways: ["ipfs.io", "gateway.pinata.cloud", "dweb.link", "cf-ipfs.com"],
    rpcUrl: "https://rpc-oxa.0xainet.top"
  }
};
var ConfigurationRegistry = class {
  address;
  publicClient;
  walletClient;
  constructor(opts) {
    this.address = opts.contractAddress;
    this.publicClient = opts.publicClient;
    this.walletClient = opts.walletClient;
  }
  get account() {
    return this.walletClient.getAddresses().then((a) => {
      if (!a[0]) throw new Error("Wallet not connected");
      return a[0];
    });
  }
  async set(key, value) {
    const acct = await this.account;
    const { request } = await this.publicClient.simulateContract({
      account: acct,
      address: this.address,
      abi: [CONFIG_ABI.setConfig],
      functionName: "setConfig",
      args: [key, stringToHex(value)]
    });
    return this.walletClient.writeContract(request);
  }
  async get(key) {
    const r = await this.publicClient.readContract({
      address: this.address,
      abi: [CONFIG_ABI.getConfig],
      functionName: "getConfig",
      args: [key]
    });
    return hexToString(r);
  }
  async getAll() {
    const r = await this.publicClient.readContract({
      address: this.address,
      abi: [CONFIG_ABI.getAllConfig],
      functionName: "getAllConfig"
    });
    const map = {};
    for (const { key, value } of r) {
      map[key] = hexToString(value);
    }
    return map;
  }
};

// src/config/index.ts
var CONFIG_VERSION = "0.1.0";

// src/endpoint/multi-endpoint.ts
var ABI = [
  {
    name: "getActiveAgentEndpoints",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{
      type: "tuple[]",
      components: [
        { name: "endpointId", type: "uint256" },
        { name: "agentId", type: "uint256" },
        { name: "name", type: "string" },
        { name: "endpointType", type: "string" },
        { name: "protocol", type: "string" },
        { name: "url", type: "string" },
        { name: "description", type: "string" },
        { name: "isActive", type: "bool" },
        { name: "createdAt", type: "uint256" },
        { name: "updatedAt", type: "uint256" },
        { name: "createdBy", type: "address" }
      ]
    }]
  },
  {
    name: "getAgentEndpoints",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{
      type: "tuple[]",
      components: [
        { name: "endpointId", type: "uint256" },
        { name: "agentId", type: "uint256" },
        { name: "name", type: "string" },
        { name: "endpointType", type: "string" },
        { name: "protocol", type: "string" },
        { name: "url", type: "string" },
        { name: "description", type: "string" },
        { name: "isActive", type: "bool" },
        { name: "createdAt", type: "uint256" },
        { name: "updatedAt", type: "uint256" },
        { name: "createdBy", type: "address" }
      ]
    }]
  },
  {
    name: "createEndpoint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "name", type: "string" },
      { name: "endpointType", type: "string" },
      { name: "protocol", type: "string" },
      { name: "url", type: "string" },
      { name: "description", type: "string" }
    ],
    outputs: [{ name: "endpointId", type: "uint256" }]
  },
  {
    name: "getEndpoint",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "endpointId", type: "uint256" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "endpointId", type: "uint256" },
        { name: "agentId", type: "uint256" },
        { name: "name", type: "string" },
        { name: "endpointType", type: "string" },
        { name: "protocol", type: "string" },
        { name: "url", type: "string" },
        { name: "description", type: "string" },
        { name: "isActive", type: "bool" },
        { name: "createdAt", type: "uint256" },
        { name: "updatedAt", type: "uint256" },
        { name: "createdBy", type: "address" }
      ]
    }]
  },
  {
    name: "getSupportedProtocols",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string[]" }]
  },
  {
    name: "getAgentEndpointStats",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      { name: "totalEndpoints", type: "uint256" },
      { name: "activeEndpoints", type: "uint256" },
      { name: "httpEndpoints", type: "uint256" },
      { name: "websocketEndpoints", type: "uint256" },
      { name: "grpcEndpoints", type: "uint256" }
    ]
  }
];
var MultiEndpointClient = class {
  address;
  publicClient;
  constructor(config, publicClient) {
    this.address = config.address;
    this.publicClient = publicClient ?? null;
  }
  setPublicClient(client) {
    this.publicClient = client;
  }
  async getActiveEndpoints(agentId) {
    if (!this.publicClient) throw new Error("publicClient not set");
    return await this.publicClient.readContract({
      address: this.address,
      abi: ABI,
      functionName: "getActiveAgentEndpoints",
      args: [agentId]
    });
  }
  async getAllEndpoints(agentId) {
    if (!this.publicClient) throw new Error("publicClient not set");
    return await this.publicClient.readContract({
      address: this.address,
      abi: ABI,
      functionName: "getAgentEndpoints",
      args: [agentId]
    });
  }
  async getEndpoint(endpointId) {
    if (!this.publicClient) throw new Error("publicClient not set");
    return await this.publicClient.readContract({
      address: this.address,
      abi: ABI,
      functionName: "getEndpoint",
      args: [endpointId]
    });
  }
  async getStats(agentId) {
    if (!this.publicClient) throw new Error("publicClient not set");
    return await this.publicClient.readContract({
      address: this.address,
      abi: ABI,
      functionName: "getAgentEndpointStats",
      args: [agentId]
    });
  }
  /** Pick best active endpoint for the agent — prefer HTTP, take first active */
  async pickBestEndpoint(agentId) {
    const endpoints = await this.getActiveEndpoints(agentId);
    if (endpoints.length === 0) return null;
    const http = endpoints.find((e) => e.protocol === "HTTP");
    return http ?? endpoints[0] ?? null;
  }
  /** Pick any active endpoint URL — for MCP connector */
  async getBestMCPUrl(agentId) {
    const best = await this.pickBestEndpoint(agentId);
    return best?.url ?? null;
  }
};

// src/configuration/configuration.ts
var ABI2 = [
  {
    name: "getConfig",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "configKey", type: "string" }
    ],
    outputs: [{
      type: "tuple",
      components: [
        { name: "agentId", type: "uint256" },
        { name: "key", type: "string" },
        { name: "value", type: "string" },
        { name: "dataType", type: "string" },
        { name: "updatedAt", type: "uint256" },
        { name: "updatedBy", type: "address" }
      ]
    }]
  },
  {
    name: "getAgentConfigs",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{
      type: "tuple[]",
      components: [
        { name: "agentId", type: "uint256" },
        { name: "key", type: "string" },
        { name: "value", type: "string" },
        { name: "dataType", type: "string" },
        { name: "updatedAt", type: "uint256" },
        { name: "updatedBy", type: "address" }
      ]
    }]
  },
  {
    name: "getConfigKeys",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "string[]" }]
  },
  {
    name: "getConfigCount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "uint256" }]
  },
  {
    name: "configExists",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "configKey", type: "string" }
    ],
    outputs: [{ type: "bool" }]
  }
];
var ConfigurationClient = class {
  address;
  publicClient;
  constructor(config, publicClient) {
    this.address = config.address;
    this.publicClient = publicClient ?? null;
  }
  setPublicClient(client) {
    this.publicClient = client;
  }
  async get(agentId, key) {
    if (!this.publicClient) throw new Error("publicClient not set");
    try {
      return await this.publicClient.readContract({
        address: this.address,
        abi: ABI2,
        functionName: "getConfig",
        args: [agentId, key]
      });
    } catch {
      return null;
    }
  }
  async getAll(agentId) {
    if (!this.publicClient) throw new Error("publicClient not set");
    return await this.publicClient.readContract({
      address: this.address,
      abi: ABI2,
      functionName: "getAgentConfigs",
      args: [agentId]
    });
  }
  async getKeys(agentId) {
    if (!this.publicClient) throw new Error("publicClient not set");
    return await this.publicClient.readContract({
      address: this.address,
      abi: ABI2,
      functionName: "getConfigKeys",
      args: [agentId]
    });
  }
  async getCount(agentId) {
    if (!this.publicClient) throw new Error("publicClient not set");
    return await this.publicClient.readContract({
      address: this.address,
      abi: ABI2,
      functionName: "getConfigCount",
      args: [agentId]
    });
  }
  async exists(agentId, key) {
    if (!this.publicClient) throw new Error("publicClient not set");
    return await this.publicClient.readContract({
      address: this.address,
      abi: ABI2,
      functionName: "configExists",
      args: [agentId, key]
    });
  }
};

// src/ipfs/ipfs-uploader.ts
var IPFSUploader = class _IPFSUploader {
  pinataJwt;
  customEndpoint;
  customApiKey;
  gatewayUrl;
  timeoutMs;
  pinataGroupId;
  namePrefix;
  static PINATA_JSON_API = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
  static PINATA_FILE_API = "https://api.pinata.cloud/pinning/pinFileToIPFS";
  constructor(config = {}) {
    this.pinataJwt = config.pinataJwt ?? null;
    this.customEndpoint = config.customEndpoint ?? null;
    this.customApiKey = config.customApiKey ?? null;
    this.gatewayUrl = config.gatewayUrl ?? "https://ipfs.io";
    this.timeoutMs = config.timeoutMs ?? 3e4;
    this.pinataGroupId = config.pinataGroupId ?? null;
    this.namePrefix = config.namePrefix ?? "agentx-";
  }
  isConfigured() {
    if (this.customEndpoint) return true;
    return !!this.pinataJwt;
  }
  // ── JSON Upload ───────────────────────────────────────────────────────
  /**
   * Upload JSON-serializable data to IPFS.
   *
   * @param data       Any JSON-serializable value
   * @param metadata   Optional name / keyvalues for Pinata metadata
   */
  async uploadJSON(data, metadata) {
    const endpoint = this.customEndpoint ?? _IPFSUploader.PINATA_JSON_API;
    const body = {
      pinataContent: data,
      pinataMetadata: {
        name: this.namePrefix + (metadata?.name ?? `json-${Date.now()}`),
        keyvalues: metadata?.keyvalues ?? {}
      }
    };
    if (this.pinataGroupId) {
      ;
      body.pinataMetadata.groupId = this.pinataGroupId;
    }
    return this._doFetch(endpoint, body);
  }
  // ── File Upload ───────────────────────────────────────────────────────
  /**
   * Upload a file / Blob / Buffer / Uint8Array / string to IPFS.
   */
  async uploadFile(content, fileName, mimeType) {
    const endpoint = this.customEndpoint ?? _IPFSUploader.PINATA_FILE_API;
    const formData = new FormData();
    const blobPart = content instanceof Blob ? content : typeof Buffer !== "undefined" && Buffer.isBuffer(content) ? new Uint8Array(content) : content instanceof Uint8Array ? content : content;
    const blob = new Blob([blobPart], { type: mimeType ?? "application/octet-stream" });
    formData.append("file", blob, fileName ?? `file-${Date.now()}`);
    const metadata = JSON.stringify({
      name: this.namePrefix + (fileName ?? `file-${Date.now()}`),
      ...this.pinataGroupId ? { groupId: this.pinataGroupId } : {}
    });
    formData.append("pinataMetadata", metadata);
    return this._doFetch(endpoint, formData);
  }
  // ── Encrypted Payload Upload (AgentX specific) ────────────────────────
  /**
   * Upload an encrypted agent payload to IPFS.
   * This is the primary method used by Agent Studio publish flow.
   */
  async uploadEncryptedPayload(payload, agentName) {
    return this.uploadJSON(payload, { name: agentName ?? "agent-payload" });
  }
  // ── Convenience ──────────────────────────────────────────────────────────
  async uploadString(content, name) {
    return this.uploadJSON({ content }, { name: name ?? "string-data" });
  }
  /** Build a public access URL from a CID. */
  getUrl(cid) {
    return `${this.gatewayUrl}/ipfs/${cid}`;
  }
  // ── Internal ─────────────────────────────────────────────────────────────
  async _doFetch(url, body) {
    const headers = {};
    if (url === _IPFSUploader.PINATA_JSON_API || url === _IPFSUploader.PINATA_FILE_API) {
      if (!this.pinataJwt) throw new Error("Pinata JWT is not configured");
      headers["Authorization"] = `Bearer ${this.pinataJwt}`;
    } else if (this.customApiKey) {
      headers["Authorization"] = `Bearer ${this.customApiKey}`;
    }
    if (!(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout?.(this.timeoutMs)
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`IPFS upload failed: HTTP ${res.status} \u2014 ${errText.slice(0, 200)}`);
    }
    const raw = await res.json();
    const cid = raw.IpfsHash || raw.cid || raw.Hash;
    if (!cid || typeof cid !== "string") throw new Error("Upload succeeded but no CID returned");
    return { cid, url: this.getUrl(cid), raw };
  }
};
var defaultIPFSUploader = new IPFSUploader();

// src/react/useAgentRunner.ts
import { useState, useEffect, useRef } from "react";
import { usePublicClient, useWalletClient } from "wagmi";
var IDENTITY_REGISTRY_ABI2 = [
  // getAgentMetadata returns MetadataEntry[] with key+value strings
  {
    name: "getAgentMetadata",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "key", type: "string" },
          { name: "value", type: "bytes" }
        ]
      }
    ]
  }
];
var SUBSCRIPTION_MANAGER_ABI = [
  {
    name: "hasActiveSubscription",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "subscriber", type: "address" },
      { name: "agentId", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
];
var ViemOnChainReader = class {
  constructor(publicClient, chainConfig) {
    this.publicClient = publicClient;
    this.chainConfig = chainConfig;
  }
  publicClient;
  chainConfig;
  async getTokenURI(_agentId) {
    return "";
  }
  async getAttributes(agentId) {
    if (!this.publicClient) throw new Error("Public client not available");
    const entries = await this.publicClient.readContract({
      address: this.chainConfig.contracts.identityRegistry,
      abi: IDENTITY_REGISTRY_ABI2,
      functionName: "getAgentMetadata",
      args: [BigInt(agentId)]
    });
    const attrs = {};
    for (const entry of entries) {
      const hexStr = entry.value;
      if (hexStr && hexStr !== "0x") {
        attrs[entry.key] = hexToStringUTF8(hexStr);
      } else {
        attrs[entry.key] = "";
      }
    }
    return attrs;
  }
  async hasActiveSubscription(address, agentId) {
    if (!this.publicClient) return false;
    try {
      return await this.publicClient.readContract({
        address: this.chainConfig.contracts.subscriptionManager,
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: "hasActiveSubscription",
        args: [address, BigInt(agentId)]
      });
    } catch {
      return false;
    }
  }
};
function hexToStringUTF8(hex) {
  if (!hex.startsWith("0x")) return hex;
  const hexClean = hex.slice(2);
  if (hexClean.length === 0) return "";
  try {
    const bytes = new Uint8Array(hexClean.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hexClean.substring(i * 2, i * 2 + 2), 16);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return hex;
  }
}
function useAgentRunner(config) {
  const { agentId, chainConfig: chainConfigOverride, ipfsGateways } = config;
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [ctx, setCtx] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refetchKey, setRefetchKey] = useState(0);
  const runnerRef = useRef(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    if (!publicClient || !walletClient) {
      setError(new Error("Wallet not connected"));
      return;
    }
    const chainConfig = chainConfigOverride ?? (publicClient.chain?.id ? KNOWN_CHAINS[publicClient.chain.id] : void 0);
    if (!chainConfig) {
      setError(new Error(`Chain ${publicClient.chain?.id} not supported`));
      return;
    }
    const reader = new ViemOnChainReader(publicClient, chainConfig);
    const signer = {
      async signMessage(message) {
        if (!walletClient.account) throw new Error("Wallet not connected");
        return walletClient.signMessage({ account: walletClient.account, message });
      },
      async getAddress() {
        if (!walletClient.account) throw new Error("Wallet not connected");
        return walletClient.account.address;
      },
      async getPrivateKey() {
        throw new Error(
          'Private key not available via wagmi. Use window.ethereum.request({ method: "eth_private_key" }) or inject getPrivateKey via custom WalletSigner.'
        );
      }
    };
    const ipfsFetcher = new IPFSFetcher({
      fallbackGateways: ipfsGateways ?? chainConfig.ipfsGateways ?? [
        "gateway.pinata.cloud",
        "dweb.link",
        "cf-ipfs.com"
      ]
    });
    runnerRef.current = new AgentRunner({
      reader,
      wallet: signer,
      ipfsFetcher
    });
    setIsLoading(true);
    setError(null);
    runnerRef.current.useAgent(agentId).then((result) => {
      if (mountedRef.current) {
        setCtx(result);
        setIsLoading(false);
      }
    }).catch((err) => {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      }
    });
    return () => {
      mountedRef.current = false;
    };
  }, [agentId, publicClient?.chain?.id, publicClient, walletClient, refetchKey]);
  const refetch = () => setRefetchKey((k) => k + 1);
  return { ctx, isLoading, error, refetch };
}
export {
  A2ADaemon,
  A2AProtocol,
  A2A_VERSION,
  AgentLoop,
  AgentRegistry,
  AgentRunner,
  AgentX402,
  AgentXError,
  AgentXErrorCode,
  CONFIG_VERSION,
  ConfigurationClient,
  ConfigurationRegistry,
  GatewayProvider,
  IPFSFetcher,
  IPFSUploader,
  KNOWN_CHAINS,
  MCPConnector,
  MCP_VERSION,
  MultiEndpointClient,
  OpenAIProvider,
  REGISTRY_VERSION,
  REPUTATION_VERSION,
  ReputationRegistry,
  SUBSCRIPTION_VERSION,
  SubscriptionManager,
  ToolExecutor,
  aesDecrypt,
  aesEncrypt,
  buildPlatformTools,
  buildSystemPrompt,
  buildTools,
  bytesToHex,
  cidFromURI,
  createLLMProvider,
  decryptPayload,
  defaultIPFSFetcher,
  defaultIPFSUploader,
  eciesDecrypt,
  eciesEncrypt,
  encryptPayload,
  executePlatformTool,
  generateAesKey,
  generateKeyPair,
  getAllPlatformToolNames,
  getPublicKey,
  guardSubscription,
  hexToBytes,
  packAgentForPublish,
  publishAgent,
  randomBytes,
  unpackAgent,
  useAgentRunner,
  wrapPlatformToolsAsSkills
};
