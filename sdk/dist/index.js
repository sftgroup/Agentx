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

// node_modules/viem/_esm/utils/data/isHex.js
function isHex(value, { strict = true } = {}) {
  if (!value)
    return false;
  if (typeof value !== "string")
    return false;
  return strict ? /^0x[0-9a-fA-F]*$/.test(value) : value.startsWith("0x");
}
var init_isHex = __esm({
  "node_modules/viem/_esm/utils/data/isHex.js"() {
    "use strict";
  }
});

// node_modules/viem/_esm/utils/data/size.js
function size(value) {
  if (isHex(value, { strict: false }))
    return Math.ceil((value.length - 2) / 2);
  return value.length;
}
var init_size = __esm({
  "node_modules/viem/_esm/utils/data/size.js"() {
    "use strict";
    init_isHex();
  }
});

// node_modules/viem/_esm/errors/version.js
var version;
var init_version = __esm({
  "node_modules/viem/_esm/errors/version.js"() {
    "use strict";
    version = "2.55.2";
  }
});

// node_modules/viem/_esm/errors/base.js
function walk(err, fn) {
  if (fn?.(err))
    return err;
  if (err && typeof err === "object" && "cause" in err && err.cause !== void 0)
    return walk(err.cause, fn);
  return fn ? null : err;
}
var errorConfig, BaseError;
var init_base = __esm({
  "node_modules/viem/_esm/errors/base.js"() {
    "use strict";
    init_version();
    errorConfig = {
      getDocsUrl: ({ docsBaseUrl, docsPath = "", docsSlug }) => docsPath ? `${docsBaseUrl ?? "https://viem.sh"}${docsPath}${docsSlug ? `#${docsSlug}` : ""}` : void 0,
      version: `viem@${version}`
    };
    BaseError = class _BaseError extends Error {
      constructor(shortMessage, args = {}) {
        const details = (() => {
          if (args.cause instanceof _BaseError)
            return args.cause.details;
          if (args.cause?.message)
            return args.cause.message;
          return args.details;
        })();
        const docsPath = (() => {
          if (args.cause instanceof _BaseError)
            return args.cause.docsPath || args.docsPath;
          return args.docsPath;
        })();
        const docsUrl = errorConfig.getDocsUrl?.({ ...args, docsPath });
        const message = [
          shortMessage || "An error occurred.",
          "",
          ...args.metaMessages ? [...args.metaMessages, ""] : [],
          ...docsUrl ? [`Docs: ${docsUrl}`] : [],
          ...details ? [`Details: ${details}`] : [],
          ...errorConfig.version ? [`Version: ${errorConfig.version}`] : []
        ].join("\n");
        super(message, args.cause ? { cause: args.cause } : void 0);
        Object.defineProperty(this, "details", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        Object.defineProperty(this, "docsPath", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        Object.defineProperty(this, "metaMessages", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        Object.defineProperty(this, "shortMessage", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        Object.defineProperty(this, "version", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        Object.defineProperty(this, "name", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: "BaseError"
        });
        this.details = details;
        this.docsPath = docsPath;
        this.metaMessages = args.metaMessages;
        this.name = args.name ?? this.name;
        this.shortMessage = shortMessage;
        this.version = version;
      }
      walk(fn) {
        return walk(this, fn);
      }
    };
  }
});

// node_modules/viem/_esm/errors/data.js
var SizeExceedsPaddingSizeError;
var init_data = __esm({
  "node_modules/viem/_esm/errors/data.js"() {
    "use strict";
    init_base();
    SizeExceedsPaddingSizeError = class extends BaseError {
      constructor({ size: size2, targetSize, type }) {
        super(`${type.charAt(0).toUpperCase()}${type.slice(1).toLowerCase()} size (${size2}) exceeds padding size (${targetSize}).`, { name: "SizeExceedsPaddingSizeError" });
      }
    };
  }
});

// node_modules/viem/_esm/utils/data/pad.js
function pad(hexOrBytes, { dir, size: size2 = 32 } = {}) {
  if (typeof hexOrBytes === "string")
    return padHex(hexOrBytes, { dir, size: size2 });
  return padBytes(hexOrBytes, { dir, size: size2 });
}
function padHex(hex_, { dir, size: size2 = 32 } = {}) {
  if (size2 === null)
    return hex_;
  const hex = hex_.replace("0x", "");
  if (hex.length > size2 * 2)
    throw new SizeExceedsPaddingSizeError({
      size: Math.ceil(hex.length / 2),
      targetSize: size2,
      type: "hex"
    });
  return `0x${hex[dir === "right" ? "padEnd" : "padStart"](size2 * 2, "0")}`;
}
function padBytes(bytes, { dir, size: size2 = 32 } = {}) {
  if (size2 === null)
    return bytes;
  if (bytes.length > size2)
    throw new SizeExceedsPaddingSizeError({
      size: bytes.length,
      targetSize: size2,
      type: "bytes"
    });
  const paddedBytes = new Uint8Array(size2);
  for (let i = 0; i < size2; i++) {
    const padEnd = dir === "right";
    paddedBytes[padEnd ? i : size2 - i - 1] = bytes[padEnd ? i : bytes.length - i - 1];
  }
  return paddedBytes;
}
var init_pad = __esm({
  "node_modules/viem/_esm/utils/data/pad.js"() {
    "use strict";
    init_data();
  }
});

// node_modules/viem/_esm/errors/encoding.js
var SizeOverflowError;
var init_encoding = __esm({
  "node_modules/viem/_esm/errors/encoding.js"() {
    "use strict";
    init_base();
    SizeOverflowError = class extends BaseError {
      constructor({ givenSize, maxSize }) {
        super(`Size cannot exceed ${maxSize} bytes. Given size: ${givenSize} bytes.`, { name: "SizeOverflowError" });
      }
    };
  }
});

// node_modules/viem/_esm/utils/data/trim.js
function trim(hexOrBytes, { dir = "left" } = {}) {
  let data = typeof hexOrBytes === "string" ? hexOrBytes.replace("0x", "") : hexOrBytes;
  let sliceLength = 0;
  for (let i = 0; i < data.length - 1; i++) {
    if (data[dir === "left" ? i : data.length - i - 1].toString() === "0")
      sliceLength++;
    else
      break;
  }
  data = dir === "left" ? data.slice(sliceLength) : data.slice(0, data.length - sliceLength);
  if (typeof hexOrBytes === "string") {
    if (data.length === 1 && dir === "right")
      data = `${data}0`;
    return `0x${data.length % 2 === 1 ? `0${data}` : data}`;
  }
  return data;
}
var init_trim = __esm({
  "node_modules/viem/_esm/utils/data/trim.js"() {
    "use strict";
  }
});

// node_modules/viem/_esm/utils/encoding/fromHex.js
function assertSize(hexOrBytes, { size: size2 }) {
  if (size(hexOrBytes) > size2)
    throw new SizeOverflowError({
      givenSize: size(hexOrBytes),
      maxSize: size2
    });
}
function hexToString(hex, opts = {}) {
  let bytes = hexToBytes2(hex);
  if (opts.size) {
    assertSize(bytes, { size: opts.size });
    bytes = trim(bytes, { dir: "right" });
  }
  return new TextDecoder().decode(bytes);
}
var init_fromHex = __esm({
  "node_modules/viem/_esm/utils/encoding/fromHex.js"() {
    "use strict";
    init_encoding();
    init_size();
    init_trim();
    init_toBytes();
  }
});

// node_modules/viem/_esm/utils/encoding/toHex.js
function bytesToHex2(value, opts = {}) {
  let string = "";
  for (let i = 0; i < value.length; i++) {
    string += hexes[value[i]];
  }
  const hex = `0x${string}`;
  if (typeof opts.size === "number") {
    assertSize(hex, { size: opts.size });
    return pad(hex, { dir: "right", size: opts.size });
  }
  return hex;
}
function stringToHex(value_, opts = {}) {
  const value = encoder.encode(value_);
  return bytesToHex2(value, opts);
}
var hexes, encoder;
var init_toHex = __esm({
  "node_modules/viem/_esm/utils/encoding/toHex.js"() {
    "use strict";
    init_pad();
    init_fromHex();
    hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_v, i) => i.toString(16).padStart(2, "0"));
    encoder = /* @__PURE__ */ new TextEncoder();
  }
});

// node_modules/viem/_esm/utils/encoding/toBytes.js
function charCodeToBase16(char) {
  if (char >= charCodeMap.zero && char <= charCodeMap.nine)
    return char - charCodeMap.zero;
  if (char >= charCodeMap.A && char <= charCodeMap.F)
    return char - (charCodeMap.A - 10);
  if (char >= charCodeMap.a && char <= charCodeMap.f)
    return char - (charCodeMap.a - 10);
  return void 0;
}
function hexToBytes2(hex_, opts = {}) {
  let hex = hex_;
  if (opts.size) {
    assertSize(hex, { size: opts.size });
    hex = pad(hex, { dir: "right", size: opts.size });
  }
  let hexString = hex.slice(2);
  if (hexString.length % 2)
    hexString = `0${hexString}`;
  const length = hexString.length / 2;
  const bytes = new Uint8Array(length);
  for (let index = 0, j = 0; index < length; index++) {
    const nibbleLeft = charCodeToBase16(hexString.charCodeAt(j++));
    const nibbleRight = charCodeToBase16(hexString.charCodeAt(j++));
    if (nibbleLeft === void 0 || nibbleRight === void 0) {
      throw new BaseError(`Invalid byte sequence ("${hexString[j - 2]}${hexString[j - 1]}" in "${hexString}").`);
    }
    bytes[index] = nibbleLeft * 16 + nibbleRight;
  }
  return bytes;
}
var charCodeMap;
var init_toBytes = __esm({
  "node_modules/viem/_esm/utils/encoding/toBytes.js"() {
    "use strict";
    init_base();
    init_pad();
    init_fromHex();
    charCodeMap = {
      zero: 48,
      nine: 57,
      A: 65,
      F: 70,
      a: 97,
      f: 102
    };
  }
});

// src/index.ts
var index_exports = {};
__export(index_exports, {
  A2AProtocol: () => A2AProtocol,
  A2A_VERSION: () => A2A_VERSION,
  AgentLoop: () => AgentLoop,
  AgentRegistry: () => AgentRegistry,
  AgentRunner: () => AgentRunner,
  AgentX402: () => AgentX402,
  AgentXError: () => AgentXError,
  AgentXErrorCode: () => AgentXErrorCode,
  CONFIG_VERSION: () => CONFIG_VERSION,
  ConfigurationClient: () => ConfigurationClient,
  ConfigurationRegistry: () => ConfigurationRegistry,
  GatewayProvider: () => GatewayProvider,
  IPFSFetcher: () => IPFSFetcher,
  IPFSUploader: () => IPFSUploader,
  KNOWN_CHAINS: () => KNOWN_CHAINS,
  MCPConnector: () => MCPConnector,
  MCP_VERSION: () => MCP_VERSION,
  MultiEndpointClient: () => MultiEndpointClient,
  OpenAIProvider: () => OpenAIProvider,
  REGISTRY_VERSION: () => REGISTRY_VERSION,
  REPUTATION_VERSION: () => REPUTATION_VERSION,
  ReputationRegistry: () => ReputationRegistry,
  SUBSCRIPTION_VERSION: () => SUBSCRIPTION_VERSION,
  SubscriptionManager: () => SubscriptionManager,
  ToolExecutor: () => ToolExecutor,
  aesDecrypt: () => aesDecrypt,
  aesEncrypt: () => aesEncrypt,
  buildPlatformTools: () => buildPlatformTools,
  buildSystemPrompt: () => buildSystemPrompt,
  buildTools: () => buildTools,
  bytesToHex: () => import_utils.bytesToHex,
  cidFromURI: () => cidFromURI,
  createLLMProvider: () => createLLMProvider,
  decryptPayload: () => decryptPayload,
  defaultIPFSFetcher: () => defaultIPFSFetcher,
  defaultIPFSUploader: () => defaultIPFSUploader,
  eciesDecrypt: () => eciesDecrypt,
  eciesEncrypt: () => eciesEncrypt,
  encryptPayload: () => encryptPayload,
  executePlatformTool: () => executePlatformTool,
  generateAesKey: () => generateAesKey,
  generateKeyPair: () => generateKeyPair,
  getAllPlatformToolNames: () => getAllPlatformToolNames,
  getPublicKey: () => getPublicKey,
  guardSubscription: () => guardSubscription,
  hexToBytes: () => import_utils.hexToBytes,
  packAgentForPublish: () => packAgentForPublish,
  publishAgent: () => publishAgent,
  randomBytes: () => randomBytes,
  unpackAgent: () => unpackAgent,
  useAgentRunner: () => useAgentRunner,
  wrapPlatformToolsAsSkills: () => wrapPlatformToolsAsSkills
});
module.exports = __toCommonJS(index_exports);

// src/core/types.ts
var AgentXErrorCode = /* @__PURE__ */ ((AgentXErrorCode2) => {
  AgentXErrorCode2["NOT_SUBSCRIBED"] = "NOT_SUBSCRIBED";
  AgentXErrorCode2["SUBSCRIPTION_EXPIRED"] = "SUBSCRIPTION_EXPIRED";
  AgentXErrorCode2["DECRYPTION_FAILED"] = "DECRYPTION_FAILED";
  AgentXErrorCode2["IPFS_FETCH_FAILED"] = "IPFS_FETCH_FAILED";
  AgentXErrorCode2["AGENT_NOT_FOUND"] = "AGENT_NOT_FOUND";
  AgentXErrorCode2["INVALID_SCHEMA"] = "INVALID_SCHEMA";
  AgentXErrorCode2["TX_FAILED"] = "TX_FAILED";
  AgentXErrorCode2["WALLET_NOT_CONNECTED"] = "WALLET_NOT_CONNECTED";
  return AgentXErrorCode2;
})(AgentXErrorCode || {});
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

// src/core/index.ts
init_crypto();

// src/agent/agent-runner.ts
init_crypto();
init_crypto();

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

// node_modules/viem/_esm/index.js
init_fromHex();
init_toHex();

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

// src/a2a/a2a.ts
var A2A_ABI = {
  createAgentCard: {
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "name", type: "string" },
      { name: "description", type: "string" },
      { name: "version", type: "string" },
      { name: "capabilities", type: "string[]" },
      { name: "supportedTasks", type: "string[]" },
      { name: "communicationProtocol", type: "string" },
      { name: "authenticationMethod", type: "string" },
      { name: "cardURI", type: "string" }
    ],
    name: "createAgentCard",
    outputs: [{ name: "cardId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  getAgentCard: {
    inputs: [{ name: "agentId", type: "uint256" }],
    name: "getAgentCard",
    outputs: [
      { name: "cardId", type: "uint256" },
      { name: "agentId", type: "uint256" },
      { name: "name", type: "string" },
      { name: "description", type: "string" },
      { name: "version", type: "string" },
      { name: "capabilities", type: "string[]" },
      { name: "supportedTasks", type: "string[]" },
      { name: "communicationProtocol", type: "string" },
      { name: "authenticationMethod", type: "string" },
      { name: "cardURI", type: "string" },
      { name: "isActive", type: "bool" }
    ],
    stateMutability: "view",
    type: "function"
  },
  registerSkill: {
    inputs: [
      { name: "name", type: "string" },
      { name: "description", type: "string" },
      { name: "inputSchema", type: "string" },
      { name: "outputSchema", type: "string" },
      { name: "requiredCapabilities", type: "string[]" },
      { name: "complexity", type: "uint256" }
    ],
    name: "registerSkill",
    outputs: [{ name: "skillId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  addAgentSkill: {
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "skillId", type: "uint256" },
      { name: "skillEndpoint", type: "string" },
      { name: "version", type: "string" },
      { name: "price", type: "uint256" },
      { name: "priceToken", type: "address" }
    ],
    name: "addAgentSkill",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  createTask: {
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "taskType", type: "string" },
      { name: "inputData", type: "string" }
    ],
    name: "createTask",
    outputs: [{ name: "taskId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  completeTask: {
    inputs: [
      { name: "taskId", type: "uint256" },
      { name: "outputData", type: "string" }
    ],
    name: "completeTask",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  getTask: {
    inputs: [{ name: "taskId", type: "uint256" }],
    name: "getTask",
    outputs: [
      { name: "taskId", type: "uint256" },
      { name: "agentId", type: "uint256" },
      { name: "taskType", type: "string" },
      { name: "inputData", type: "string" },
      { name: "outputData", type: "string" },
      { name: "status", type: "uint256" },
      { name: "clientAddress", type: "address" },
      { name: "createdAt", type: "uint256" },
      { name: "completedAt", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  getUserTasks: {
    inputs: [{ name: "user", type: "address" }],
    name: "getUserTasks",
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
    type: "function"
  }
};
var A2AProtocol = class {
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
  // ── Agent Card ──────────────────────────────────────────────────────────
  async createAgentCard(agentId, card) {
    const acct = await this.account;
    const { request } = await this.publicClient.simulateContract({
      account: acct,
      address: this.address,
      abi: [A2A_ABI.createAgentCard],
      functionName: "createAgentCard",
      args: [
        BigInt(agentId),
        card.name,
        card.description,
        card.version,
        card.capabilities,
        card.supportedTasks,
        card.commProtocol ?? "a2a",
        card.authMethod ?? "ecdsa",
        card.cardURI ?? ""
      ]
    });
    const hash = await this.walletClient.writeContract(request);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    const cardId = this._parseUintFromLog(receipt, "AgentCardCreated");
    return { cardId, txHash: hash };
  }
  async getAgentCard(agentId) {
    const r = await this.publicClient.readContract({
      address: this.address,
      abi: [A2A_ABI.getAgentCard],
      functionName: "getAgentCard",
      args: [BigInt(agentId)]
    });
    const [, aId, name, , , capabilities, supportedTasks, , , , isActive] = r;
    if (!isActive) return null;
    return {
      agentId: Number(aId),
      name,
      capabilities,
      supportedTasks,
      endpoint: "",
      publicKey: ""
    };
  }
  // ── Task ────────────────────────────────────────────────────────────────
  async createTask(agentId, taskType, input) {
    const acct = await this.account;
    const inputStr = JSON.stringify(input);
    const { request } = await this.publicClient.simulateContract({
      account: acct,
      address: this.address,
      abi: [A2A_ABI.createTask],
      functionName: "createTask",
      args: [BigInt(agentId), taskType, inputStr]
    });
    const hash = await this.walletClient.writeContract(request);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    const taskId = this._parseUintFromLog(receipt, "TaskCreated");
    return { taskId, txHash: hash };
  }
  async completeTask(taskId, output) {
    const acct = await this.account;
    const outputStr = typeof output === "string" ? output : JSON.stringify(output);
    const { request } = await this.publicClient.simulateContract({
      account: acct,
      address: this.address,
      abi: [A2A_ABI.completeTask],
      functionName: "completeTask",
      args: [BigInt(taskId), outputStr]
    });
    return this.walletClient.writeContract(request);
  }
  async getTask(taskId) {
    const r = await this.publicClient.readContract({
      address: this.address,
      abi: [A2A_ABI.getTask],
      functionName: "getTask",
      args: [BigInt(taskId)]
    });
    const [, aId, taskType, inputData, outputData, status, client, createdAt, completedAt] = r;
    const statusMap = ["created", "accepted", "in_progress", "completed", "failed"];
    return {
      taskId,
      creator: client,
      targetAgentId: Number(aId),
      taskType,
      input: inputData,
      status: statusMap[Number(status)] ?? "created",
      result: outputData,
      createdAt: Number(createdAt),
      completedAt: completedAt > 0n ? Number(completedAt) : void 0
    };
  }
  async getUserTasks(user) {
    const r = await this.publicClient.readContract({
      address: this.address,
      abi: [A2A_ABI.getUserTasks],
      functionName: "getUserTasks",
      args: [user]
    });
    return r.map(Number);
  }
  // ── Helpers ─────────────────────────────────────────────────────────────
  _parseUintFromLog(receipt, _eventName) {
    for (const log of receipt.logs) {
      if (log.topics.length >= 2) {
        try {
          return Number(BigInt(log.topics[1]));
        } catch {
        }
      }
      if (log.data && log.data !== "0x") {
        try {
          return Number(BigInt(log.data));
        } catch {
        }
      }
    }
    return 0;
  }
};

// src/a2a/index.ts
var A2A_VERSION = "0.1.0";

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
      a2aProtocolRegistry: "0x7F42a7dC4A0F3C107664C3750bE1B5B6fa6BEb86",
      reputationRegistry: "0x6a18C2664E1b42063860d864b6448b824d7B843F",
      configurationRegistry: "0x07280674ccc2898Fd038A9e3C22005CA83ffD2F8",
      multiEndpointRegistry: "0xB361d04F49000013FC131D3C59C41c8486C64f8c"
    },
    ipfsGateways: ["ipfs.io", "gateway.pinata.cloud", "dweb.link", "cf-ipfs.com"],
    rpcUrl: "http://43.156.99.215:18545"
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
var import_react = require("react");
var import_wagmi = require("wagmi");
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
  const publicClient = (0, import_wagmi.usePublicClient)();
  const { data: walletClient } = (0, import_wagmi.useWalletClient)();
  const [ctx, setCtx] = (0, import_react.useState)(null);
  const [isLoading, setIsLoading] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(null);
  const [refetchKey, setRefetchKey] = (0, import_react.useState)(0);
  const runnerRef = (0, import_react.useRef)(null);
  const mountedRef = (0, import_react.useRef)(true);
  (0, import_react.useEffect)(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  (0, import_react.useEffect)(() => {
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
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
});
//# sourceMappingURL=index.js.map