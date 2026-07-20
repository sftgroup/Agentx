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

// src/core/index.ts
var core_exports = {};
__export(core_exports, {
  AgentXError: () => AgentXError,
  AgentXErrorCode: () => AgentXErrorCode,
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
module.exports = __toCommonJS(core_exports);

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

// src/core/crypto.ts
var import_aes = require("@noble/ciphers/aes.js");
var import_secp256k1 = require("@noble/curves/secp256k1.js");
var import_sha2 = require("@noble/hashes/sha2.js");
var import_hkdf = require("@noble/hashes/hkdf.js");
var import_hmac = require("@noble/hashes/hmac.js");
var import_utils = require("@noble/ciphers/utils.js");
function randomBytes(length) {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint8Array(length);
    crypto.getRandomValues(buf);
    return buf;
  }
  const nodeCrypto = require("crypto");
  return new Uint8Array(nodeCrypto.randomBytes(length));
}
var AES_KEY_SIZE = 32;
var IV_SIZE = 12;
var TAG_SIZE = 16;
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AgentXError,
  AgentXErrorCode,
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
});
//# sourceMappingURL=index.js.map