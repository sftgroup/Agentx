var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

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
  const key = hexToBytes(keyHex);
  const iv = randomBytes(IV_SIZE);
  const plainBytes = new TextEncoder().encode(plaintext);
  const cipher = gcm(key, iv);
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
  const pub = secp256k1.getPublicKey(priv, false);
  return { privateKey: bytesToHex(priv), publicKey: bytesToHex(pub) };
}
function getPublicKey(privateKey) {
  return bytesToHex(secp256k1.getPublicKey(hexToBytes(privateKey), false));
}
export {
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
};
//# sourceMappingURL=index.mjs.map