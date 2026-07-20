"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
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

// src/core/crypto.ts
var crypto_exports = {};
__export(crypto_exports, {
  aesDecrypt: () => aesDecrypt,
  aesEncrypt: () => aesEncrypt,
  bytesToHex: () => import_utils.bytesToHex,
  decryptPayload: () => decryptPayload,
  eciesDecrypt: () => eciesDecrypt,
  eciesEncrypt: () => eciesEncrypt,
  encryptPayload: () => encryptPayload,
  generateAesKey: () => generateAesKey,
  generateKeyPair: () => generateKeyPair,
  getPublicKey: () => getPublicKey,
  hexToBytes: () => import_utils.hexToBytes,
  packAgentForPublish: () => packAgentForPublish,
  publishAgent: () => publishAgent,
  randomBytes: () => randomBytes,
  unpackAgent: () => unpackAgent
});
function randomBytes(length) {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint8Array(length);
    crypto.getRandomValues(buf);
    return buf;
  }
  const nodeCrypto = require("crypto");
  return new Uint8Array(nodeCrypto.randomBytes(length));
}
function toBase64(bytes) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function fromBase64(b64) {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function aesEncrypt(plaintext, keyHex) {
  const key = (0, import_utils.hexToBytes)(keyHex);
  const iv = randomBytes(IV_SIZE);
  const plainBytes = new TextEncoder().encode(plaintext);
  const cipher = (0, import_aes.gcm)(key, iv);
  const encrypted = cipher.encrypt(plainBytes);
  const ciphertext = encrypted.subarray(0, -TAG_SIZE);
  const authTag = encrypted.subarray(-TAG_SIZE);
  const combined = new Uint8Array(IV_SIZE + ciphertext.length + TAG_SIZE);
  combined.set(iv, 0);
  combined.set(ciphertext, IV_SIZE);
  combined.set(authTag, IV_SIZE + ciphertext.length);
  return toBase64(combined);
}
function aesDecrypt(encryptedBase64, keyHex) {
  const key = (0, import_utils.hexToBytes)(keyHex);
  const combined = fromBase64(encryptedBase64);
  const iv = combined.subarray(0, IV_SIZE);
  const ciphertext = combined.subarray(IV_SIZE, -TAG_SIZE);
  const authTag = combined.subarray(-TAG_SIZE);
  const cipher = (0, import_aes.gcm)(key, iv);
  const ciphertextWithTag = new Uint8Array(ciphertext.length + TAG_SIZE);
  ciphertextWithTag.set(ciphertext, 0);
  ciphertextWithTag.set(authTag, ciphertext.length);
  const decrypted = cipher.decrypt(ciphertextWithTag);
  return new TextDecoder().decode(decrypted);
}
function generateAesKey() {
  return (0, import_utils.bytesToHex)(randomBytes(AES_KEY_SIZE));
}
function eciesEncode(ephemeralPub, iv, ciphertext, mac) {
  const out = new Uint8Array(33 + 16 + ciphertext.length + 32);
  out.set(ephemeralPub, 0);
  out.set(iv, 33);
  out.set(ciphertext, 33 + 16);
  out.set(mac, 33 + 16 + ciphertext.length);
  return (0, import_utils.bytesToHex)(out);
}
function eciesDecode(dataHex) {
  const d = (0, import_utils.hexToBytes)(dataHex);
  return {
    ephemeralPub: d.subarray(0, 33),
    iv: d.subarray(33, 49),
    ciphertext: d.subarray(49, -32),
    mac: d.subarray(-32)
  };
}
function aesCtrEncrypt(key, ctrBytes, data) {
  const blockSize = 16;
  const cipher = (0, import_aes.gcm)(key, ctrBytes);
  const result = new Uint8Array(data.length);
  const counter = new Uint8Array(blockSize);
  counter.set(ctrBytes);
  for (let i = 0; i < data.length; i += blockSize) {
    const keystream = (0, import_aes.gcm)(key, counter).encrypt(new Uint8Array(blockSize));
    for (let j = 0; j < blockSize && i + j < data.length; j++) {
      result[i + j] = keystream[j] ^ data[i + j];
    }
    for (let j = blockSize - 1; j >= 0; j--) {
      const val = counter[j];
      if (val !== void 0) {
        counter[j] = val + 1 & 255;
        if (counter[j] !== 0) break;
      }
    }
  }
  return result;
}
function eciesEncrypt(dataHex, publicKey) {
  const ephPriv = randomBytes(32);
  const ephPub = import_secp256k1.secp256k1.getPublicKey(ephPriv, true);
  let recipientPub;
  if (publicKey.startsWith("04") && publicKey.length === 130) {
    recipientPub = (0, import_utils.hexToBytes)(publicKey);
  } else if (publicKey.startsWith("02") || publicKey.startsWith("03")) {
    recipientPub = (0, import_utils.hexToBytes)(publicKey);
  } else {
    throw new Error("Invalid public key format: expected hex with 02/03/04 prefix");
  }
  const shared = import_secp256k1.secp256k1.getSharedSecret(ephPriv, recipientPub);
  const sharedX = shared.subarray(1, 33);
  const sharedKey = (0, import_sha2.sha256)(sharedX);
  const hkdfOut = (0, import_hkdf.hkdf)(import_sha2.sha256, sharedKey, void 0, void 0, 64);
  const encKey = hkdfOut.subarray(0, 32);
  const macKey = hkdfOut.subarray(32, 64);
  const iv = randomBytes(16);
  const plaintext = (0, import_utils.hexToBytes)(dataHex);
  const ciphertext = aesCtrEncrypt(encKey, iv, plaintext);
  const macInput = new Uint8Array(33 + 16 + ciphertext.length);
  macInput.set(ephPub, 0);
  macInput.set(iv, 33);
  macInput.set(ciphertext, 33 + 16);
  const mac = (0, import_hmac.hmac)(import_sha2.sha256, macKey, macInput);
  return eciesEncode(ephPub, iv, ciphertext, mac);
}
function eciesDecrypt(dataHex, privateKey) {
  const { ephemeralPub, iv, ciphertext, mac } = eciesDecode(dataHex);
  const privBytes = (0, import_utils.hexToBytes)(privateKey);
  const shared = import_secp256k1.secp256k1.getSharedSecret(privBytes, ephemeralPub);
  const sharedX = shared.subarray(1, 33);
  const sharedKey = (0, import_sha2.sha256)(sharedX);
  const hkdfOut = (0, import_hkdf.hkdf)(import_sha2.sha256, sharedKey, void 0, void 0, 64);
  const encKey = hkdfOut.subarray(0, 32);
  const macKey = hkdfOut.subarray(32, 64);
  const macInput = new Uint8Array(33 + 16 + ciphertext.length);
  macInput.set(ephemeralPub, 0);
  macInput.set(iv, 33);
  macInput.set(ciphertext, 33 + 16);
  const expectedMac = (0, import_hmac.hmac)(import_sha2.sha256, macKey, macInput);
  if (!constantTimeEqual(mac, expectedMac)) {
    throw new Error("ECIES decryption failed: MAC mismatch");
  }
  const plaintext = aesCtrEncrypt(encKey, iv, ciphertext);
  return (0, import_utils.bytesToHex)(plaintext);
}
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
function encryptPayload(payload, keyHex) {
  const key = keyHex ?? generateAesKey();
  return {
    encrypted: true,
    algorithm: "AES-256-GCM",
    data: aesEncrypt(JSON.stringify(payload), key)
  };
}
function decryptPayload(encrypted, keyHex) {
  if (encrypted.algorithm !== "AES-256-GCM") {
    throw new Error(`Unsupported algorithm: ${encrypted.algorithm}`);
  }
  return JSON.parse(aesDecrypt(encrypted.data, keyHex));
}
function packAgentForPublish(agent, publicKey, aesKeyHex) {
  const key = aesKeyHex ?? generateAesKey();
  const eciesEncryptedKeyHex = eciesEncrypt(key, publicKey);
  return {
    encryptedCid: "",
    // filled after IPFS upload
    publicCid: "",
    // filled after IPFS upload
    aesKeyHex: key,
    eciesEncryptedKeyHex
  };
}
async function publishAgent(config) {
  const { agent, publicKey, uploader, aesKeyHex, agentName } = config;
  if (!uploader.isConfigured()) {
    throw new Error("IPFSUploader is not configured \u2014 set pinataJwt or customEndpoint");
  }
  const key = aesKeyHex ?? generateAesKey();
  const eciesEncryptedKeyHex = eciesEncrypt(key, publicKey);
  const privatePayload = {
    prompt: agent.prompt,
    skills: agent.skills,
    mcp: agent.mcp
  };
  const encryptedPayload = encryptPayload(privatePayload, key);
  const [encrypted, publicMeta] = await Promise.all([
    uploader.uploadEncryptedPayload(encryptedPayload, agentName),
    uploader.uploadJSON({
      name: agent.name,
      description: agent.description,
      version: agent.version,
      tags: agent.tags,
      capabilities: agent.capabilities,
      eciesKey: eciesEncryptedKeyHex
    })
  ]);
  const pack = {
    encryptedCid: encrypted.cid,
    publicCid: publicMeta.cid,
    aesKeyHex: key,
    eciesEncryptedKeyHex
  };
  return {
    aesKeyHex: key,
    eciesEncryptedKeyHex,
    encryptedCid: encrypted.cid,
    encryptedUrl: encrypted.url,
    publicCid: publicMeta.cid,
    publicUrl: publicMeta.url,
    pack,
    uploads: { encrypted, public: publicMeta }
  };
}
function unpackAgent(encryptedPayload, eciesEncryptedKey, privateKey) {
  const aesKeyHex = eciesDecrypt(eciesEncryptedKey, privateKey);
  return decryptPayload(encryptedPayload, aesKeyHex);
}
function generateKeyPair() {
  const priv = randomBytes(32);
  const pub = import_secp256k1.secp256k1.getPublicKey(priv, false);
  return { privateKey: (0, import_utils.bytesToHex)(priv), publicKey: (0, import_utils.bytesToHex)(pub) };
}
function getPublicKey(privateKey) {
  return (0, import_utils.bytesToHex)(import_secp256k1.secp256k1.getPublicKey((0, import_utils.hexToBytes)(privateKey), false));
}
var import_aes, import_secp256k1, import_sha2, import_hkdf, import_hmac, import_utils, AES_KEY_SIZE, IV_SIZE, TAG_SIZE;
var init_crypto = __esm({
  "src/core/crypto.ts"() {
    "use strict";
    import_aes = require("@noble/ciphers/aes.js");
    import_secp256k1 = require("@noble/curves/secp256k1.js");
    import_sha2 = require("@noble/hashes/sha2.js");
    import_hkdf = require("@noble/hashes/hkdf.js");
    import_hmac = require("@noble/hashes/hmac.js");
    import_utils = require("@noble/ciphers/utils.js");
    AES_KEY_SIZE = 32;
    IV_SIZE = 12;
    TAG_SIZE = 16;
  }
});

// src/agent-loop/index.ts
var agent_loop_exports = {};
__export(agent_loop_exports, {
  AgentLoop: () => AgentLoop,
  ToolExecutor: () => ToolExecutor,
  buildPlatformTools: () => buildPlatformTools,
  buildSystemPrompt: () => buildSystemPrompt,
  buildTools: () => buildTools,
  executePlatformTool: () => executePlatformTool,
  getAllPlatformToolNames: () => getAllPlatformToolNames,
  wrapPlatformToolsAsSkills: () => wrapPlatformToolsAsSkills
});
module.exports = __toCommonJS(agent_loop_exports);

// src/agent-loop/tool-builder.ts
function toOpenAIParameters(schema) {
  const result = { type: schema.type ?? "object" };
  if (schema.properties) {
    result.properties = convertProperties(schema.properties);
  }
  if (schema.required && Array.isArray(schema.required)) {
    result.required = schema.required;
  }
  if (schema.description) {
    result.description = schema.description;
  }
  return result;
}
function convertProperties(properties) {
  const out = {};
  for (const [key, prop] of Object.entries(properties)) {
    const converted = {};
    if (prop.type) converted.type = prop.type;
    if (prop.description) converted.description = prop.description;
    if (prop.items) converted.items = prop.items;
    if (prop.enum) converted.enum = prop.enum;
    if (prop.properties) {
      converted.properties = convertProperties(prop.properties);
    }
    if (prop.required) converted.required = prop.required;
    out[key] = converted;
  }
  return out;
}
function buildTools(skills) {
  if (!skills || skills.length === 0) return [];
  return skills.map((skill) => ({
    type: "function",
    function: {
      name: skill.name,
      description: skill.description || `Execute the "${skill.name}" skill`,
      parameters: toOpenAIParameters(skill.inputSchema)
    }
  }));
}
function buildSystemPrompt(prompt, skills) {
  if (!skills || skills.length === 0) return prompt;
  const skillList = skills.map((s) => `- **${s.name}**: ${s.description}`).join("\n");
  return `${prompt}

## Available Tools
You have access to the following tools. Use them when appropriate:
${skillList}`;
}

// src/agent-loop/executor.ts
var ToolExecutor = class {
  skills;
  timeoutMs;
  constructor(opts) {
    this.skills = /* @__PURE__ */ new Map();
    for (const s of opts.skills) {
      this.skills.set(s.name, s);
    }
    this.timeoutMs = opts.timeoutMs ?? 3e4;
  }
  executeSingle(name, args) {
    const startTime = Date.now();
    const skill = this.skills.get(name);
    if (!skill) {
      return Promise.resolve({
        callId: "",
        name,
        arguments: args,
        result: null,
        error: `Unknown tool: ${name}`,
        durationMs: Date.now() - startTime
      });
    }
    const executePromise = skill.execute(args);
    const timeoutPromise = new Promise(
      (_, reject) => setTimeout(() => reject(new Error(`Tool "${name}" timed out after ${this.timeoutMs}ms`)), this.timeoutMs)
    );
    return Promise.race([executePromise, timeoutPromise]).then((result) => ({
      callId: "",
      name,
      arguments: args,
      result: this.normalizeResult(result),
      durationMs: Date.now() - startTime
    })).catch((err) => ({
      callId: "",
      name,
      arguments: args,
      result: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startTime
    }));
  }
  async executeBatch(calls) {
    const results = await Promise.all(
      calls.map(async (c) => {
        const record = await this.executeSingle(c.name, c.arguments);
        record.callId = c.callId;
        return record;
      })
    );
    return results;
  }
  hasTool(name) {
    return this.skills.has(name);
  }
  getToolNames() {
    return Array.from(this.skills.keys());
  }
  normalizeResult(result) {
    if (result === void 0 || result === null) return null;
    if (typeof result === "string" || typeof result === "number" || typeof result === "boolean") {
      return result;
    }
    if (result instanceof Error) return { error: result.message };
    return result;
  }
};

// src/agent-loop/loop.ts
var DEFAULT_MAX_ITERATIONS = 5;
var DEFAULT_TIMEOUT_MS = 12e4;
var DEFAULT_MODEL = "gpt-4o";
var AgentLoop = class {
  config;
  executor;
  tools;
  systemPrompt;
  aborted = false;
  abortController = null;
  constructor(config) {
    this.config = {
      ctx: config.ctx,
      llmProvider: config.llmProvider,
      maxIterations: config.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      onTextDelta: config.onTextDelta,
      onToolCall: config.onToolCall,
      onToolResult: config.onToolResult,
      onThinking: config.onThinking,
      onComplete: config.onComplete,
      onError: config.onError
    };
    this.executor = new ToolExecutor({ skills: config.ctx.skills });
    this.tools = buildTools(config.ctx.skills);
    this.systemPrompt = buildSystemPrompt(config.ctx.prompt, config.ctx.skills);
  }
  abort() {
    this.aborted = true;
    this.abortController?.abort();
  }
  async run(userMessage, history = []) {
    const startTime = Date.now();
    const toolCalls = [];
    const totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let finalText = "";
    let iterations = 0;
    const messages = [
      { role: "system", content: this.systemPrompt },
      ...history.map((m) => ({
        role: m.role,
        content: m.content
      })),
      { role: "user", content: userMessage }
    ];
    this.aborted = false;
    this.abortController = new AbortController();
    try {
      while (iterations < this.config.maxIterations) {
        if (this.aborted) {
          if (this.config.onThinking) {
            this.config.onThinking("Aborted by user");
          }
          break;
        }
        iterations++;
        if (this.config.onThinking && iterations > 1) {
          this.config.onThinking(`Thinking... (round ${iterations}/${this.config.maxIterations})`);
        }
        const iterationResult = await this.runIteration(messages);
        finalText += iterationResult.text;
        toolCalls.push(...iterationResult.toolCallRecords);
        totalUsage.promptTokens += iterationResult.usage.promptTokens;
        totalUsage.completionTokens += iterationResult.usage.completionTokens;
        totalUsage.totalTokens += iterationResult.usage.totalTokens;
        if (iterationResult.toolCalls.length === 0) {
          break;
        }
        const assistantMsg = {
          role: "assistant",
          content: iterationResult.text || null,
          tool_calls: iterationResult.toolCalls
        };
        messages.push(assistantMsg);
        for (let i = 0; i < iterationResult.toolCalls.length; i++) {
          const tc = iterationResult.toolCalls[i];
          const record = iterationResult.toolCallRecords[i];
          let toolContent;
          if (record.error) {
            toolContent = `Error: ${record.error}`;
          } else {
            toolContent = typeof record.result === "string" ? record.result : JSON.stringify(record.result);
          }
          messages.push({
            role: "tool",
            content: toolContent,
            tool_call_id: tc.id
          });
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (this.config.onError) {
        this.config.onError(error);
      }
      if (finalText === "" && toolCalls.length === 0) {
        finalText = `Agent loop error: ${error.message}`;
      }
    } finally {
      this.abortController = null;
    }
    const result = {
      finalText: finalText || "No response generated.",
      toolCalls,
      totalIterations: iterations,
      totalDuration: Date.now() - startTime,
      usage: totalUsage
    };
    if (this.config.onComplete) {
      this.config.onComplete(result);
    }
    return result;
  }
  async runIteration(messages) {
    const model = this.config.ctx.model ?? DEFAULT_MODEL;
    const temperature = this.config.ctx.temperature ?? 0.7;
    const maxTokens = this.config.ctx.maxTokens ?? 4096;
    const stream = this.config.llmProvider.chatStream(
      {
        model,
        messages,
        tools: this.tools.length > 0 ? this.tools : void 0,
        temperature,
        maxTokens
      },
      this.abortController?.signal
    );
    let text = "";
    const toolCallsAccum = /* @__PURE__ */ new Map();
    const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    for await (const event of stream) {
      if (this.aborted) break;
      switch (event.type) {
        case "text_delta":
          text += event.content;
          if (this.config.onTextDelta) {
            this.config.onTextDelta(event.content);
          }
          break;
        case "tool_call_start":
          toolCallsAccum.set(event.callId, { name: event.name, arguments: "" });
          break;
        case "tool_call_delta": {
          const existing = toolCallsAccum.get(event.callId);
          if (existing) {
            existing.arguments += event.arguments;
          }
          break;
        }
        case "done":
          usage.promptTokens = event.usage.promptTokens;
          usage.completionTokens = event.usage.completionTokens;
          usage.totalTokens = event.usage.totalTokens;
          break;
        case "error":
          throw event.error;
      }
    }
    const llmToolCalls = [];
    const parsedToolCalls = [];
    for (const [callId, tc] of toolCallsAccum) {
      let parsedArgs = {};
      try {
        parsedArgs = tc.arguments ? JSON.parse(tc.arguments) : {};
      } catch {
        parsedArgs = { raw: tc.arguments };
      }
      llmToolCalls.push({
        id: callId,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments }
      });
      parsedToolCalls.push({ callId, name: tc.name, arguments: parsedArgs });
    }
    if (parsedToolCalls.length > 0) {
      for (const ptc of parsedToolCalls) {
        if (this.config.onToolCall) {
          this.config.onToolCall({ callId: ptc.callId, name: ptc.name, arguments: ptc.arguments });
        }
      }
    }
    const toolCallRecords = await this.executor.executeBatch(parsedToolCalls);
    for (const record of toolCallRecords) {
      if (this.config.onToolResult) {
        this.config.onToolResult({
          callId: record.callId,
          name: record.name,
          result: record.result,
          error: record.error,
          durationMs: record.durationMs
        });
      }
    }
    return { text, toolCalls: llmToolCalls, toolCallRecords, usage };
  }
};

// src/agent-loop/platform-tools.ts
function required(keys) {
  return keys;
}
function object(props, req) {
  const s = { type: "object", properties: props };
  if (req) s.required = req;
  return s;
}
function str(desc, en) {
  const s = { type: "string", description: desc };
  if (en) s.enum = en;
  return s;
}
function num(desc) {
  return { type: "number", description: desc };
}
function integer(desc) {
  return { type: "integer", description: desc };
}
function array(items, desc) {
  return { type: "array", items, description: desc };
}
var identityRegistryTools = [
  {
    type: "function",
    function: {
      name: "agentx_identity_register",
      description: "Register a new AI Agent on the AgentX blockchain. Required before any agent can be published, subscribed to, or used.",
      parameters: object({
        tokenURI: str("IPFS URI of the agent public metadata (ipfs://...)"),
        encryptedPayloadCid: str("IPFS CID of the encrypted agent payload"),
        eciesEncryptedKey: str("Hex-encoded ECIES-encrypted AES key for the payload"),
        aesKeyHex: str("Hex-encoded AES key (stored as metadata)")
      }, required(["tokenURI", "encryptedPayloadCid", "eciesEncryptedKey"]))
    }
  },
  {
    type: "function",
    function: {
      name: "agentx_identity_get",
      description: "Get detailed information about a registered Agent by its ID. Returns owner, metadata URI, active status, and on-chain metadata attributes.",
      parameters: object({
        agentId: integer("The numeric agent ID to query")
      }, required(["agentId"]))
    }
  },
  {
    type: "function",
    function: {
      name: "agentx_identity_list",
      description: "List all Agent IDs owned by a specific wallet address.",
      parameters: object({
        ownerAddress: str("Ethereum wallet address to query")
      })
    }
  },
  {
    type: "function",
    function: {
      name: "agentx_identity_exists",
      description: "Check if a specific Agent ID exists on the blockchain.",
      parameters: object({
        agentId: integer("The agent ID to check")
      }, required(["agentId"]))
    }
  },
  {
    type: "function",
    function: {
      name: "agentx_identity_total_count",
      description: "Get the total number of agents registered in the IdentityRegistry.",
      parameters: object({})
    }
  }
];
var subscriptionTools = [
  {
    type: "function",
    function: {
      name: "agentx_subscription_plans",
      description: "Get plan details for a specific subscription plan by its ID. Returns price, period, creator, pay token, trial days, and active status.",
      parameters: object({
        planId: integer("The plan ID to fetch")
      }, required(["planId"]))
    }
  },
  {
    type: "function",
    function: {
      name: "agentx_subscription_check",
      description: "Check if a wallet address has an active subscription for a specific agent.",
      parameters: object({
        subscriberAddress: str("Wallet address to check"),
        agentId: integer("The agent ID")
      }, required(["subscriberAddress", "agentId"]))
    }
  },
  {
    type: "function",
    function: {
      name: "agentx_subscription_detail",
      description: "Get full subscription details including trial info, payment token, amount paid, escrow status.",
      parameters: object({
        subscriptionId: integer("The subscription ID")
      }, required(["subscriptionId"]))
    }
  },
  {
    type: "function",
    function: {
      name: "agentx_subscription_my_list",
      description: "List all subscription IDs belonging to the current user.",
      parameters: object({})
    }
  },
  {
    type: "function",
    function: {
      name: "agentx_subscription_subscribe",
      description: "Subscribe to a plan. For ETH plans this will send ETH. For ERC20 plans, the token must already be approved. This is a blockchain transaction \u2014 the user must approve it in their wallet.",
      parameters: object({
        planId: integer("The plan ID to subscribe to"),
        valueWei: str('Amount of ETH in wei to send (for ETH plans). Example: "1000000000000000000" for 1 ETH')
      }, required(["planId"]))
    }
  },
  {
    type: "function",
    function: {
      name: "agentx_subscription_cancel",
      description: "Cancel an existing subscription. If within trial period, funds may be refunded.",
      parameters: object({
        subscriptionId: integer("The subscription ID to cancel")
      }, required(["subscriptionId"]))
    }
  },
  {
    type: "function",
    function: {
      name: "agentx_subscription_release",
      description: "Release escrowed subscription funds to the agent creator (after trial window). Only callable by the subscriber.",
      parameters: object({
        subscriptionId: integer("The subscription ID")
      }, required(["subscriptionId"]))
    }
  },
  {
    type: "function",
    function: {
      name: "agentx_subscription_fee",
      description: "Get the current platform fee in basis points (e.g. 250 = 2.5%).",
      parameters: object({})
    }
  }
];
var a2aTools = [
  {
    type: "function",
    function: {
      name: "agentx_a2a_create_task",
      description: "Create an on-chain Agent-to-Agent task. This delegates work to another AgentX agent. The target agent will see this as a pending task they can complete.",
      parameters: object({
        targetAgentId: integer("The Agent ID to delegate work to"),
        taskType: str('Type of task, e.g. "audit", "analyze", "generate", "review"'),
        inputData: str("JSON string of the task input. Include all details the target agent needs.")
      }, required(["targetAgentId", "taskType", "inputData"]))
    }
  },
  {
    type: "function",
    function: {
      name: "agentx_a2a_get_task",
      description: "Get full details of an A2A task by its ID \u2014 status, input, output, creator, timestamps.",
      parameters: object({
        taskId: integer("The A2A task ID")
      }, required(["taskId"]))
    }
  },
  {
    type: "function",
    function: {
      name: "agentx_a2a_complete_task",
      description: "Mark an A2A task as completed and submit the output data on-chain.",
      parameters: object({
        taskId: integer("The task ID to complete"),
        outputData: str("JSON string of the task output/result")
      }, required(["taskId", "outputData"]))
    }
  },
  {
    type: "function",
    function: {
      name: "agentx_a2a_my_tasks",
      description: "Get all A2A task IDs assigned to or created by the current user.",
      parameters: object({})
    }
  },
  {
    type: "function",
    function: {
      name: "agentx_a2a_agent_card",
      description: "Get an agent's A2A card \u2014 name, capabilities, supported task types, protocol info.",
      parameters: object({
        agentId: integer("The agent ID")
      }, required(["agentId"]))
    }
  }
];
var reputationTools = [
  {
    type: "function",
    function: {
      name: "agentx_reputation_rate",
      description: "Rate an agent (1-5) and leave a comment on-chain.",
      parameters: object({
        agentId: integer("The agent ID to rate"),
        rating: integer("Rating from 1 (worst) to 5 (best)"),
        comment: str("Optional review comment")
      }, required(["agentId", "rating"]))
    }
  },
  {
    type: "function",
    function: {
      name: "agentx_reputation_get",
      description: "Get the average rating and total number of ratings for an agent.",
      parameters: object({
        agentId: integer("The agent ID")
      }, required(["agentId"]))
    }
  },
  {
    type: "function",
    function: {
      name: "agentx_reputation_reviews",
      description: "Get all reviews for an agent (reviewer address, rating, comment, timestamp).",
      parameters: object({
        agentId: integer("The agent ID")
      }, required(["agentId"]))
    }
  }
];
var configurationTools = [
  {
    type: "function",
    function: {
      name: "agentx_config_get",
      description: "Read a single configuration value for an agent by key.",
      parameters: object({
        agentId: integer("The agent ID"),
        configKey: str("The configuration key name")
      }, required(["agentId", "configKey"]))
    }
  },
  {
    type: "function",
    function: {
      name: "agentx_config_list",
      description: "List all configuration entries for an agent.",
      parameters: object({
        agentId: integer("The agent ID")
      }, required(["agentId"]))
    }
  },
  {
    type: "function",
    function: {
      name: "agentx_config_set",
      description: "Set or update a configuration value for an agent on-chain. Only the agent owner can write.",
      parameters: object({
        agentId: integer("The agent ID"),
        key: str("Configuration key name"),
        value: str("Configuration value"),
        dataType: str('Data type: "string", "number", "boolean", "json"', ["string", "number", "boolean", "json"])
      }, required(["agentId", "key", "value"]))
    }
  }
];
var endpointTools = [
  {
    type: "function",
    function: {
      name: "agentx_endpoint_list",
      description: "Get all registered endpoints for an agent (MCP URLs, API endpoints, etc.).",
      parameters: object({
        agentId: integer("The agent ID")
      }, required(["agentId"]))
    }
  },
  {
    type: "function",
    function: {
      name: "agentx_endpoint_active",
      description: "Get only active endpoints for an agent. Useful for finding available MCP or API servers.",
      parameters: object({
        agentId: integer("The agent ID")
      }, required(["agentId"]))
    }
  },
  {
    type: "function",
    function: {
      name: "agentx_endpoint_best_mcp",
      description: "Find the best available MCP endpoint URL for an agent. Automatically picks the healthiest active endpoint.",
      parameters: object({
        agentId: integer("The agent ID")
      }, required(["agentId"]))
    }
  }
];
var gatewayTools = [
  {
    type: "function",
    function: {
      name: "agentx_gateway_chat",
      description: "Call an LLM through the AgentX Gateway using platform quota or BYOK key. Supports OpenAI models via SSE streaming.",
      parameters: object({
        model: str('LLM model name, e.g. "gpt-4o", "gpt-4o-mini"'),
        messages: array(
          object({
            role: str("Message role", ["system", "user", "assistant", "tool"]),
            content: str("Message content text")
          }),
          "Array of conversation messages"
        ),
        keySource: str("API key source", ["platform", "tenant_owned"]),
        tenantKeyId: str('BYOK key UUID (required when key_source is "tenant_owned")'),
        temperature: num("Sampling temperature 0-2"),
        max_tokens: integer("Maximum tokens in the response")
      }, required(["model", "messages"]))
    }
  },
  {
    type: "function",
    function: {
      name: "agentx_gateway_tenant_me",
      description: "Get the current tenant (user) profile: plan info, API keys, today's usage quota.",
      parameters: object({})
    }
  },
  {
    type: "function",
    function: {
      name: "agentx_gateway_tenant_usage",
      description: "Get usage history for the current tenant: token consumption, tool calls by day.",
      parameters: object({
        days: integer("Number of days of history (default 30)")
      })
    }
  },
  {
    type: "function",
    function: {
      name: "agentx_gateway_tenant_keys",
      description: "List all BYOK API keys registered for the current tenant.",
      parameters: object({})
    }
  },
  {
    type: "function",
    function: {
      name: "agentx_gateway_models",
      description: "List available LLM models: both platform-provided and tenant-owned models.",
      parameters: object({})
    }
  }
];
var ipfsTools = [
  {
    type: "function",
    function: {
      name: "agentx_ipfs_upload",
      description: "Upload JSON data to IPFS via Pinata (requires Pinata JWT configured). Returns the IPFS CID and gateway URL.",
      parameters: object({
        data: str("The JSON data to upload, as a JSON string"),
        name: str("Optional name for the uploaded file")
      }, required(["data"]))
    }
  },
  {
    type: "function",
    function: {
      name: "agentx_ipfs_upload_encrypted",
      description: "Encrypt and upload an Agent payload to IPFS. Used in the Agent publish flow. Generates AES key, encrypts the payload, and uploads to IPFS in one step.",
      parameters: object({
        prompt: str("The private system prompt to encrypt and upload"),
        skillsJson: str("JSON string of skills configuration"),
        mcpJson: str("JSON string of MCP configuration"),
        agentName: str("Name for the agent payload metadata")
      }, required(["prompt"]))
    }
  },
  {
    type: "function",
    function: {
      name: "agentx_ipfs_get_url",
      description: "Build a public IPFS gateway URL from a CID.",
      parameters: object({
        cid: str("The IPFS CID (Content Identifier)"),
        gateway: str("Optional gateway URL (default: ipfs.io)")
      }, required(["cid"]))
    }
  }
];
function buildPlatformTools(available) {
  const modules = available ?? ["identity", "subscription", "a2a", "reputation", "configuration", "endpoint", "gateway", "ipfs"];
  const tools = [];
  for (const mod of modules) {
    switch (mod) {
      case "identity":
        tools.push(...identityRegistryTools);
        break;
      case "subscription":
        tools.push(...subscriptionTools);
        break;
      case "a2a":
        tools.push(...a2aTools);
        break;
      case "reputation":
        tools.push(...reputationTools);
        break;
      case "configuration":
        tools.push(...configurationTools);
        break;
      case "endpoint":
        tools.push(...endpointTools);
        break;
      case "gateway":
        tools.push(...gatewayTools);
        break;
      case "ipfs":
        tools.push(...ipfsTools);
        break;
    }
  }
  return tools;
}
function getAllPlatformToolNames() {
  return buildPlatformTools().map((t) => t.function.name);
}
async function executePlatformTool(toolName, args, ctx) {
  try {
    switch (toolName) {
      // ── Identity ──────────────────────────────────
      case "agentx_identity_register": {
        const { tokenURI, encryptedPayloadCid, eciesEncryptedKey, aesKeyHex } = args;
        const metadata = [
          { key: "encryptedPayloadCid", value: encryptedPayloadCid },
          { key: "eciesEncryptedKey", value: eciesEncryptedKey }
        ];
        if (aesKeyHex) metadata.push({ key: "aesKeyHex", value: aesKeyHex });
        return ctx.agentRegistry.register(tokenURI, metadata);
      }
      case "agentx_identity_get":
        return {
          tokenURI: await ctx.agentRegistry.tokenURI(args.agentId),
          attributes: await ctx.agentRegistry.getAttributes(args.agentId),
          exists: await ctx.agentRegistry.agentExists(args.agentId)
        };
      case "agentx_identity_list":
        return ctx.agentRegistry.getAgentsByOwner(args.ownerAddress ?? ctx.userAddress);
      case "agentx_identity_exists":
        return ctx.agentRegistry.agentExists(args.agentId);
      case "agentx_identity_total_count":
        return { totalAgents: await ctx.agentRegistry.getCurrentAgentId() };
      // ── Subscription ──────────────────────────────
      case "agentx_subscription_plans":
        return ctx.subscriptionManager.getPlan(args.planId);
      case "agentx_subscription_check":
        return ctx.subscriptionManager.hasActiveSubscription(
          args.subscriberAddress ?? ctx.userAddress,
          args.agentId
        );
      case "agentx_subscription_detail":
        return ctx.subscriptionManager.getSubscriptionDetail(args.subscriptionId);
      case "agentx_subscription_my_list":
        return ctx.subscriptionManager.getUserSubscriptions(ctx.userAddress);
      case "agentx_subscription_subscribe": {
        const valueWei = args.valueWei ? BigInt(args.valueWei) : void 0;
        return ctx.subscriptionManager.subscribe(args.planId, { valueWei });
      }
      case "agentx_subscription_cancel":
        return ctx.subscriptionManager.cancel(args.subscriptionId);
      case "agentx_subscription_release":
        return ctx.subscriptionManager.releaseFunds(args.subscriptionId);
      case "agentx_subscription_fee":
        return { platformFeeBps: await ctx.subscriptionManager.getPlatformFeeBps() };
      // ── A2A ───────────────────────────────────────
      case "agentx_a2a_create_task":
        return ctx.a2a.createTask(
          args.targetAgentId,
          args.taskType,
          typeof args.inputData === "string" ? JSON.parse(args.inputData) : args.inputData
        );
      case "agentx_a2a_get_task":
        return ctx.a2a.getTask(args.taskId);
      case "agentx_a2a_complete_task":
        return ctx.a2a.completeTask(args.taskId, args.outputData);
      case "agentx_a2a_my_tasks":
        return ctx.a2a.getUserTasks(ctx.userAddress);
      case "agentx_a2a_agent_card":
        return ctx.a2a.getAgentCard(args.agentId);
      // ── Reputation ─────────────────────────────────
      case "agentx_reputation_rate":
        if (!ctx.reputationRegistry) throw new Error("ReputationRegistry not configured");
        return ctx.reputationRegistry.rateAgent(args.agentId, args.rating, args.comment ?? "");
      case "agentx_reputation_get":
        if (!ctx.reputationRegistry) throw new Error("ReputationRegistry not configured");
        return ctx.reputationRegistry.getRating(args.agentId);
      case "agentx_reputation_reviews":
        if (!ctx.reputationRegistry) throw new Error("ReputationRegistry not configured");
        return ctx.reputationRegistry.getReviews(args.agentId);
      // ── Configuration ──────────────────────────────
      case "agentx_config_get":
        if (!ctx.configurationRegistry) throw new Error("ConfigurationRegistry not configured");
        return ctx.configurationRegistry.getConfig(args.agentId, args.configKey);
      case "agentx_config_list":
        if (!ctx.configurationRegistry) throw new Error("ConfigurationRegistry not configured");
        return ctx.configurationRegistry.getAgentConfigs(args.agentId);
      case "agentx_config_set":
        if (!ctx.configurationRegistry) throw new Error("ConfigurationRegistry not configured");
        return ctx.configurationRegistry.setConfig(
          args.agentId,
          args.key,
          args.value,
          args.dataType ?? "string"
        );
      // ── MultiEndpoint ──────────────────────────────
      case "agentx_endpoint_list":
        if (!ctx.multiEndpointRegistry) throw new Error("MultiEndpointRegistry not configured");
        return ctx.multiEndpointRegistry.getAgentEndpoints(args.agentId);
      case "agentx_endpoint_active":
        if (!ctx.multiEndpointRegistry) throw new Error("MultiEndpointRegistry not configured");
        return ctx.multiEndpointRegistry.getActiveAgentEndpoints(args.agentId);
      case "agentx_endpoint_best_mcp":
        if (!ctx.multiEndpointRegistry) throw new Error("MultiEndpointRegistry not configured");
        return { mcpUrl: await ctx.multiEndpointRegistry.getBestMCPUrl(args.agentId) };
      // ── Gateway ────────────────────────────────────
      case "agentx_gateway_chat": {
        if (!ctx.gatewayUrl || !ctx.gatewayToken) throw new Error("Gateway not configured");
        const body = {
          model: args.model ?? "gpt-4o",
          messages: args.messages,
          stream: false,
          key_source: args.keySource ?? "platform"
        };
        if (args.temperature !== void 0) body.temperature = args.temperature;
        if (args.max_tokens) body.max_tokens = args.max_tokens;
        if (args.tenantKeyId) body.tenant_key_id = args.tenantKeyId;
        const res = await fetch(`${ctx.gatewayUrl}/api/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${ctx.gatewayToken}`
          },
          body: JSON.stringify(body)
        });
        return res.json();
      }
      case "agentx_gateway_tenant_me": {
        if (!ctx.gatewayUrl || !ctx.gatewayToken) throw new Error("Gateway not configured");
        const res = await fetch(`${ctx.gatewayUrl}/api/v1/tenant/me`, {
          headers: { "Authorization": `Bearer ${ctx.gatewayToken}` }
        });
        return res.json();
      }
      case "agentx_gateway_tenant_usage": {
        if (!ctx.gatewayUrl || !ctx.gatewayToken) throw new Error("Gateway not configured");
        const res = await fetch(`${ctx.gatewayUrl}/api/v1/tenant/usage?days=${args.days ?? 30}`, {
          headers: { "Authorization": `Bearer ${ctx.gatewayToken}` }
        });
        return res.json();
      }
      case "agentx_gateway_tenant_keys": {
        if (!ctx.gatewayUrl || !ctx.gatewayToken) throw new Error("Gateway not configured");
        const res = await fetch(`${ctx.gatewayUrl}/api/v1/tenant/keys`, {
          headers: { "Authorization": `Bearer ${ctx.gatewayToken}` }
        });
        return res.json();
      }
      case "agentx_gateway_models": {
        if (!ctx.gatewayUrl || !ctx.gatewayToken) throw new Error("Gateway not configured");
        const res = await fetch(`${ctx.gatewayUrl}/api/v1/models`, {
          headers: { "Authorization": `Bearer ${ctx.gatewayToken}` }
        });
        return res.json();
      }
      // ── IPFS ───────────────────────────────────────
      case "agentx_ipfs_upload": {
        if (!ctx.ipfsUploader) throw new Error("IPFSUploader not configured");
        const data = typeof args.data === "string" ? JSON.parse(args.data) : args.data;
        const result = await ctx.ipfsUploader.uploadJSON(data, { name: args.name });
        return { cid: result.cid, url: result.url };
      }
      case "agentx_ipfs_upload_encrypted": {
        if (!ctx.ipfsUploader) throw new Error("IPFSUploader not configured");
        const { generateAesKey: generateAesKey2, encryptPayload: encryptPayload2 } = await Promise.resolve().then(() => (init_crypto(), crypto_exports));
        const privatePayload = {
          prompt: args.prompt,
          skills: args.skillsJson ? JSON.parse(args.skillsJson) : [],
          mcp: args.mcpJson ? JSON.parse(args.mcpJson) : {}
        };
        const key = generateAesKey2();
        const encrypted = encryptPayload2(privatePayload, key);
        const result = await ctx.ipfsUploader.uploadEncryptedPayload(encrypted, args.agentName);
        return { cid: result.cid, url: result.url, aesKeyHex: key };
      }
      case "agentx_ipfs_get_url": {
        const gateway = args.gateway ?? "https://ipfs.io";
        return { url: `${gateway}/ipfs/${args.cid}` };
      }
      default:
        throw new Error(`Unknown platform tool: ${toolName}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message, tool: toolName };
  }
}
function wrapPlatformToolsAsSkills(ctx, modules) {
  const toolDefs = buildPlatformTools(modules);
  return toolDefs.map((def) => ({
    name: def.function.name,
    description: def.function.description,
    inputSchema: def.function.parameters,
    mode: "open",
    execute: async (input) => {
      return executePlatformTool(def.function.name, input, ctx);
    }
  }));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AgentLoop,
  ToolExecutor,
  buildPlatformTools,
  buildSystemPrompt,
  buildTools,
  executePlatformTool,
  getAllPlatformToolNames,
  wrapPlatformToolsAsSkills
});
//# sourceMappingURL=index.js.map