var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/react/useAgentRunner.ts
import { useState, useEffect, useRef } from "react";
import { usePublicClient, useWalletClient } from "wagmi";

// src/core/crypto.ts
import { gcm } from "@noble/ciphers/aes.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { bytesToHex, hexToBytes } from "@noble/ciphers/utils.js";
function randomBytes(length) {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint8Array(length);
    crypto.getRandomValues(buf);
    return buf;
  }
  const nodeCrypto = __require("crypto");
  return new Uint8Array(nodeCrypto.randomBytes(length));
}
var AES_KEY_SIZE = 32;
var IV_SIZE = 12;
var TAG_SIZE = 16;
function fromBase64(b64) {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function aesDecrypt(encryptedBase64, keyHex) {
  const key = hexToBytes(keyHex);
  const combined = fromBase64(encryptedBase64);
  const iv = combined.subarray(0, IV_SIZE);
  const ciphertext = combined.subarray(IV_SIZE, -TAG_SIZE);
  const authTag = combined.subarray(-TAG_SIZE);
  const cipher = gcm(key, iv);
  const ciphertextWithTag = new Uint8Array(ciphertext.length + TAG_SIZE);
  ciphertextWithTag.set(ciphertext, 0);
  ciphertextWithTag.set(authTag, ciphertext.length);
  const decrypted = cipher.decrypt(ciphertextWithTag);
  return new TextDecoder().decode(decrypted);
}
function generateAesKey() {
  return bytesToHex(randomBytes(AES_KEY_SIZE));
}
function eciesEncode(ephemeralPub, iv, ciphertext, mac) {
  const out = new Uint8Array(33 + 16 + ciphertext.length + 32);
  out.set(ephemeralPub, 0);
  out.set(iv, 33);
  out.set(ciphertext, 33 + 16);
  out.set(mac, 33 + 16 + ciphertext.length);
  return bytesToHex(out);
}
function eciesDecode(dataHex) {
  const d = hexToBytes(dataHex);
  return {
    ephemeralPub: d.subarray(0, 33),
    iv: d.subarray(33, 49),
    ciphertext: d.subarray(49, -32),
    mac: d.subarray(-32)
  };
}
function aesCtrEncrypt(key, ctrBytes, data) {
  const blockSize = 16;
  const cipher = gcm(key, ctrBytes);
  const result = new Uint8Array(data.length);
  const counter = new Uint8Array(blockSize);
  counter.set(ctrBytes);
  for (let i = 0; i < data.length; i += blockSize) {
    const keystream = gcm(key, counter).encrypt(new Uint8Array(blockSize));
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
  const ephPub = secp256k1.getPublicKey(ephPriv, true);
  let recipientPub;
  if (publicKey.startsWith("04") && publicKey.length === 130) {
    recipientPub = hexToBytes(publicKey);
  } else if (publicKey.startsWith("02") || publicKey.startsWith("03")) {
    recipientPub = hexToBytes(publicKey);
  } else {
    throw new Error("Invalid public key format: expected hex with 02/03/04 prefix");
  }
  const shared = secp256k1.getSharedSecret(ephPriv, recipientPub);
  const sharedX = shared.subarray(1, 33);
  const sharedKey = sha256(sharedX);
  const hkdfOut = hkdf(sha256, sharedKey, void 0, void 0, 64);
  const encKey = hkdfOut.subarray(0, 32);
  const macKey = hkdfOut.subarray(32, 64);
  const iv = randomBytes(16);
  const plaintext = hexToBytes(dataHex);
  const ciphertext = aesCtrEncrypt(encKey, iv, plaintext);
  const macInput = new Uint8Array(33 + 16 + ciphertext.length);
  macInput.set(ephPub, 0);
  macInput.set(iv, 33);
  macInput.set(ciphertext, 33 + 16);
  const mac = hmac(sha256, macKey, macInput);
  return eciesEncode(ephPub, iv, ciphertext, mac);
}
function eciesDecrypt(dataHex, privateKey) {
  const { ephemeralPub, iv, ciphertext, mac } = eciesDecode(dataHex);
  const privBytes = hexToBytes(privateKey);
  const shared = secp256k1.getSharedSecret(privBytes, ephemeralPub);
  const sharedX = shared.subarray(1, 33);
  const sharedKey = sha256(sharedX);
  const hkdfOut = hkdf(sha256, sharedKey, void 0, void 0, 64);
  const encKey = hkdfOut.subarray(0, 32);
  const macKey = hkdfOut.subarray(32, 64);
  const macInput = new Uint8Array(33 + 16 + ciphertext.length);
  macInput.set(ephemeralPub, 0);
  macInput.set(iv, 33);
  macInput.set(ciphertext, 33 + 16);
  const expectedMac = hmac(sha256, macKey, macInput);
  if (!constantTimeEqual(mac, expectedMac)) {
    throw new Error("ECIES decryption failed: MAC mismatch");
  }
  const plaintext = aesCtrEncrypt(encKey, iv, ciphertext);
  return bytesToHex(plaintext);
}
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
function decryptPayload(encrypted, keyHex) {
  if (encrypted.algorithm !== "AES-256-GCM") {
    throw new Error(`Unsupported algorithm: ${encrypted.algorithm}`);
  }
  return JSON.parse(aesDecrypt(encrypted.data, keyHex));
}
function unpackAgent(encryptedPayload, eciesEncryptedKey, privateKey) {
  const aesKeyHex = eciesDecrypt(eciesEncryptedKey, privateKey);
  return decryptPayload(encryptedPayload, aesKeyHex);
}

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

// src/core/types.ts
var AgentXError = class extends Error {
  code;
  /** If NOT_SUBSCRIBED, carry enough info for wallet/X402 auto-payment */
  paymentInfo;
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "AgentXError";
  }
};

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

// src/config/config.ts
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
  // Chain ID 19505, Clique PoA, Shanghai+Cancun, gas token T0x
  // Deployer: 0x8E869A0624fF9e766Df71b5B08897d00E4d260ba
  // RPC: http://43.156.99.215:18545
  // Explorer: http://43.156.99.215:18400
  // All 6 core contracts deployed 2026-07-14
  19505: {
    chainId: 19505,
    contracts: {
      identityRegistry: "0xbf5F9db266c8c97E3334466C88597Eb758AfE212",
      subscriptionManager: "0x019AC9d945467478Dd371CDbD70cb2f325800E6B",
      a2aProtocolRegistry: "0xDF2939EFafEe6439eB2226DbEd07AD6F5Ae2112B",
      reputationRegistry: "0x6a18C2664E1b42063860d864b6448b824d7B843F",
      configurationRegistry: "0x07280674ccc2898Fd038A9e3C22005CA83ffD2F8",
      multiEndpointRegistry: "0xB361d04F49000013FC131D3C59C41c8486C64f8c"
    },
    ipfsGateways: ["ipfs.io", "gateway.pinata.cloud", "dweb.link", "cf-ipfs.com"],
    rpcUrl: "http://43.156.99.215:18545"
  }
};

// src/react/useAgentRunner.ts
var IDENTITY_REGISTRY_ABI = [
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
      abi: IDENTITY_REGISTRY_ABI,
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
  useAgentRunner
};
//# sourceMappingURL=index.mjs.map