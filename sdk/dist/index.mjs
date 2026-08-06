var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/core/crypto.ts
var crypto_exports = {};
__export(crypto_exports, {
  aesDecrypt: () => aesDecrypt,
  aesEncrypt: () => aesEncrypt,
  bytesToHex: () => bytesToHex,
  decryptPayload: () => decryptPayload,
  eciesDecrypt: () => eciesDecrypt,
  eciesEncrypt: () => eciesEncrypt,
  encryptPayload: () => encryptPayload,
  generateAesKey: () => generateAesKey,
  generateKeyPair: () => generateKeyPair,
  getPublicKey: () => getPublicKey,
  hexToBytes: () => hexToBytes,
  packAgentForPublish: () => packAgentForPublish,
  publishAgent: () => publishAgent,
  randomBytes: () => randomBytes,
  unpackAgent: () => unpackAgent
});
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
var AES_KEY_SIZE, IV_SIZE, TAG_SIZE;
var init_crypto = __esm({
  "src/core/crypto.ts"() {
    "use strict";
    AES_KEY_SIZE = 32;
    IV_SIZE = 12;
    TAG_SIZE = 16;
  }
});

// node_modules/abitype/dist/esm/version.js
var version;
var init_version = __esm({
  "node_modules/abitype/dist/esm/version.js"() {
    "use strict";
    version = "1.2.3";
  }
});

// node_modules/abitype/dist/esm/errors.js
var BaseError;
var init_errors = __esm({
  "node_modules/abitype/dist/esm/errors.js"() {
    "use strict";
    init_version();
    BaseError = class _BaseError extends Error {
      constructor(shortMessage, args = {}) {
        const details = args.cause instanceof _BaseError ? args.cause.details : args.cause?.message ? args.cause.message : args.details;
        const docsPath2 = args.cause instanceof _BaseError ? args.cause.docsPath || args.docsPath : args.docsPath;
        const message = [
          shortMessage || "An error occurred.",
          "",
          ...args.metaMessages ? [...args.metaMessages, ""] : [],
          ...docsPath2 ? [`Docs: https://abitype.dev${docsPath2}`] : [],
          ...details ? [`Details: ${details}`] : [],
          `Version: abitype@${version}`
        ].join("\n");
        super(message);
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
        Object.defineProperty(this, "name", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: "AbiTypeError"
        });
        if (args.cause)
          this.cause = args.cause;
        this.details = details;
        this.docsPath = docsPath2;
        this.metaMessages = args.metaMessages;
        this.shortMessage = shortMessage;
      }
    };
  }
});

// node_modules/abitype/dist/esm/regex.js
function execTyped(regex, string) {
  const match = regex.exec(string);
  return match?.groups;
}
var bytesRegex, integerRegex, isTupleRegex;
var init_regex = __esm({
  "node_modules/abitype/dist/esm/regex.js"() {
    "use strict";
    bytesRegex = /^bytes([1-9]|1[0-9]|2[0-9]|3[0-2])?$/;
    integerRegex = /^u?int(8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)?$/;
    isTupleRegex = /^\(.+?\).*?$/;
  }
});

// node_modules/abitype/dist/esm/human-readable/formatAbiParameter.js
function formatAbiParameter(abiParameter) {
  let type = abiParameter.type;
  if (tupleRegex.test(abiParameter.type) && "components" in abiParameter) {
    type = "(";
    const length = abiParameter.components.length;
    for (let i = 0; i < length; i++) {
      const component = abiParameter.components[i];
      type += formatAbiParameter(component);
      if (i < length - 1)
        type += ", ";
    }
    const result = execTyped(tupleRegex, abiParameter.type);
    type += `)${result?.array || ""}`;
    return formatAbiParameter({
      ...abiParameter,
      type
    });
  }
  if ("indexed" in abiParameter && abiParameter.indexed)
    type = `${type} indexed`;
  if (abiParameter.name)
    return `${type} ${abiParameter.name}`;
  return type;
}
var tupleRegex;
var init_formatAbiParameter = __esm({
  "node_modules/abitype/dist/esm/human-readable/formatAbiParameter.js"() {
    "use strict";
    init_regex();
    tupleRegex = /^tuple(?<array>(\[(\d*)\])*)$/;
  }
});

// node_modules/abitype/dist/esm/human-readable/formatAbiParameters.js
function formatAbiParameters(abiParameters) {
  let params = "";
  const length = abiParameters.length;
  for (let i = 0; i < length; i++) {
    const abiParameter = abiParameters[i];
    params += formatAbiParameter(abiParameter);
    if (i !== length - 1)
      params += ", ";
  }
  return params;
}
var init_formatAbiParameters = __esm({
  "node_modules/abitype/dist/esm/human-readable/formatAbiParameters.js"() {
    "use strict";
    init_formatAbiParameter();
  }
});

// node_modules/abitype/dist/esm/human-readable/formatAbiItem.js
function formatAbiItem(abiItem) {
  if (abiItem.type === "function")
    return `function ${abiItem.name}(${formatAbiParameters(abiItem.inputs)})${abiItem.stateMutability && abiItem.stateMutability !== "nonpayable" ? ` ${abiItem.stateMutability}` : ""}${abiItem.outputs?.length ? ` returns (${formatAbiParameters(abiItem.outputs)})` : ""}`;
  if (abiItem.type === "event")
    return `event ${abiItem.name}(${formatAbiParameters(abiItem.inputs)})`;
  if (abiItem.type === "error")
    return `error ${abiItem.name}(${formatAbiParameters(abiItem.inputs)})`;
  if (abiItem.type === "constructor")
    return `constructor(${formatAbiParameters(abiItem.inputs)})${abiItem.stateMutability === "payable" ? " payable" : ""}`;
  if (abiItem.type === "fallback")
    return `fallback() external${abiItem.stateMutability === "payable" ? " payable" : ""}`;
  return "receive() external payable";
}
var init_formatAbiItem = __esm({
  "node_modules/abitype/dist/esm/human-readable/formatAbiItem.js"() {
    "use strict";
    init_formatAbiParameters();
  }
});

// node_modules/abitype/dist/esm/human-readable/runtime/signatures.js
function isErrorSignature(signature) {
  return errorSignatureRegex.test(signature);
}
function execErrorSignature(signature) {
  return execTyped(errorSignatureRegex, signature);
}
function isEventSignature(signature) {
  return eventSignatureRegex.test(signature);
}
function execEventSignature(signature) {
  return execTyped(eventSignatureRegex, signature);
}
function isFunctionSignature(signature) {
  return functionSignatureRegex.test(signature);
}
function execFunctionSignature(signature) {
  return execTyped(functionSignatureRegex, signature);
}
function isStructSignature(signature) {
  return structSignatureRegex.test(signature);
}
function execStructSignature(signature) {
  return execTyped(structSignatureRegex, signature);
}
function isConstructorSignature(signature) {
  return constructorSignatureRegex.test(signature);
}
function execConstructorSignature(signature) {
  return execTyped(constructorSignatureRegex, signature);
}
function isFallbackSignature(signature) {
  return fallbackSignatureRegex.test(signature);
}
function execFallbackSignature(signature) {
  return execTyped(fallbackSignatureRegex, signature);
}
function isReceiveSignature(signature) {
  return receiveSignatureRegex.test(signature);
}
var errorSignatureRegex, eventSignatureRegex, functionSignatureRegex, structSignatureRegex, constructorSignatureRegex, fallbackSignatureRegex, receiveSignatureRegex, eventModifiers, functionModifiers;
var init_signatures = __esm({
  "node_modules/abitype/dist/esm/human-readable/runtime/signatures.js"() {
    "use strict";
    init_regex();
    errorSignatureRegex = /^error (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*)\((?<parameters>.*?)\)$/;
    eventSignatureRegex = /^event (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*)\((?<parameters>.*?)\)$/;
    functionSignatureRegex = /^function (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*)\((?<parameters>.*?)\)(?: (?<scope>external|public{1}))?(?: (?<stateMutability>pure|view|nonpayable|payable{1}))?(?: returns\s?\((?<returns>.*?)\))?$/;
    structSignatureRegex = /^struct (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*) \{(?<properties>.*?)\}$/;
    constructorSignatureRegex = /^constructor\((?<parameters>.*?)\)(?:\s(?<stateMutability>payable{1}))?$/;
    fallbackSignatureRegex = /^fallback\(\) external(?:\s(?<stateMutability>payable{1}))?$/;
    receiveSignatureRegex = /^receive\(\) external payable$/;
    eventModifiers = /* @__PURE__ */ new Set(["indexed"]);
    functionModifiers = /* @__PURE__ */ new Set([
      "calldata",
      "memory",
      "storage"
    ]);
  }
});

// node_modules/abitype/dist/esm/human-readable/errors/abiItem.js
var InvalidAbiItemError, UnknownTypeError, UnknownSolidityTypeError;
var init_abiItem = __esm({
  "node_modules/abitype/dist/esm/human-readable/errors/abiItem.js"() {
    "use strict";
    init_errors();
    InvalidAbiItemError = class extends BaseError {
      constructor({ signature }) {
        super("Failed to parse ABI item.", {
          details: `parseAbiItem(${JSON.stringify(signature, null, 2)})`,
          docsPath: "/api/human#parseabiitem-1"
        });
        Object.defineProperty(this, "name", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: "InvalidAbiItemError"
        });
      }
    };
    UnknownTypeError = class extends BaseError {
      constructor({ type }) {
        super("Unknown type.", {
          metaMessages: [
            `Type "${type}" is not a valid ABI type. Perhaps you forgot to include a struct signature?`
          ]
        });
        Object.defineProperty(this, "name", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: "UnknownTypeError"
        });
      }
    };
    UnknownSolidityTypeError = class extends BaseError {
      constructor({ type }) {
        super("Unknown type.", {
          metaMessages: [`Type "${type}" is not a valid ABI type.`]
        });
        Object.defineProperty(this, "name", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: "UnknownSolidityTypeError"
        });
      }
    };
  }
});

// node_modules/abitype/dist/esm/human-readable/errors/abiParameter.js
var InvalidParameterError, SolidityProtectedKeywordError, InvalidModifierError, InvalidFunctionModifierError, InvalidAbiTypeParameterError;
var init_abiParameter = __esm({
  "node_modules/abitype/dist/esm/human-readable/errors/abiParameter.js"() {
    "use strict";
    init_errors();
    InvalidParameterError = class extends BaseError {
      constructor({ param }) {
        super("Invalid ABI parameter.", {
          details: param
        });
        Object.defineProperty(this, "name", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: "InvalidParameterError"
        });
      }
    };
    SolidityProtectedKeywordError = class extends BaseError {
      constructor({ param, name }) {
        super("Invalid ABI parameter.", {
          details: param,
          metaMessages: [
            `"${name}" is a protected Solidity keyword. More info: https://docs.soliditylang.org/en/latest/cheatsheet.html`
          ]
        });
        Object.defineProperty(this, "name", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: "SolidityProtectedKeywordError"
        });
      }
    };
    InvalidModifierError = class extends BaseError {
      constructor({ param, type, modifier }) {
        super("Invalid ABI parameter.", {
          details: param,
          metaMessages: [
            `Modifier "${modifier}" not allowed${type ? ` in "${type}" type` : ""}.`
          ]
        });
        Object.defineProperty(this, "name", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: "InvalidModifierError"
        });
      }
    };
    InvalidFunctionModifierError = class extends BaseError {
      constructor({ param, type, modifier }) {
        super("Invalid ABI parameter.", {
          details: param,
          metaMessages: [
            `Modifier "${modifier}" not allowed${type ? ` in "${type}" type` : ""}.`,
            `Data location can only be specified for array, struct, or mapping types, but "${modifier}" was given.`
          ]
        });
        Object.defineProperty(this, "name", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: "InvalidFunctionModifierError"
        });
      }
    };
    InvalidAbiTypeParameterError = class extends BaseError {
      constructor({ abiParameter }) {
        super("Invalid ABI parameter.", {
          details: JSON.stringify(abiParameter, null, 2),
          metaMessages: ["ABI parameter type is invalid."]
        });
        Object.defineProperty(this, "name", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: "InvalidAbiTypeParameterError"
        });
      }
    };
  }
});

// node_modules/abitype/dist/esm/human-readable/errors/signature.js
var InvalidSignatureError, UnknownSignatureError, InvalidStructSignatureError;
var init_signature = __esm({
  "node_modules/abitype/dist/esm/human-readable/errors/signature.js"() {
    "use strict";
    init_errors();
    InvalidSignatureError = class extends BaseError {
      constructor({ signature, type }) {
        super(`Invalid ${type} signature.`, {
          details: signature
        });
        Object.defineProperty(this, "name", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: "InvalidSignatureError"
        });
      }
    };
    UnknownSignatureError = class extends BaseError {
      constructor({ signature }) {
        super("Unknown signature.", {
          details: signature
        });
        Object.defineProperty(this, "name", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: "UnknownSignatureError"
        });
      }
    };
    InvalidStructSignatureError = class extends BaseError {
      constructor({ signature }) {
        super("Invalid struct signature.", {
          details: signature,
          metaMessages: ["No properties exist."]
        });
        Object.defineProperty(this, "name", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: "InvalidStructSignatureError"
        });
      }
    };
  }
});

// node_modules/abitype/dist/esm/human-readable/errors/struct.js
var CircularReferenceError;
var init_struct = __esm({
  "node_modules/abitype/dist/esm/human-readable/errors/struct.js"() {
    "use strict";
    init_errors();
    CircularReferenceError = class extends BaseError {
      constructor({ type }) {
        super("Circular reference detected.", {
          metaMessages: [`Struct "${type}" is a circular reference.`]
        });
        Object.defineProperty(this, "name", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: "CircularReferenceError"
        });
      }
    };
  }
});

// node_modules/abitype/dist/esm/human-readable/errors/splitParameters.js
var InvalidParenthesisError;
var init_splitParameters = __esm({
  "node_modules/abitype/dist/esm/human-readable/errors/splitParameters.js"() {
    "use strict";
    init_errors();
    InvalidParenthesisError = class extends BaseError {
      constructor({ current, depth }) {
        super("Unbalanced parentheses.", {
          metaMessages: [
            `"${current.trim()}" has too many ${depth > 0 ? "opening" : "closing"} parentheses.`
          ],
          details: `Depth "${depth}"`
        });
        Object.defineProperty(this, "name", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: "InvalidParenthesisError"
        });
      }
    };
  }
});

// node_modules/abitype/dist/esm/human-readable/runtime/cache.js
function getParameterCacheKey(param, type, structs) {
  let structKey = "";
  if (structs)
    for (const struct of Object.entries(structs)) {
      if (!struct)
        continue;
      let propertyKey = "";
      for (const property of struct[1]) {
        propertyKey += `[${property.type}${property.name ? `:${property.name}` : ""}]`;
      }
      structKey += `(${struct[0]}{${propertyKey}})`;
    }
  if (type)
    return `${type}:${param}${structKey}`;
  return `${param}${structKey}`;
}
var parameterCache;
var init_cache = __esm({
  "node_modules/abitype/dist/esm/human-readable/runtime/cache.js"() {
    "use strict";
    parameterCache = /* @__PURE__ */ new Map([
      // Unnamed
      ["address", { type: "address" }],
      ["bool", { type: "bool" }],
      ["bytes", { type: "bytes" }],
      ["bytes32", { type: "bytes32" }],
      ["int", { type: "int256" }],
      ["int256", { type: "int256" }],
      ["string", { type: "string" }],
      ["uint", { type: "uint256" }],
      ["uint8", { type: "uint8" }],
      ["uint16", { type: "uint16" }],
      ["uint24", { type: "uint24" }],
      ["uint32", { type: "uint32" }],
      ["uint64", { type: "uint64" }],
      ["uint96", { type: "uint96" }],
      ["uint112", { type: "uint112" }],
      ["uint160", { type: "uint160" }],
      ["uint192", { type: "uint192" }],
      ["uint256", { type: "uint256" }],
      // Named
      ["address owner", { type: "address", name: "owner" }],
      ["address to", { type: "address", name: "to" }],
      ["bool approved", { type: "bool", name: "approved" }],
      ["bytes _data", { type: "bytes", name: "_data" }],
      ["bytes data", { type: "bytes", name: "data" }],
      ["bytes signature", { type: "bytes", name: "signature" }],
      ["bytes32 hash", { type: "bytes32", name: "hash" }],
      ["bytes32 r", { type: "bytes32", name: "r" }],
      ["bytes32 root", { type: "bytes32", name: "root" }],
      ["bytes32 s", { type: "bytes32", name: "s" }],
      ["string name", { type: "string", name: "name" }],
      ["string symbol", { type: "string", name: "symbol" }],
      ["string tokenURI", { type: "string", name: "tokenURI" }],
      ["uint tokenId", { type: "uint256", name: "tokenId" }],
      ["uint8 v", { type: "uint8", name: "v" }],
      ["uint256 balance", { type: "uint256", name: "balance" }],
      ["uint256 tokenId", { type: "uint256", name: "tokenId" }],
      ["uint256 value", { type: "uint256", name: "value" }],
      // Indexed
      [
        "event:address indexed from",
        { type: "address", name: "from", indexed: true }
      ],
      ["event:address indexed to", { type: "address", name: "to", indexed: true }],
      [
        "event:uint indexed tokenId",
        { type: "uint256", name: "tokenId", indexed: true }
      ],
      [
        "event:uint256 indexed tokenId",
        { type: "uint256", name: "tokenId", indexed: true }
      ]
    ]);
  }
});

// node_modules/abitype/dist/esm/human-readable/runtime/utils.js
function parseSignature(signature, structs = {}) {
  if (isFunctionSignature(signature))
    return parseFunctionSignature(signature, structs);
  if (isEventSignature(signature))
    return parseEventSignature(signature, structs);
  if (isErrorSignature(signature))
    return parseErrorSignature(signature, structs);
  if (isConstructorSignature(signature))
    return parseConstructorSignature(signature, structs);
  if (isFallbackSignature(signature))
    return parseFallbackSignature(signature);
  if (isReceiveSignature(signature))
    return {
      type: "receive",
      stateMutability: "payable"
    };
  throw new UnknownSignatureError({ signature });
}
function parseFunctionSignature(signature, structs = {}) {
  const match = execFunctionSignature(signature);
  if (!match)
    throw new InvalidSignatureError({ signature, type: "function" });
  const inputParams = splitParameters(match.parameters);
  const inputs = [];
  const inputLength = inputParams.length;
  for (let i = 0; i < inputLength; i++) {
    inputs.push(parseAbiParameter(inputParams[i], {
      modifiers: functionModifiers,
      structs,
      type: "function"
    }));
  }
  const outputs = [];
  if (match.returns) {
    const outputParams = splitParameters(match.returns);
    const outputLength = outputParams.length;
    for (let i = 0; i < outputLength; i++) {
      outputs.push(parseAbiParameter(outputParams[i], {
        modifiers: functionModifiers,
        structs,
        type: "function"
      }));
    }
  }
  return {
    name: match.name,
    type: "function",
    stateMutability: match.stateMutability ?? "nonpayable",
    inputs,
    outputs
  };
}
function parseEventSignature(signature, structs = {}) {
  const match = execEventSignature(signature);
  if (!match)
    throw new InvalidSignatureError({ signature, type: "event" });
  const params = splitParameters(match.parameters);
  const abiParameters = [];
  const length = params.length;
  for (let i = 0; i < length; i++)
    abiParameters.push(parseAbiParameter(params[i], {
      modifiers: eventModifiers,
      structs,
      type: "event"
    }));
  return { name: match.name, type: "event", inputs: abiParameters };
}
function parseErrorSignature(signature, structs = {}) {
  const match = execErrorSignature(signature);
  if (!match)
    throw new InvalidSignatureError({ signature, type: "error" });
  const params = splitParameters(match.parameters);
  const abiParameters = [];
  const length = params.length;
  for (let i = 0; i < length; i++)
    abiParameters.push(parseAbiParameter(params[i], { structs, type: "error" }));
  return { name: match.name, type: "error", inputs: abiParameters };
}
function parseConstructorSignature(signature, structs = {}) {
  const match = execConstructorSignature(signature);
  if (!match)
    throw new InvalidSignatureError({ signature, type: "constructor" });
  const params = splitParameters(match.parameters);
  const abiParameters = [];
  const length = params.length;
  for (let i = 0; i < length; i++)
    abiParameters.push(parseAbiParameter(params[i], { structs, type: "constructor" }));
  return {
    type: "constructor",
    stateMutability: match.stateMutability ?? "nonpayable",
    inputs: abiParameters
  };
}
function parseFallbackSignature(signature) {
  const match = execFallbackSignature(signature);
  if (!match)
    throw new InvalidSignatureError({ signature, type: "fallback" });
  return {
    type: "fallback",
    stateMutability: match.stateMutability ?? "nonpayable"
  };
}
function parseAbiParameter(param, options) {
  const parameterCacheKey = getParameterCacheKey(param, options?.type, options?.structs);
  if (parameterCache.has(parameterCacheKey))
    return parameterCache.get(parameterCacheKey);
  const isTuple = isTupleRegex.test(param);
  const match = execTyped(isTuple ? abiParameterWithTupleRegex : abiParameterWithoutTupleRegex, param);
  if (!match)
    throw new InvalidParameterError({ param });
  if (match.name && isSolidityKeyword(match.name))
    throw new SolidityProtectedKeywordError({ param, name: match.name });
  const name = match.name ? { name: match.name } : {};
  const indexed = match.modifier === "indexed" ? { indexed: true } : {};
  const structs = options?.structs ?? {};
  let type;
  let components = {};
  if (isTuple) {
    type = "tuple";
    const params = splitParameters(match.type);
    const components_ = [];
    const length = params.length;
    for (let i = 0; i < length; i++) {
      components_.push(parseAbiParameter(params[i], { structs }));
    }
    components = { components: components_ };
  } else if (match.type in structs) {
    type = "tuple";
    components = { components: structs[match.type] };
  } else if (dynamicIntegerRegex.test(match.type)) {
    type = `${match.type}256`;
  } else if (match.type === "address payable") {
    type = "address";
  } else {
    type = match.type;
    if (!(options?.type === "struct") && !isSolidityType(type))
      throw new UnknownSolidityTypeError({ type });
  }
  if (match.modifier) {
    if (!options?.modifiers?.has?.(match.modifier))
      throw new InvalidModifierError({
        param,
        type: options?.type,
        modifier: match.modifier
      });
    if (functionModifiers.has(match.modifier) && !isValidDataLocation(type, !!match.array))
      throw new InvalidFunctionModifierError({
        param,
        type: options?.type,
        modifier: match.modifier
      });
  }
  const abiParameter = {
    type: `${type}${match.array ?? ""}`,
    ...name,
    ...indexed,
    ...components
  };
  parameterCache.set(parameterCacheKey, abiParameter);
  return abiParameter;
}
function splitParameters(params, result = [], current = "", depth = 0) {
  const length = params.trim().length;
  for (let i = 0; i < length; i++) {
    const char = params[i];
    const tail = params.slice(i + 1);
    switch (char) {
      case ",":
        return depth === 0 ? splitParameters(tail, [...result, current.trim()]) : splitParameters(tail, result, `${current}${char}`, depth);
      case "(":
        return splitParameters(tail, result, `${current}${char}`, depth + 1);
      case ")":
        return splitParameters(tail, result, `${current}${char}`, depth - 1);
      default:
        return splitParameters(tail, result, `${current}${char}`, depth);
    }
  }
  if (current === "")
    return result;
  if (depth !== 0)
    throw new InvalidParenthesisError({ current, depth });
  result.push(current.trim());
  return result;
}
function isSolidityType(type) {
  return type === "address" || type === "bool" || type === "function" || type === "string" || bytesRegex.test(type) || integerRegex.test(type);
}
function isSolidityKeyword(name) {
  return name === "address" || name === "bool" || name === "function" || name === "string" || name === "tuple" || bytesRegex.test(name) || integerRegex.test(name) || protectedKeywordsRegex.test(name);
}
function isValidDataLocation(type, isArray) {
  return isArray || type === "bytes" || type === "string" || type === "tuple";
}
var abiParameterWithoutTupleRegex, abiParameterWithTupleRegex, dynamicIntegerRegex, protectedKeywordsRegex;
var init_utils = __esm({
  "node_modules/abitype/dist/esm/human-readable/runtime/utils.js"() {
    "use strict";
    init_regex();
    init_abiItem();
    init_abiParameter();
    init_signature();
    init_splitParameters();
    init_cache();
    init_signatures();
    abiParameterWithoutTupleRegex = /^(?<type>[a-zA-Z$_][a-zA-Z0-9$_]*(?:\spayable)?)(?<array>(?:\[\d*?\])+?)?(?:\s(?<modifier>calldata|indexed|memory|storage{1}))?(?:\s(?<name>[a-zA-Z$_][a-zA-Z0-9$_]*))?$/;
    abiParameterWithTupleRegex = /^\((?<type>.+?)\)(?<array>(?:\[\d*?\])+?)?(?:\s(?<modifier>calldata|indexed|memory|storage{1}))?(?:\s(?<name>[a-zA-Z$_][a-zA-Z0-9$_]*))?$/;
    dynamicIntegerRegex = /^u?int$/;
    protectedKeywordsRegex = /^(?:after|alias|anonymous|apply|auto|byte|calldata|case|catch|constant|copyof|default|defined|error|event|external|false|final|function|immutable|implements|in|indexed|inline|internal|let|mapping|match|memory|mutable|null|of|override|partial|private|promise|public|pure|reference|relocatable|return|returns|sizeof|static|storage|struct|super|supports|switch|this|true|try|typedef|typeof|var|view|virtual)$/;
  }
});

// node_modules/abitype/dist/esm/human-readable/runtime/structs.js
function parseStructs(signatures) {
  const shallowStructs = {};
  const signaturesLength = signatures.length;
  for (let i = 0; i < signaturesLength; i++) {
    const signature = signatures[i];
    if (!isStructSignature(signature))
      continue;
    const match = execStructSignature(signature);
    if (!match)
      throw new InvalidSignatureError({ signature, type: "struct" });
    const properties = match.properties.split(";");
    const components = [];
    const propertiesLength = properties.length;
    for (let k = 0; k < propertiesLength; k++) {
      const property = properties[k];
      const trimmed = property.trim();
      if (!trimmed)
        continue;
      const abiParameter = parseAbiParameter(trimmed, {
        type: "struct"
      });
      components.push(abiParameter);
    }
    if (!components.length)
      throw new InvalidStructSignatureError({ signature });
    shallowStructs[match.name] = components;
  }
  const resolvedStructs = {};
  const entries = Object.entries(shallowStructs);
  const entriesLength = entries.length;
  for (let i = 0; i < entriesLength; i++) {
    const [name, parameters] = entries[i];
    resolvedStructs[name] = resolveStructs(parameters, shallowStructs);
  }
  return resolvedStructs;
}
function resolveStructs(abiParameters = [], structs = {}, ancestors = /* @__PURE__ */ new Set()) {
  const components = [];
  const length = abiParameters.length;
  for (let i = 0; i < length; i++) {
    const abiParameter = abiParameters[i];
    const isTuple = isTupleRegex.test(abiParameter.type);
    if (isTuple)
      components.push(abiParameter);
    else {
      const match = execTyped(typeWithoutTupleRegex, abiParameter.type);
      if (!match?.type)
        throw new InvalidAbiTypeParameterError({ abiParameter });
      const { array: array2, type } = match;
      if (type in structs) {
        if (ancestors.has(type))
          throw new CircularReferenceError({ type });
        components.push({
          ...abiParameter,
          type: `tuple${array2 ?? ""}`,
          components: resolveStructs(structs[type], structs, /* @__PURE__ */ new Set([...ancestors, type]))
        });
      } else {
        if (isSolidityType(type))
          components.push(abiParameter);
        else
          throw new UnknownTypeError({ type });
      }
    }
  }
  return components;
}
var typeWithoutTupleRegex;
var init_structs = __esm({
  "node_modules/abitype/dist/esm/human-readable/runtime/structs.js"() {
    "use strict";
    init_regex();
    init_abiItem();
    init_abiParameter();
    init_signature();
    init_struct();
    init_signatures();
    init_utils();
    typeWithoutTupleRegex = /^(?<type>[a-zA-Z$_][a-zA-Z0-9$_]*)(?<array>(?:\[\d*?\])+?)?$/;
  }
});

// node_modules/abitype/dist/esm/human-readable/parseAbiItem.js
function parseAbiItem(signature) {
  let abiItem;
  if (typeof signature === "string")
    abiItem = parseSignature(signature);
  else {
    const structs = parseStructs(signature);
    const length = signature.length;
    for (let i = 0; i < length; i++) {
      const signature_ = signature[i];
      if (isStructSignature(signature_))
        continue;
      abiItem = parseSignature(signature_, structs);
      break;
    }
  }
  if (!abiItem)
    throw new InvalidAbiItemError({ signature });
  return abiItem;
}
var init_parseAbiItem = __esm({
  "node_modules/abitype/dist/esm/human-readable/parseAbiItem.js"() {
    "use strict";
    init_abiItem();
    init_signatures();
    init_structs();
    init_utils();
  }
});

// node_modules/abitype/dist/esm/exports/index.js
var init_exports = __esm({
  "node_modules/abitype/dist/esm/exports/index.js"() {
    "use strict";
    init_formatAbiItem();
    init_parseAbiItem();
  }
});

// node_modules/viem/_esm/utils/abi/formatAbiItem.js
function formatAbiItem2(abiItem, { includeName = false } = {}) {
  if (abiItem.type !== "function" && abiItem.type !== "event" && abiItem.type !== "error")
    throw new InvalidDefinitionTypeError(abiItem.type);
  return `${abiItem.name}(${formatAbiParams(abiItem.inputs, { includeName })})`;
}
function formatAbiParams(params, { includeName = false } = {}) {
  if (!params)
    return "";
  return params.map((param) => formatAbiParam(param, { includeName })).join(includeName ? ", " : ",");
}
function formatAbiParam(param, { includeName }) {
  if (param.type.startsWith("tuple")) {
    return `(${formatAbiParams(param.components, { includeName })})${param.type.slice("tuple".length)}`;
  }
  return param.type + (includeName && param.name ? ` ${param.name}` : "");
}
var init_formatAbiItem2 = __esm({
  "node_modules/viem/_esm/utils/abi/formatAbiItem.js"() {
    "use strict";
    init_abi();
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
var version2;
var init_version2 = __esm({
  "node_modules/viem/_esm/errors/version.js"() {
    "use strict";
    version2 = "2.55.2";
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
var errorConfig, BaseError2;
var init_base = __esm({
  "node_modules/viem/_esm/errors/base.js"() {
    "use strict";
    init_version2();
    errorConfig = {
      getDocsUrl: ({ docsBaseUrl, docsPath: docsPath2 = "", docsSlug }) => docsPath2 ? `${docsBaseUrl ?? "https://viem.sh"}${docsPath2}${docsSlug ? `#${docsSlug}` : ""}` : void 0,
      version: `viem@${version2}`
    };
    BaseError2 = class _BaseError extends Error {
      constructor(shortMessage, args = {}) {
        const details = (() => {
          if (args.cause instanceof _BaseError)
            return args.cause.details;
          if (args.cause?.message)
            return args.cause.message;
          return args.details;
        })();
        const docsPath2 = (() => {
          if (args.cause instanceof _BaseError)
            return args.cause.docsPath || args.docsPath;
          return args.docsPath;
        })();
        const docsUrl = errorConfig.getDocsUrl?.({ ...args, docsPath: docsPath2 });
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
        this.docsPath = docsPath2;
        this.metaMessages = args.metaMessages;
        this.name = args.name ?? this.name;
        this.shortMessage = shortMessage;
        this.version = version2;
      }
      walk(fn) {
        return walk(this, fn);
      }
    };
  }
});

// node_modules/viem/_esm/errors/abi.js
var AbiDecodingDataSizeTooSmallError, AbiDecodingZeroDataError, AbiEventSignatureEmptyTopicsError, AbiEventSignatureNotFoundError, DecodeLogDataMismatch, DecodeLogTopicsMismatch, InvalidAbiDecodingTypeError, InvalidDefinitionTypeError;
var init_abi = __esm({
  "node_modules/viem/_esm/errors/abi.js"() {
    "use strict";
    init_formatAbiItem2();
    init_base();
    AbiDecodingDataSizeTooSmallError = class extends BaseError2 {
      constructor({ data, params, size: size2 }) {
        super([`Data size of ${size2} bytes is too small for given parameters.`].join("\n"), {
          metaMessages: [
            `Params: (${formatAbiParams(params, { includeName: true })})`,
            `Data:   ${data} (${size2} bytes)`
          ],
          name: "AbiDecodingDataSizeTooSmallError"
        });
        Object.defineProperty(this, "data", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        Object.defineProperty(this, "params", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        Object.defineProperty(this, "size", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        this.data = data;
        this.params = params;
        this.size = size2;
      }
    };
    AbiDecodingZeroDataError = class extends BaseError2 {
      constructor({ cause } = {}) {
        super('Cannot decode zero data ("0x") with ABI parameters.', {
          name: "AbiDecodingZeroDataError",
          cause
        });
      }
    };
    AbiEventSignatureEmptyTopicsError = class extends BaseError2 {
      constructor({ docsPath: docsPath2 }) {
        super("Cannot extract event signature from empty topics.", {
          docsPath: docsPath2,
          name: "AbiEventSignatureEmptyTopicsError"
        });
      }
    };
    AbiEventSignatureNotFoundError = class extends BaseError2 {
      constructor(signature, { docsPath: docsPath2 }) {
        super([
          `Encoded event signature "${signature}" not found on ABI.`,
          "Make sure you are using the correct ABI and that the event exists on it.",
          `You can look up the signature here: https://4byte.sourcify.dev/?q=${signature}.`
        ].join("\n"), {
          docsPath: docsPath2,
          name: "AbiEventSignatureNotFoundError"
        });
      }
    };
    DecodeLogDataMismatch = class extends BaseError2 {
      constructor({ abiItem, data, params, size: size2 }) {
        super([
          `Data size of ${size2} bytes is too small for non-indexed event parameters.`
        ].join("\n"), {
          metaMessages: [
            `Params: (${formatAbiParams(params, { includeName: true })})`,
            `Data:   ${data} (${size2} bytes)`
          ],
          name: "DecodeLogDataMismatch"
        });
        Object.defineProperty(this, "abiItem", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        Object.defineProperty(this, "data", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        Object.defineProperty(this, "params", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        Object.defineProperty(this, "size", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        this.abiItem = abiItem;
        this.data = data;
        this.params = params;
        this.size = size2;
      }
    };
    DecodeLogTopicsMismatch = class extends BaseError2 {
      constructor({ abiItem, param }) {
        super([
          `Expected a topic for indexed event parameter${param.name ? ` "${param.name}"` : ""} on event "${formatAbiItem2(abiItem, { includeName: true })}".`
        ].join("\n"), { name: "DecodeLogTopicsMismatch" });
        Object.defineProperty(this, "abiItem", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        this.abiItem = abiItem;
      }
    };
    InvalidAbiDecodingTypeError = class extends BaseError2 {
      constructor(type, { docsPath: docsPath2 }) {
        super([
          `Type "${type}" is not a valid decoding type.`,
          "Please provide a valid ABI type."
        ].join("\n"), { docsPath: docsPath2, name: "InvalidAbiDecodingType" });
      }
    };
    InvalidDefinitionTypeError = class extends BaseError2 {
      constructor(type) {
        super([
          `"${type}" is not a valid definition type.`,
          'Valid types: "function", "event", "error"'
        ].join("\n"), { name: "InvalidDefinitionTypeError" });
      }
    };
  }
});

// node_modules/viem/_esm/errors/data.js
var SliceOffsetOutOfBoundsError, SizeExceedsPaddingSizeError;
var init_data = __esm({
  "node_modules/viem/_esm/errors/data.js"() {
    "use strict";
    init_base();
    SliceOffsetOutOfBoundsError = class extends BaseError2 {
      constructor({ offset, position, size: size2 }) {
        super(`Slice ${position === "start" ? "starting" : "ending"} at offset "${offset}" is out-of-bounds (size: ${size2}).`, { name: "SliceOffsetOutOfBoundsError" });
      }
    };
    SizeExceedsPaddingSizeError = class extends BaseError2 {
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
var IntegerOutOfRangeError, InvalidBytesBooleanError, SizeOverflowError;
var init_encoding = __esm({
  "node_modules/viem/_esm/errors/encoding.js"() {
    "use strict";
    init_base();
    IntegerOutOfRangeError = class extends BaseError2 {
      constructor({ max, min, signed, size: size2, value }) {
        super(`Number "${value}" is not in safe ${size2 ? `${size2 * 8}-bit ${signed ? "signed" : "unsigned"} ` : ""}integer range ${max ? `(${min} to ${max})` : `(above ${min})`}`, { name: "IntegerOutOfRangeError" });
      }
    };
    InvalidBytesBooleanError = class extends BaseError2 {
      constructor(bytes) {
        super(`Bytes value "${bytes}" is not a valid boolean. The bytes array must contain a single byte of either a 0 or 1 value.`, {
          name: "InvalidBytesBooleanError"
        });
      }
    };
    SizeOverflowError = class extends BaseError2 {
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
function hexToBigInt(hex, opts = {}) {
  const { signed } = opts;
  if (opts.size)
    assertSize(hex, { size: opts.size });
  const value = BigInt(hex);
  if (!signed)
    return value;
  const size2 = (hex.length - 2) / 2;
  const max = (1n << BigInt(size2) * 8n - 1n) - 1n;
  if (value <= max)
    return value;
  return value - BigInt(`0x${"f".padStart(size2 * 2, "f")}`) - 1n;
}
function hexToNumber(hex, opts = {}) {
  const value = hexToBigInt(hex, opts);
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new IntegerOutOfRangeError({
      max: `${Number.MAX_SAFE_INTEGER}`,
      min: `${Number.MIN_SAFE_INTEGER}`,
      signed: opts.signed,
      size: opts.size,
      value: `${value}n`
    });
  return number;
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
function toHex(value, opts = {}) {
  if (typeof value === "number" || typeof value === "bigint")
    return numberToHex(value, opts);
  if (typeof value === "string") {
    return stringToHex(value, opts);
  }
  if (typeof value === "boolean")
    return boolToHex(value, opts);
  return bytesToHex2(value, opts);
}
function boolToHex(value, opts = {}) {
  const hex = `0x${Number(value)}`;
  if (typeof opts.size === "number") {
    assertSize(hex, { size: opts.size });
    return pad(hex, { size: opts.size });
  }
  return hex;
}
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
function numberToHex(value_, opts = {}) {
  const { signed, size: size2 } = opts;
  const value = BigInt(value_);
  let maxValue;
  if (size2) {
    if (signed)
      maxValue = (1n << BigInt(size2) * 8n - 1n) - 1n;
    else
      maxValue = 2n ** (BigInt(size2) * 8n) - 1n;
  } else if (typeof value_ === "number") {
    maxValue = BigInt(Number.MAX_SAFE_INTEGER);
  }
  const minValue = typeof maxValue === "bigint" && signed ? -maxValue - 1n : 0;
  if (maxValue && value > maxValue || value < minValue) {
    const suffix = typeof value_ === "bigint" ? "n" : "";
    throw new IntegerOutOfRangeError({
      max: maxValue ? `${maxValue}${suffix}` : void 0,
      min: `${minValue}${suffix}`,
      signed,
      size: size2,
      value: `${value_}${suffix}`
    });
  }
  const hex = `0x${(signed && value < 0 ? (1n << BigInt(size2 * 8)) + BigInt(value) : value).toString(16)}`;
  if (size2)
    return pad(hex, { size: size2 });
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
    init_encoding();
    init_pad();
    init_fromHex();
    hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_v, i) => i.toString(16).padStart(2, "0"));
    encoder = /* @__PURE__ */ new TextEncoder();
  }
});

// node_modules/viem/_esm/utils/encoding/toBytes.js
function toBytes(value, opts = {}) {
  if (typeof value === "number" || typeof value === "bigint")
    return numberToBytes(value, opts);
  if (typeof value === "boolean")
    return boolToBytes(value, opts);
  if (isHex(value))
    return hexToBytes2(value, opts);
  return stringToBytes(value, opts);
}
function boolToBytes(value, opts = {}) {
  const bytes = new Uint8Array(1);
  bytes[0] = Number(value);
  if (typeof opts.size === "number") {
    assertSize(bytes, { size: opts.size });
    return pad(bytes, { size: opts.size });
  }
  return bytes;
}
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
      throw new BaseError2(`Invalid byte sequence ("${hexString[j - 2]}${hexString[j - 1]}" in "${hexString}").`);
    }
    bytes[index] = nibbleLeft * 16 + nibbleRight;
  }
  return bytes;
}
function numberToBytes(value, opts) {
  const hex = numberToHex(value, opts);
  return hexToBytes2(hex);
}
function stringToBytes(value, opts = {}) {
  const bytes = encoder2.encode(value);
  if (typeof opts.size === "number") {
    assertSize(bytes, { size: opts.size });
    return pad(bytes, { dir: "right", size: opts.size });
  }
  return bytes;
}
var encoder2, charCodeMap;
var init_toBytes = __esm({
  "node_modules/viem/_esm/utils/encoding/toBytes.js"() {
    "use strict";
    init_base();
    init_isHex();
    init_pad();
    init_fromHex();
    init_toHex();
    encoder2 = /* @__PURE__ */ new TextEncoder();
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

// node_modules/viem/_esm/utils/hash/keccak256.js
import { keccak_256 } from "@noble/hashes/sha3";
function keccak256(value, to_) {
  const to = to_ || "hex";
  const bytes = keccak_256(isHex(value, { strict: false }) ? toBytes(value) : value);
  if (to === "bytes")
    return bytes;
  return toHex(bytes);
}
var init_keccak256 = __esm({
  "node_modules/viem/_esm/utils/hash/keccak256.js"() {
    "use strict";
    init_isHex();
    init_toBytes();
    init_toHex();
  }
});

// node_modules/viem/_esm/utils/hash/hashSignature.js
function hashSignature(sig) {
  return hash(sig);
}
var hash;
var init_hashSignature = __esm({
  "node_modules/viem/_esm/utils/hash/hashSignature.js"() {
    "use strict";
    init_toBytes();
    init_keccak256();
    hash = (value) => keccak256(toBytes(value));
  }
});

// node_modules/viem/_esm/utils/hash/normalizeSignature.js
function normalizeSignature(signature) {
  let active = true;
  let current = "";
  let level = 0;
  let result = "";
  let valid = false;
  for (let i = 0; i < signature.length; i++) {
    const char = signature[i];
    if (["(", ")", ","].includes(char))
      active = true;
    if (char === "(")
      level++;
    if (char === ")")
      level--;
    if (!active)
      continue;
    if (level === 0) {
      if (char === " " && ["event", "function", ""].includes(result))
        result = "";
      else {
        result += char;
        if (char === ")") {
          valid = true;
          break;
        }
      }
      continue;
    }
    if (char === " ") {
      if (signature[i - 1] !== "," && current !== "," && current !== ",(") {
        current = "";
        active = false;
      }
      continue;
    }
    result += char;
    current += char;
  }
  if (!valid)
    throw new BaseError2("Unable to normalize signature.");
  return result;
}
var init_normalizeSignature = __esm({
  "node_modules/viem/_esm/utils/hash/normalizeSignature.js"() {
    "use strict";
    init_base();
  }
});

// node_modules/viem/_esm/utils/hash/toSignature.js
var toSignature;
var init_toSignature = __esm({
  "node_modules/viem/_esm/utils/hash/toSignature.js"() {
    "use strict";
    init_exports();
    init_normalizeSignature();
    toSignature = (def) => {
      const def_ = (() => {
        if (typeof def === "string")
          return def;
        return formatAbiItem(def);
      })();
      return normalizeSignature(def_);
    };
  }
});

// node_modules/viem/_esm/utils/hash/toSignatureHash.js
function toSignatureHash(fn) {
  return hashSignature(toSignature(fn));
}
var init_toSignatureHash = __esm({
  "node_modules/viem/_esm/utils/hash/toSignatureHash.js"() {
    "use strict";
    init_hashSignature();
    init_toSignature();
  }
});

// node_modules/viem/_esm/utils/hash/toEventSelector.js
var toEventSelector;
var init_toEventSelector = __esm({
  "node_modules/viem/_esm/utils/hash/toEventSelector.js"() {
    "use strict";
    init_toSignatureHash();
    toEventSelector = toSignatureHash;
  }
});

// node_modules/viem/_esm/utils/lru.js
var LruMap;
var init_lru = __esm({
  "node_modules/viem/_esm/utils/lru.js"() {
    "use strict";
    LruMap = class extends Map {
      constructor(size2) {
        super();
        Object.defineProperty(this, "maxSize", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        this.maxSize = size2;
      }
      get(key) {
        const value = super.get(key);
        if (super.has(key)) {
          super.delete(key);
          super.set(key, value);
        }
        return value;
      }
      set(key, value) {
        if (super.has(key))
          super.delete(key);
        super.set(key, value);
        if (this.maxSize && this.size > this.maxSize) {
          const firstKey = super.keys().next().value;
          if (firstKey !== void 0)
            super.delete(firstKey);
        }
        return this;
      }
    };
  }
});

// node_modules/viem/_esm/utils/address/getAddress.js
function checksumAddress(address_, chainId) {
  if (checksumAddressCache.has(`${address_}.${chainId}`))
    return checksumAddressCache.get(`${address_}.${chainId}`);
  const hexAddress = chainId ? `${chainId}${address_.toLowerCase()}` : address_.substring(2).toLowerCase();
  const hash2 = keccak256(stringToBytes(hexAddress), "bytes");
  const address = (chainId ? hexAddress.substring(`${chainId}0x`.length) : hexAddress).split("");
  for (let i = 0; i < 40; i += 2) {
    if (hash2[i >> 1] >> 4 >= 8 && address[i]) {
      address[i] = address[i].toUpperCase();
    }
    if ((hash2[i >> 1] & 15) >= 8 && address[i + 1]) {
      address[i + 1] = address[i + 1].toUpperCase();
    }
  }
  const result = `0x${address.join("")}`;
  checksumAddressCache.set(`${address_}.${chainId}`, result);
  return result;
}
var checksumAddressCache;
var init_getAddress = __esm({
  "node_modules/viem/_esm/utils/address/getAddress.js"() {
    "use strict";
    init_toBytes();
    init_keccak256();
    init_lru();
    checksumAddressCache = /* @__PURE__ */ new LruMap(8192);
  }
});

// node_modules/viem/_esm/utils/data/slice.js
function assertStartOffset(value, start) {
  if (typeof start === "number" && start > 0 && start > size(value) - 1)
    throw new SliceOffsetOutOfBoundsError({
      offset: start,
      position: "start",
      size: size(value)
    });
}
function assertEndOffset(value, start, end) {
  if (typeof start === "number" && typeof end === "number" && size(value) !== end - start) {
    throw new SliceOffsetOutOfBoundsError({
      offset: end,
      position: "end",
      size: size(value)
    });
  }
}
function sliceBytes(value_, start, end, { strict } = {}) {
  assertStartOffset(value_, start);
  const value = value_.slice(start, end);
  if (strict)
    assertEndOffset(value, start, end);
  return value;
}
var init_slice = __esm({
  "node_modules/viem/_esm/utils/data/slice.js"() {
    "use strict";
    init_data();
    init_size();
  }
});

// node_modules/viem/_esm/utils/abi/encodeAbiParameters.js
function getArrayComponents(type) {
  const matches = type.match(/^(.*)\[(\d+)?\]$/);
  return matches ? (
    // Return `null` if the array is dynamic.
    [matches[2] ? Number(matches[2]) : null, matches[1]]
  ) : void 0;
}
var init_encodeAbiParameters = __esm({
  "node_modules/viem/_esm/utils/abi/encodeAbiParameters.js"() {
    "use strict";
  }
});

// node_modules/viem/_esm/errors/cursor.js
var NegativeOffsetError, PositionOutOfBoundsError, RecursiveReadLimitExceededError;
var init_cursor = __esm({
  "node_modules/viem/_esm/errors/cursor.js"() {
    "use strict";
    init_base();
    NegativeOffsetError = class extends BaseError2 {
      constructor({ offset }) {
        super(`Offset \`${offset}\` cannot be negative.`, {
          name: "NegativeOffsetError"
        });
      }
    };
    PositionOutOfBoundsError = class extends BaseError2 {
      constructor({ length, position }) {
        super(`Position \`${position}\` is out of bounds (\`0 < position < ${length}\`).`, { name: "PositionOutOfBoundsError" });
      }
    };
    RecursiveReadLimitExceededError = class extends BaseError2 {
      constructor({ count, limit }) {
        super(`Recursive read limit of \`${limit}\` exceeded (recursive read count: \`${count}\`).`, { name: "RecursiveReadLimitExceededError" });
      }
    };
  }
});

// node_modules/viem/_esm/utils/cursor.js
function createCursor(bytes, { recursiveReadLimit = 8192 } = {}) {
  const cursor = Object.create(staticCursor);
  cursor.bytes = bytes;
  cursor.dataView = new DataView(bytes.buffer ?? bytes, bytes.byteOffset, bytes.byteLength);
  cursor.positionReadCount = /* @__PURE__ */ new Map();
  cursor.recursiveReadLimit = recursiveReadLimit;
  return cursor;
}
var staticCursor;
var init_cursor2 = __esm({
  "node_modules/viem/_esm/utils/cursor.js"() {
    "use strict";
    init_cursor();
    staticCursor = {
      bytes: new Uint8Array(),
      dataView: new DataView(new ArrayBuffer(0)),
      position: 0,
      positionReadCount: /* @__PURE__ */ new Map(),
      recursiveReadCount: 0,
      recursiveReadLimit: Number.POSITIVE_INFINITY,
      assertReadLimit() {
        if (this.recursiveReadCount >= this.recursiveReadLimit)
          throw new RecursiveReadLimitExceededError({
            count: this.recursiveReadCount + 1,
            limit: this.recursiveReadLimit
          });
      },
      assertPosition(position) {
        if (position < 0 || position > this.bytes.length - 1)
          throw new PositionOutOfBoundsError({
            length: this.bytes.length,
            position
          });
      },
      decrementPosition(offset) {
        if (offset < 0)
          throw new NegativeOffsetError({ offset });
        const position = this.position - offset;
        this.assertPosition(position);
        this.position = position;
      },
      getReadCount(position) {
        return this.positionReadCount.get(position || this.position) || 0;
      },
      incrementPosition(offset) {
        if (offset < 0)
          throw new NegativeOffsetError({ offset });
        const position = this.position + offset;
        this.assertPosition(position);
        this.position = position;
      },
      inspectByte(position_) {
        const position = position_ ?? this.position;
        this.assertPosition(position);
        return this.bytes[position];
      },
      inspectBytes(length, position_) {
        const position = position_ ?? this.position;
        this.assertPosition(position + length - 1);
        return this.bytes.subarray(position, position + length);
      },
      inspectUint8(position_) {
        const position = position_ ?? this.position;
        this.assertPosition(position);
        return this.bytes[position];
      },
      inspectUint16(position_) {
        const position = position_ ?? this.position;
        this.assertPosition(position + 1);
        return this.dataView.getUint16(position);
      },
      inspectUint24(position_) {
        const position = position_ ?? this.position;
        this.assertPosition(position + 2);
        return (this.dataView.getUint16(position) << 8) + this.dataView.getUint8(position + 2);
      },
      inspectUint32(position_) {
        const position = position_ ?? this.position;
        this.assertPosition(position + 3);
        return this.dataView.getUint32(position);
      },
      pushByte(byte) {
        this.assertPosition(this.position);
        this.bytes[this.position] = byte;
        this.position++;
      },
      pushBytes(bytes) {
        this.assertPosition(this.position + bytes.length - 1);
        this.bytes.set(bytes, this.position);
        this.position += bytes.length;
      },
      pushUint8(value) {
        this.assertPosition(this.position);
        this.bytes[this.position] = value;
        this.position++;
      },
      pushUint16(value) {
        this.assertPosition(this.position + 1);
        this.dataView.setUint16(this.position, value);
        this.position += 2;
      },
      pushUint24(value) {
        this.assertPosition(this.position + 2);
        this.dataView.setUint16(this.position, value >> 8);
        this.dataView.setUint8(this.position + 2, value & ~4294967040);
        this.position += 3;
      },
      pushUint32(value) {
        this.assertPosition(this.position + 3);
        this.dataView.setUint32(this.position, value);
        this.position += 4;
      },
      readByte() {
        this.assertReadLimit();
        this._touch();
        const value = this.inspectByte();
        this.position++;
        return value;
      },
      readBytes(length, size2) {
        this.assertReadLimit();
        this._touch();
        const value = this.inspectBytes(length);
        this.position += size2 ?? length;
        return value;
      },
      readUint8() {
        this.assertReadLimit();
        this._touch();
        const value = this.inspectUint8();
        this.position += 1;
        return value;
      },
      readUint16() {
        this.assertReadLimit();
        this._touch();
        const value = this.inspectUint16();
        this.position += 2;
        return value;
      },
      readUint24() {
        this.assertReadLimit();
        this._touch();
        const value = this.inspectUint24();
        this.position += 3;
        return value;
      },
      readUint32() {
        this.assertReadLimit();
        this._touch();
        const value = this.inspectUint32();
        this.position += 4;
        return value;
      },
      get remaining() {
        return this.bytes.length - this.position;
      },
      setPosition(position) {
        const oldPosition = this.position;
        this.assertPosition(position);
        this.position = position;
        return () => this.position = oldPosition;
      },
      _touch() {
        if (this.recursiveReadLimit === Number.POSITIVE_INFINITY)
          return;
        const count = this.getReadCount();
        this.positionReadCount.set(this.position, count + 1);
        if (count > 0)
          this.recursiveReadCount++;
      }
    };
  }
});

// node_modules/viem/_esm/utils/encoding/fromBytes.js
function bytesToBigInt(bytes, opts = {}) {
  if (typeof opts.size !== "undefined")
    assertSize(bytes, { size: opts.size });
  const hex = bytesToHex2(bytes, opts);
  return hexToBigInt(hex, opts);
}
function bytesToBool(bytes_, opts = {}) {
  let bytes = bytes_;
  if (typeof opts.size !== "undefined") {
    assertSize(bytes, { size: opts.size });
    bytes = trim(bytes);
  }
  if (bytes.length > 1 || bytes[0] > 1)
    throw new InvalidBytesBooleanError(bytes);
  return Boolean(bytes[0]);
}
function bytesToNumber(bytes, opts = {}) {
  if (typeof opts.size !== "undefined")
    assertSize(bytes, { size: opts.size });
  const hex = bytesToHex2(bytes, opts);
  return hexToNumber(hex, opts);
}
function bytesToString(bytes_, opts = {}) {
  let bytes = bytes_;
  if (typeof opts.size !== "undefined") {
    assertSize(bytes, { size: opts.size });
    bytes = trim(bytes, { dir: "right" });
  }
  return new TextDecoder().decode(bytes);
}
var init_fromBytes = __esm({
  "node_modules/viem/_esm/utils/encoding/fromBytes.js"() {
    "use strict";
    init_encoding();
    init_trim();
    init_fromHex();
    init_toHex();
  }
});

// node_modules/viem/_esm/utils/abi/decodeAbiParameters.js
function decodeAbiParameters(params, data) {
  const bytes = typeof data === "string" ? hexToBytes2(data) : data;
  const cursor = createCursor(bytes);
  if (size(bytes) === 0 && params.length > 0)
    throw new AbiDecodingZeroDataError();
  if (size(data) && size(data) < 32)
    throw new AbiDecodingDataSizeTooSmallError({
      data: typeof data === "string" ? data : bytesToHex2(data),
      params,
      size: size(data)
    });
  let consumed = 0;
  const values = [];
  for (let i = 0; i < params.length; ++i) {
    const param = params[i];
    if (consumed < bytes.length)
      cursor.setPosition(consumed);
    const [data2, consumed_] = decodeParameter(cursor, param, {
      staticPosition: 0
    });
    consumed += consumed_;
    values.push(data2);
  }
  return values;
}
function decodeParameter(cursor, param, { staticPosition }) {
  const arrayComponents = getArrayComponents(param.type);
  if (arrayComponents) {
    const [length, type] = arrayComponents;
    return decodeArray(cursor, { ...param, type }, { length, staticPosition });
  }
  if (param.type === "tuple")
    return decodeTuple(cursor, param, { staticPosition });
  if (param.type === "address")
    return decodeAddress(cursor);
  if (param.type === "bool")
    return decodeBool(cursor);
  if (param.type.startsWith("bytes"))
    return decodeBytes(cursor, param, { staticPosition });
  if (param.type.startsWith("uint") || param.type.startsWith("int"))
    return decodeNumber(cursor, param);
  if (param.type === "string")
    return decodeString(cursor, { staticPosition });
  throw new InvalidAbiDecodingTypeError(param.type, {
    docsPath: "/docs/contract/decodeAbiParameters"
  });
}
function decodeAddress(cursor) {
  const value = cursor.readBytes(32);
  return [checksumAddress(bytesToHex2(sliceBytes(value, -20))), 32];
}
function decodeArray(cursor, param, { length, staticPosition }) {
  if (length === null) {
    const offset = bytesToNumber(cursor.readBytes(sizeOfOffset));
    const start = staticPosition + offset;
    const startOfData = start + sizeOfLength;
    cursor.setPosition(start);
    const length2 = bytesToNumber(cursor.readBytes(sizeOfLength));
    const dynamicChild = hasDynamicChild(param);
    let consumed2 = 0;
    const value2 = [];
    for (let i = 0; i < length2; ++i) {
      cursor.setPosition(startOfData + (dynamicChild ? i * 32 : consumed2));
      const [data, consumed_] = decodeParameter(cursor, param, {
        staticPosition: startOfData
      });
      consumed2 += consumed_;
      value2.push(data);
      if (consumed_ === 0) {
        cursor.assertReadLimit();
        cursor._touch();
      }
    }
    cursor.setPosition(staticPosition + 32);
    return [value2, 32];
  }
  if (hasDynamicChild(param)) {
    const offset = bytesToNumber(cursor.readBytes(sizeOfOffset));
    const start = staticPosition + offset;
    const value2 = [];
    for (let i = 0; i < length; ++i) {
      cursor.setPosition(start + i * 32);
      const [data] = decodeParameter(cursor, param, {
        staticPosition: start
      });
      value2.push(data);
    }
    cursor.setPosition(staticPosition + 32);
    return [value2, 32];
  }
  let consumed = 0;
  const value = [];
  for (let i = 0; i < length; ++i) {
    const [data, consumed_] = decodeParameter(cursor, param, {
      staticPosition: staticPosition + consumed
    });
    consumed += consumed_;
    value.push(data);
    if (consumed_ === 0) {
      cursor.assertReadLimit();
      cursor._touch();
    }
  }
  return [value, consumed];
}
function decodeBool(cursor) {
  return [bytesToBool(cursor.readBytes(32), { size: 32 }), 32];
}
function decodeBytes(cursor, param, { staticPosition }) {
  const [_, size2] = param.type.split("bytes");
  if (!size2) {
    const offset = bytesToNumber(cursor.readBytes(32));
    cursor.setPosition(staticPosition + offset);
    const length = bytesToNumber(cursor.readBytes(32));
    if (length === 0) {
      cursor.setPosition(staticPosition + 32);
      return ["0x", 32];
    }
    const data = cursor.readBytes(length);
    cursor.setPosition(staticPosition + 32);
    return [bytesToHex2(data), 32];
  }
  const value = bytesToHex2(cursor.readBytes(Number.parseInt(size2, 10), 32));
  return [value, 32];
}
function decodeNumber(cursor, param) {
  const signed = param.type.startsWith("int");
  const size2 = Number.parseInt(param.type.split("int")[1] || "256", 10);
  const value = cursor.readBytes(32);
  return [
    size2 > 48 ? bytesToBigInt(value, { signed }) : bytesToNumber(value, { signed }),
    32
  ];
}
function decodeTuple(cursor, param, { staticPosition }) {
  const hasUnnamedChild = param.components.length === 0 || param.components.some(({ name }) => !name);
  const value = hasUnnamedChild ? [] : {};
  let consumed = 0;
  if (hasDynamicChild(param)) {
    const offset = bytesToNumber(cursor.readBytes(sizeOfOffset));
    const start = staticPosition + offset;
    for (let i = 0; i < param.components.length; ++i) {
      const component = param.components[i];
      cursor.setPosition(start + consumed);
      const [data, consumed_] = decodeParameter(cursor, component, {
        staticPosition: start
      });
      consumed += consumed_;
      value[hasUnnamedChild ? i : component?.name] = data;
    }
    cursor.setPosition(staticPosition + 32);
    return [value, 32];
  }
  for (let i = 0; i < param.components.length; ++i) {
    const component = param.components[i];
    const [data, consumed_] = decodeParameter(cursor, component, {
      staticPosition
    });
    value[hasUnnamedChild ? i : component?.name] = data;
    consumed += consumed_;
  }
  return [value, consumed];
}
function decodeString(cursor, { staticPosition }) {
  const offset = bytesToNumber(cursor.readBytes(32));
  const start = staticPosition + offset;
  cursor.setPosition(start);
  const length = bytesToNumber(cursor.readBytes(32));
  if (length === 0) {
    cursor.setPosition(staticPosition + 32);
    return ["", 32];
  }
  const data = cursor.readBytes(length, 32);
  const value = bytesToString(trim(data));
  cursor.setPosition(staticPosition + 32);
  return [value, 32];
}
function hasDynamicChild(param) {
  const { type } = param;
  if (type === "string")
    return true;
  if (type === "bytes")
    return true;
  if (type.endsWith("[]"))
    return true;
  if (type === "tuple")
    return param.components?.some(hasDynamicChild);
  const arrayComponents = getArrayComponents(param.type);
  if (arrayComponents && hasDynamicChild({ ...param, type: arrayComponents[1] }))
    return true;
  return false;
}
var sizeOfLength, sizeOfOffset;
var init_decodeAbiParameters = __esm({
  "node_modules/viem/_esm/utils/abi/decodeAbiParameters.js"() {
    "use strict";
    init_abi();
    init_getAddress();
    init_cursor2();
    init_size();
    init_slice();
    init_trim();
    init_fromBytes();
    init_toBytes();
    init_toHex();
    init_encodeAbiParameters();
    sizeOfLength = 32;
    sizeOfOffset = 32;
  }
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

// src/core/index.ts
init_crypto();

// node_modules/viem/_esm/index.js
init_exports();

// node_modules/viem/_esm/utils/abi/decodeEventLog.js
init_abi();
init_cursor();
init_size();
init_toEventSelector();
init_decodeAbiParameters();
init_formatAbiItem2();
var docsPath = "/docs/contract/decodeEventLog";
function decodeEventLog(parameters) {
  const { abi, data, strict: strict_, topics } = parameters;
  const strict = strict_ ?? true;
  const [signature, ...argTopics] = topics;
  if (!signature)
    throw new AbiEventSignatureEmptyTopicsError({ docsPath });
  const abiItem = abi.find((x) => x.type === "event" && signature === toEventSelector(formatAbiItem2(x)));
  if (!(abiItem && "name" in abiItem) || abiItem.type !== "event")
    throw new AbiEventSignatureNotFoundError(signature, { docsPath });
  const { name, inputs } = abiItem;
  const isUnnamed = inputs?.some((x) => !("name" in x && x.name));
  const args = isUnnamed ? [] : {};
  const indexedInputs = inputs.map((x, i) => [x, i]).filter(([x]) => "indexed" in x && x.indexed);
  const missingIndexedInputs = [];
  for (let i = 0; i < indexedInputs.length; i++) {
    const [param, argIndex] = indexedInputs[i];
    const topic = argTopics[i];
    if (!topic) {
      if (strict)
        throw new DecodeLogTopicsMismatch({
          abiItem,
          param
        });
      missingIndexedInputs.push([param, argIndex]);
      continue;
    }
    args[isUnnamed ? argIndex : param.name || argIndex] = decodeTopic({
      param,
      value: topic
    });
  }
  const nonIndexedInputs = inputs.filter((x) => !("indexed" in x && x.indexed));
  const inputsToDecode = strict ? nonIndexedInputs : [...missingIndexedInputs.map(([param]) => param), ...nonIndexedInputs];
  if (inputsToDecode.length > 0) {
    if (data && data !== "0x") {
      try {
        const decodedData = decodeAbiParameters(inputsToDecode, data);
        if (decodedData) {
          let dataIndex = 0;
          if (!strict) {
            for (const [param, argIndex] of missingIndexedInputs) {
              args[isUnnamed ? argIndex : param.name || argIndex] = decodedData[dataIndex++];
            }
          }
          if (isUnnamed) {
            for (let i = 0; i < inputs.length; i++)
              if (args[i] === void 0 && dataIndex < decodedData.length)
                args[i] = decodedData[dataIndex++];
          } else
            for (let i = 0; i < nonIndexedInputs.length; i++)
              args[nonIndexedInputs[i].name] = decodedData[dataIndex++];
        }
      } catch (err) {
        if (strict) {
          if (err instanceof AbiDecodingDataSizeTooSmallError || err instanceof PositionOutOfBoundsError)
            throw new DecodeLogDataMismatch({
              abiItem,
              data,
              params: inputsToDecode,
              size: size(data)
            });
          throw err;
        }
      }
    } else if (strict) {
      throw new DecodeLogDataMismatch({
        abiItem,
        data: "0x",
        params: inputsToDecode,
        size: 0
      });
    }
  }
  return {
    eventName: name,
    args: Object.values(args).length > 0 ? args : void 0
  };
}
function decodeTopic({ param, value }) {
  if (param.type === "string" || param.type === "bytes" || param.type === "tuple" || param.type.match(/^(.*)\[(\d+)?\]$/))
    return value;
  const decodedArg = decodeAbiParameters([param], value) || [];
  return decodedArg[0];
}

// node_modules/viem/_esm/utils/hash/toEventHash.js
init_toSignatureHash();

// node_modules/viem/_esm/index.js
init_fromHex();
init_toHex();

// src/events/events.ts
var TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
);
var AGENT_REGISTERED_EVENT = parseAbiItem(
  "event AgentRegistered(uint256 indexed agentId, address indexed creator, string tokenURI)"
);
var PLAN_CREATED_EVENT = parseAbiItem(
  "event PlanCreated(uint256 indexed planId, uint256 indexed agentId, uint256 price, string period, address payToken, uint256 trialDays)"
);
var SUBSCRIBED_EVENT = parseAbiItem(
  "event Subscribed(uint256 indexed subscriptionId, address indexed subscriber, uint256 indexed agentId, uint256 expiresAt)"
);
var EVENT_ABI = {
  Transfer: TRANSFER_EVENT,
  AgentRegistered: AGENT_REGISTERED_EVENT,
  PlanCreated: PLAN_CREATED_EVENT,
  Subscribed: SUBSCRIBED_EVENT
};
var CONTRACT_EVENTS = {
  identityRegistryAddress: ["Transfer", "AgentRegistered"],
  subscriptionManagerAddress: ["PlanCreated", "Subscribed"]
};
function subscribeToEvents(publicClient, options) {
  const unwatchAll = [];
  const contracts = [
    { address: options.identityRegistryAddress, events: CONTRACT_EVENTS.identityRegistryAddress },
    { address: options.subscriptionManagerAddress, events: CONTRACT_EVENTS.subscriptionManagerAddress }
  ];
  for (const { address, events } of contracts) {
    if (!address) continue;
    for (const eventName of events) {
      if (!options.events.includes(eventName)) continue;
      unwatchAll.push(
        publicClient.watchContractEvent({
          address,
          abi: [EVENT_ABI[eventName]],
          eventName,
          fromBlock: options.fromBlock !== void 0 ? BigInt(options.fromBlock) : void 0,
          pollingInterval: options.pollingInterval,
          onLogs: (logs) => {
            for (const log of logs) {
              options.onEvent({
                type: eventName,
                args: log.args,
                txHash: log.transactionHash
              });
            }
          }
        })
      );
    }
  }
  return Promise.resolve(() => {
    for (const unwatch of unwatchAll) unwatch();
  });
}

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

// src/agent-loop/context-compactor.ts
var ContextCompactor = class {
  constructor(llmProvider, compactModel = "gpt-4o-mini") {
    this.llmProvider = llmProvider;
    this.compactModel = compactModel;
  }
  llmProvider;
  compactModel;
  /** Rough token estimation: 1 token ≈ 4 characters */
  estimateTokens(messages) {
    let total = 0;
    for (const msg of messages) {
      total += JSON.stringify(msg).length;
    }
    return Math.ceil(total / 4);
  }
  /**
   * Compact messages: keep system prompt + last 2 turns, summarize the rest.
   * Returns original array if not enough messages or compaction fails.
   */
  async compact(messages) {
    if (messages.length <= 5) return messages;
    const system = messages.filter((m) => m.role === "system");
    const nonSystem = messages.filter((m) => m.role !== "system");
    const keepCount = Math.min(4, nonSystem.length);
    const keepMessages = nonSystem.slice(-keepCount);
    const compactTarget = nonSystem.slice(0, nonSystem.length - keepCount);
    if (compactTarget.length === 0) return messages;
    try {
      const stream = this.llmProvider.chatStream({
        model: this.compactModel,
        messages: [{
          role: "user",
          content: `Summarize concisely (keep all facts/decisions):
${compactTarget.map((m) => `${m.role}: ${m.content}`).join("\n")}`
        }],
        maxTokens: 500,
        temperature: 0.3
      });
      let summary = "";
      for await (const event of stream) {
        if (event.type === "text_delta") summary += event.content;
      }
      return [...system, { role: "system", content: `[Summary]: ${summary}` }, ...keepMessages];
    } catch {
      return messages;
    }
  }
};

// src/agent-loop/fact-extractor.ts
var FactExtractor = class {
  constructor(llmProvider, factModel = "gpt-4o-mini") {
    this.llmProvider = llmProvider;
    this.factModel = factModel;
  }
  llmProvider;
  factModel;
  /** Extract simple facts from the conversation for memory storage */
  async extract(userMessage, assistantResponse) {
    try {
      const stream = this.llmProvider.chatStream({
        model: this.factModel,
        messages: [{
          role: "user",
          content: `Extract 1-3 key facts/preferences. One per line, <100 chars each. No other text.
User: ${userMessage}
Assistant: ${assistantResponse.slice(0, 500)}
Facts:`
        }],
        maxTokens: 200,
        temperature: 0.3
      });
      let text = "";
      for await (const event of stream) {
        if (event.type === "text_delta") text += event.content;
      }
      return text.split("\n").map((s) => s.replace(/^[\d\-•. ]+/, "").trim()).filter(Boolean);
    } catch {
      return [];
    }
  }
};

// src/agent-loop/trace-emitter.ts
var LoopTraceEmitter = class {
  config;
  constructor(config) {
    this.config = config;
  }
  emit(event) {
    if (!this.config?.enabled) return;
    try {
      this.config.emitter.emit({ ...event, timestamp: Date.now() });
    } catch {
    }
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
  sessionId = "";
  compactor;
  factExtractor;
  tracer;
  constructor(config) {
    this.config = {
      ...config,
      maxIterations: config.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS
    };
    this.executor = new ToolExecutor({ skills: config.ctx.skills });
    this.tools = buildTools(config.ctx.skills);
    this.systemPrompt = buildSystemPrompt(config.ctx.prompt, config.ctx.skills);
    this.compactor = new ContextCompactor(
      config.llmProvider,
      config.compactModel
    );
    this.factExtractor = new FactExtractor(
      config.llmProvider,
      config.factExtractionModel
    );
    this.tracer = new LoopTraceEmitter(config.trace);
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
    let messages = [
      { role: "system", content: this.systemPrompt },
      ...history.map((m) => ({
        role: m.role,
        content: m.content
      })),
      { role: "user", content: userMessage }
    ];
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.sessionId = sessionId;
    await this.recallMemory(messages, userMessage);
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
        if (this.config.contextBudget && this.compactor.estimateTokens(messages) > this.config.contextBudget) {
          messages = await this.compactor.compact(messages);
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
    await this.storeMemory(userMessage, result.finalText);
    this.tracer.emit({
      tenantId: this.config.ctx.subscriberAddress || "unknown",
      agentId: this.config.ctx.agentId,
      sessionId: this.sessionId,
      type: "session_complete",
      data: {
        totalIterations: iterations,
        totalDuration: Date.now() - startTime,
        totalTokens: totalUsage.totalTokens,
        toolCallCount: toolCalls.length
      }
    });
    if (this.config.onComplete) {
      this.config.onComplete(result);
    }
    return result;
  }
  // ── Private: Memory ─────────────────────────────────────────────────────
  async recallMemory(messages, userMessage) {
    if (!this.config.memory?.enabled || !this.config.ctx.subscriberAddress || !this.config.ctx.agentId) return;
    try {
      const facts = await this.config.memory.provider.recall({
        subscriberAddress: this.config.ctx.subscriberAddress,
        agentId: this.config.ctx.agentId,
        query: userMessage,
        limit: this.config.memory.recallLimit ?? 5
      });
      if (facts.length > 0 && messages[0]) {
        const memoryContext = "\n\n## Relevant Memory\n" + facts.map((f) => `- ${f.fact}`).join("\n");
        messages[0].content = (messages[0].content || "") + memoryContext;
      }
    } catch (err) {
      console.warn("[AgentLoop] Memory recall failed:", err.message);
    }
  }
  async storeMemory(userMessage, assistantResponse) {
    if (!this.config.memory?.enabled || this.config.memory.storeOnSessionEnd === false || !this.config.ctx.subscriberAddress || !this.config.ctx.agentId) return;
    try {
      const facts = await this.factExtractor.extract(userMessage, assistantResponse);
      for (const fact of facts) {
        await this.config.memory.provider.store({
          subscriberAddress: this.config.ctx.subscriberAddress,
          agentId: this.config.ctx.agentId,
          fact
        });
      }
    } catch (err) {
      console.warn("[AgentLoop] Memory store failed:", err.message);
    }
  }
  // ── Private: Iteration ──────────────────────────────────────────────────
  async runIteration(messages) {
    const model = this.config.ctx.model ?? this.config.llmProvider.model ?? DEFAULT_MODEL;
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
        this.tracer.emit({
          tenantId: this.config.ctx.subscriberAddress || "unknown",
          agentId: this.config.ctx.agentId,
          sessionId: this.sessionId,
          type: "tool_call",
          data: { callId: ptc.callId, name: ptc.name, arguments: ptc.arguments }
        });
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
      this.tracer.emit({
        tenantId: this.config.ctx.subscriberAddress || "unknown",
        agentId: this.config.ctx.agentId,
        sessionId: this.sessionId,
        type: "tool_result",
        data: { callId: record.callId, name: record.name, error: record.error, durationMs: record.durationMs }
      });
    }
    return { text, toolCalls: llmToolCalls, toolCallRecords, usage };
  }
};

// src/agent-loop/platform-tools/definitions.ts
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

// src/agent-loop/platform-tools/executor.ts
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

// src/agent-loop/a2a-daemon.ts
import { EventEmitter } from "events";
var A2ADaemon = class extends EventEmitter {
  config;
  timer = null;
  isRunning = false;
  processedTasks = /* @__PURE__ */ new Set();
  constructor(config) {
    super();
    this.config = {
      agentId: config.agentId,
      a2a: config.a2a,
      gatewayUrl: config.gatewayUrl,
      pollIntervalMs: config.pollIntervalMs ?? 15e3,
      autoComplete: config.autoComplete ?? true,
      maxPerPoll: config.maxPerPoll ?? 3
    };
  }
  // ── Lifecycle ────────────────────────────────────────────────────────────
  start() {
    if (this.timer) return;
    console.log(`[A2A Daemon] Starting for agent #${this.config.agentId}, poll: ${this.config.pollIntervalMs}ms`);
    this.timer = setInterval(() => this.poll(), this.config.pollIntervalMs);
    this.poll();
  }
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log(`[A2A Daemon] Stopped for agent #${this.config.agentId}`);
    }
  }
  get status() {
    return {
      running: this.timer !== null,
      agentId: this.config.agentId,
      processedCount: this.processedTasks.size
    };
  }
  // ── Core Logic ───────────────────────────────────────────────────────────
  async poll() {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      const pendingTasks = await this.getPendingTasks();
      if (pendingTasks.length === 0) {
        this.isRunning = false;
        return;
      }
      console.log(`[A2A Daemon] Found ${pendingTasks.length} pending task(s) for agent #${this.config.agentId}`);
      let processed = 0;
      for (const task of pendingTasks) {
        if (processed >= this.config.maxPerPoll) break;
        try {
          const result = await this.processPendingTask(task);
          processed++;
          if (result.completed) {
            this.processedTasks.add(task.taskId);
            this.emit("taskCompleted", result);
            console.log(`[A2A Daemon] Task #${task.taskId} completed, tx: ${result.txHash?.slice(0, 10)}...`);
          } else if (result.error) {
            this.emit("taskFailed", result);
            console.warn(`[A2A Daemon] Task #${task.taskId} failed: ${result.error}`);
          }
        } catch (err) {
          console.error(`[A2A Daemon] Error processing task #${task.taskId}:`, err.message);
        }
      }
    } catch (err) {
      console.error("[A2A Daemon] Poll error:", err.message);
    } finally {
      this.isRunning = false;
    }
  }
  /**
   * Get pending tasks assigned to this agent using getAgentTasks() from the contract.
   */
  async getPendingTasks() {
    try {
      const allTasks = await this.config.a2a.getAgentTasks(this.config.agentId);
      return allTasks.filter(
        (t) => (t.status === "created" || t.status === "accepted") && !this.processedTasks.has(t.taskId)
      );
    } catch (err) {
      console.warn("[A2A Daemon] Failed to fetch pending tasks:", err.message);
      return [];
    }
  }
  /**
   * Process a pending A2A task:
   *   1. Try Gateway API for pre-computed LLM result
   *   2. Call completeTask() on-chain with the owner's wallet
   */
  async processPendingTask(task) {
    let gatewayOutput;
    if (this.config.gatewayUrl) {
      try {
        const res = await fetch(
          `${this.config.gatewayUrl}/api/v1/a2a/task-result/${task.taskId}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.status === 2 && data.output_data) {
            gatewayOutput = data.output_data;
            console.log(`[A2A Daemon] Got result for task #${task.taskId} from Gateway`);
          }
        }
      } catch (err) {
        console.warn(`[A2A Daemon] Gateway unavailable for task #${task.taskId}:`, err.message);
      }
    }
    const outputContent = gatewayOutput || `Task processed. Type: ${task.taskType}. Input: ${task.input}`;
    if (this.config.autoComplete) {
      try {
        const txHash = await this.config.a2a.completeTask(
          task.taskId,
          outputContent,
          3
          // completed
        );
        return { task, gatewayOutput, completed: true, txHash };
      } catch (err) {
        return { task, gatewayOutput, completed: false, error: err.message };
      }
    }
    return { task, gatewayOutput, completed: false };
  }
};

// src/llm/openai-provider.ts
var DEFAULT_ENDPOINT = "https://api.openai.com/v1";
var OpenAIProvider = class {
  config;
  /** Model the provider is configured with (used by AgentLoop when no explicit ctx.model) */
  get model() {
    return this.config.model;
  }
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
  /** Model the provider is configured with (used by AgentLoop when no explicit ctx.model) */
  get model() {
    return this.config.model;
  }
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
  },
  totalAgents: {
    inputs: [],
    name: "totalAgents",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  getAgentOwner: {
    inputs: [{ name: "agentId", type: "uint256" }],
    name: "getAgentOwner",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  }
};
var ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
function decodeBase64(b64) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(b64, "base64").toString("utf-8");
  }
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function parseTokenURIJSON(tokenURI) {
  if (!tokenURI || tokenURI.startsWith("ipfs://")) return null;
  const match = tokenURI.match(/^data:application\/json;base64,(.+)$/i);
  if (!match) return null;
  let b64 = match[1];
  const lastDoubleEq = b64.lastIndexOf("==");
  if (lastDoubleEq > 0 && lastDoubleEq < b64.length - 2) {
    b64 = b64.substring(0, lastDoubleEq + 2);
  }
  try {
    const decoded = decodeBase64(b64);
    try {
      return JSON.parse(decoded);
    } catch {
      let fixed = decoded;
      const quoteCount = (fixed.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) fixed += '"';
      const openBraces = (fixed.match(/\{/g) || []).length;
      const closeBraces = (fixed.match(/\}/g) || []).length;
      for (let i = closeBraces; i < openBraces; i++) fixed += "}";
      try {
        return JSON.parse(fixed);
      } catch {
      }
    }
    const nameM = decoded.match(/"name"\s*:\s*"([^"]*)/);
    if (nameM) return { name: nameM[1] };
    return null;
  } catch {
    return null;
  }
}
function parseCreatedAt(parsed) {
  const v = parsed?.created_at ?? parsed?.createdAt;
  if (typeof v === "number") return Math.floor(v);
  if (typeof v === "string") {
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return Math.floor(t / 1e3);
  }
  return 0;
}
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
    const hash2 = await this.walletClient.writeContract(request);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: hash2 });
    const agentId = this._parseAgentIdFromReceipt(receipt);
    return { agentId, txHash: hash2 };
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
    const hash2 = await this.walletClient.writeContract(request);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: hash2 });
    const agentId = this._parseAgentIdFromReceipt(receipt);
    return { agentId, txHash: hash2 };
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
  /** Total number of registered agents (monotonic max agent ID). */
  async totalAgents() {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: [IDENTITY_REGISTRY_ABI.totalAgents],
      functionName: "totalAgents"
    });
    return Number(result);
  }
  /**
   * Structured metadata for one agent.
   * Combines on-chain attributes (encryptedPayloadCid / eciesEncryptedKey /
   * publicPayloadCid) with the tokenURI JSON (name/description/capabilities/skills).
   * `isActive` defaults to on-chain existence, overridable via tokenURI JSON.
   */
  async getAgentMetadata(agentId) {
    const attrs = await this.getAttributes(agentId);
    const parsed = parseTokenURIJSON(await this.tokenURI(agentId));
    const str2 = (v) => typeof v === "string" ? v : "";
    const arr = (v) => Array.isArray(v) ? v.map(String) : [];
    const caps = arr(parsed?.capabilities);
    const skills = arr(parsed?.skills);
    return {
      name: str2(parsed?.name) || str2(attrs.name) || `Agent ${agentId}`,
      description: str2(parsed?.description) || str2(attrs.description),
      encryptedPayloadCid: str2(attrs.encryptedPayloadCid),
      eciesEncryptedKey: str2(attrs.eciesEncryptedKey),
      publicPayloadCid: str2(attrs.publicPayloadCid),
      capabilities: caps.length ? caps : arr(attrs.capabilities),
      skills: skills.length ? skills : arr(attrs.skills),
      isActive: typeof parsed?.isActive === "boolean" ? parsed.isActive : typeof parsed?.is_active === "boolean" ? parsed.is_active : await this.agentExists(agentId)
    };
  }
  /**
   * Batch-read all agents in a contiguous ID range with optional filters.
   * Replaces the manual binary-search + per-ID ownerOf loop used by chain-sync.
   */
  async getAllAgents(options = {}) {
    const { fromId = 1, batchSize = 10, activeOnly = false, capabilities } = options;
    const toId = options.toId ?? await this.totalAgents();
    if (toId < fromId || toId <= 0) return [];
    const agents = [];
    for (let start = fromId; start <= toId; start += batchSize) {
      const end = Math.min(start + batchSize - 1, toId);
      const ids = [];
      for (let id = start; id <= end; id++) ids.push(id);
      const results = await Promise.all(
        ids.map(async (agentId) => {
          try {
            const [owner, tokenURI] = await Promise.all([
              this.publicClient.readContract({
                address: this.address,
                abi: [IDENTITY_REGISTRY_ABI.getAgentOwner],
                functionName: "getAgentOwner",
                args: [BigInt(agentId)]
              }),
              this.tokenURI(agentId)
            ]);
            if (!owner || owner === ZERO_ADDRESS || !tokenURI) return null;
            const parsed = parseTokenURIJSON(tokenURI);
            const metadata = {
              name: parsed?.name || `Agent ${agentId}`,
              description: parsed?.description || "",
              capabilities: Array.isArray(parsed?.capabilities) ? parsed.capabilities.map(String) : [],
              skills: Array.isArray(parsed?.skills) ? parsed.skills.map(String) : [],
              isActive: typeof parsed?.isActive === "boolean" ? parsed.isActive : typeof parsed?.is_active === "boolean" ? parsed.is_active : true
            };
            if (activeOnly && !metadata.isActive) return null;
            if (capabilities?.length && !capabilities.every((c) => metadata.capabilities.includes(c))) return null;
            return { agentId, owner, tokenURI, metadata, createdAt: parseCreatedAt(parsed) };
          } catch {
            return null;
          }
        })
      );
      for (const r of results) {
        if (r) agents.push(r);
      }
    }
    return agents;
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
var ZERO_ADDRESS2 = "0x0000000000000000000000000000000000000000";
var PLAN_CREATED_EVENT2 = parseAbiItem(
  "event PlanCreated(uint256 indexed planId, uint256 indexed agentId, uint256 price, string period, address payToken, uint256 trialDays)"
);
var SUBSCRIBED_EVENT2 = parseAbiItem(
  "event Subscribed(uint256 indexed subscriptionId, address indexed subscriber, uint256 indexed agentId, uint256 expiresAt)"
);
var PLAN_CREATED_TOPIC = toSignatureHash(PLAN_CREATED_EVENT2);
var SUBSCRIBED_TOPIC = toSignatureHash(SUBSCRIBED_EVENT2);
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
    // Contract returns `SubscriptionPlan memory` (struct → dynamic tuple encoding).
    outputs: [{
      type: "tuple",
      components: [
        { name: "planId", type: "uint256" },
        { name: "agentId", type: "uint256" },
        { name: "creator", type: "address" },
        { name: "price", type: "uint256" },
        { name: "period", type: "string" },
        { name: "active", type: "bool" },
        { name: "payToken", type: "address" },
        { name: "trialDays", type: "uint256" }
      ]
    }],
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
var SUBSCRIPTION_STATUS_NAMES = {
  0: "pending",
  1: "active",
  2: "expired",
  3: "cancelled"
};
var SUBSCRIPTION_PERIODS = ["day", "week", "month", "year"];
var SubscriptionManager = class {
  address;
  publicClient;
  walletClient;
  constructor(config) {
    this.address = config.contractAddress;
    this.publicClient = config.publicClient;
    this.walletClient = config.walletClient;
  }
  /**
   * Resolve the caller account for write operations.
   *
   * Prefers `walletClient.account` (a full viem Account object with signing
   * capability) over `getAddresses()[0]` (a bare address string). Passing a
   * bare string as `account` makes viem route `writeContract` through
   * `eth_sendTransaction` (node-managed accounts only), which fails for local
   * signers; the full object enables local signing via `eth_sendRawTransaction`.
   * In browser wallets (e.g. MetaMask) `client.account` is a json-rpc account
   * and the provider signs, so both paths keep working.
   */
  async _resolveAccount() {
    const clientAccount = this.walletClient.account;
    if (clientAccount) return clientAccount;
    const [address] = await this.walletClient.getAddresses();
    if (!address) throw new Error("Wallet not connected");
    return address;
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
    const r = result;
    return {
      planId: Number(r.planId),
      agentId: Number(r.agentId),
      creator: r.creator,
      price: r.price,
      period: r.period,
      active: r.active,
      payToken: r.payToken,
      trialDays: Number(r.trialDays)
    };
  }
  // ── Plans ────────────────────────────────────────────────────────────────
  /**
   * Create a subscription plan for an agent.
   *
   * @param params.period  Must be 'day' | 'week' | 'month' | 'year' — the only
   *                       values the contract maps to real durations. Anything
   *                       else silently becomes 30 days on-chain.
   * @returns              { planId, txHash } (planId parsed from PlanCreated event)
   */
  async createPlan(params) {
    const { agentId, price, period, payToken = ZERO_ADDRESS2, trialDays = 0 } = params;
    if (!SUBSCRIPTION_PERIODS.includes(period)) {
      throw new Error(
        `Invalid period "${period}". Must be one of: ${SUBSCRIPTION_PERIODS.join(", ")}`
      );
    }
    if (trialDays < 0 || trialDays > 30) {
      throw new Error("trialDays must be between 0 and 30");
    }
    const account = await this._resolveAccount();
    const { request } = await this.publicClient.simulateContract({
      account,
      address: this.address,
      abi: [SUBSCRIPTION_ABI_V2.createPlan],
      functionName: "createPlan",
      args: [BigInt(agentId), price, period, payToken, BigInt(trialDays)]
    });
    const hash2 = await this.walletClient.writeContract({ ...request, account });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: hash2 });
    return { planId: this._parsePlanIdFromReceipt(receipt), txHash: hash2 };
  }
  /**
   * Subscribe to a plan.
   * For ETH plans: pass valueWei = plan.price.
   * For ERC20 plans: auto-detects from plan.payToken, calls approve + subscribe.
   *                    User must have approved this contract for plan.price tokens.
   *
   * @returns SubscribeResult — subscriptionId/expiresAt/subscriber parsed from
   *          the Subscribed event (no longer hardcoded to 0).
   */
  async subscribe(planId, opts) {
    const account = await this._resolveAccount();
    const plan = await this.getPlan(planId);
    if (!plan.active) throw new Error("Plan not active");
    if (plan.payToken === ZERO_ADDRESS2) {
      const value = opts?.valueWei ?? plan.price;
      const { request } = await this.publicClient.simulateContract({
        account,
        address: this.address,
        abi: [SUBSCRIPTION_ABI_V2.subscribe],
        functionName: "subscribe",
        args: [BigInt(planId)],
        value
      });
      const hash2 = await this.walletClient.writeContract({ ...request, account });
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: hash2 });
      return { txHash: hash2, ...this._parseSubscribedFromReceipt(receipt) };
    } else {
      const accountAddress = typeof account === "string" ? account : account.address;
      if (opts?.approveTokenFirst !== false) {
        const allowance = await this.publicClient.readContract({
          address: plan.payToken,
          abi: [ERC20_ABI.allowance],
          functionName: "allowance",
          args: [accountAddress, this.address]
        });
        if (allowance < plan.price) {
          const { request: approveReq } = await this.publicClient.simulateContract({
            account,
            address: plan.payToken,
            abi: [ERC20_ABI.approve],
            functionName: "approve",
            args: [this.address, plan.price]
          });
          await this.walletClient.writeContract({ ...approveReq, account });
        }
      }
      const { request } = await this.publicClient.simulateContract({
        account,
        address: this.address,
        abi: [SUBSCRIPTION_ABI_V2.subscribe],
        functionName: "subscribe",
        args: [BigInt(planId)]
      });
      const hash2 = await this.walletClient.writeContract({ ...request, account });
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: hash2 });
      return { txHash: hash2, ...this._parseSubscribedFromReceipt(receipt) };
    }
  }
  /**
   * One-step createPlan + subscribe (two transactions).
   * Saves the caller one round of plan lookup when the plan does not exist yet.
   */
  async createPlanAndSubscribe(params) {
    const { planId } = await this.createPlan(params);
    const subscribed = await this.subscribe(planId);
    return { planId, ...subscribed };
  }
  /** Release escrowed funds to creator after trial window ends. */
  async releaseFunds(subscriptionId) {
    const account = await this._resolveAccount();
    const { request } = await this.publicClient.simulateContract({
      account,
      address: this.address,
      abi: [SUBSCRIPTION_ABI_V2.releaseFunds],
      functionName: "releaseFunds",
      args: [BigInt(subscriptionId)]
    });
    return this.walletClient.writeContract({ ...request, account });
  }
  /** Cancel subscription (trial refund if within window). */
  async cancel(subscriptionId) {
    const account = await this._resolveAccount();
    const { request } = await this.publicClient.simulateContract({
      account,
      address: this.address,
      abi: [SUBSCRIPTION_ABI_V2.cancelSubscription],
      functionName: "cancelSubscription",
      args: [BigInt(subscriptionId)]
    });
    return this.walletClient.writeContract({ ...request, account });
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
      status: SUBSCRIPTION_STATUS_NAMES[status] ?? "pending",
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
  // ── Receipt parsing (event-driven, no hardcoded IDs) ─────────────────────
  _findEventLog(receipt, topic) {
    return receipt.logs.find((l) => l.topics?.[0] === topic);
  }
  /** Parse planId from the PlanCreated event in a transaction receipt. */
  _parsePlanIdFromReceipt(receipt) {
    const log = this._findEventLog(receipt, PLAN_CREATED_TOPIC);
    if (!log) {
      throw new Error("PlanCreated event not found in transaction receipt");
    }
    const decoded = decodeEventLog({
      abi: [PLAN_CREATED_EVENT2],
      data: log.data,
      topics: log.topics
    });
    return Number(decoded.args.planId);
  }
  /** Parse subscriptionId/subscriber/agentId/expiresAt from the Subscribed event. */
  _parseSubscribedFromReceipt(receipt) {
    const log = this._findEventLog(receipt, SUBSCRIBED_TOPIC);
    if (!log) {
      throw new Error("Subscribed event not found in transaction receipt");
    }
    const decoded = decodeEventLog({
      abi: [SUBSCRIBED_EVENT2],
      data: log.data,
      topics: log.topics
    });
    return {
      subscriptionId: Number(decoded.args.subscriptionId),
      subscriber: decoded.args.subscriber,
      agentId: Number(decoded.args.agentId),
      expiresAt: Number(decoded.args.expiresAt)
    };
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
    const hash2 = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: hash2 });
    const subIdHex = receipt.logs[0]?.topics?.[1];
    if (!subIdHex || subIdHex === "0x") {
      throw new Error("Failed to parse subscriptionId from Subscribed event");
    }
    return Number(BigInt(subIdHex));
  }
};

// src/subscription/index.ts
var SUBSCRIPTION_VERSION = "0.3.0";

// src/payment/payments.ts
var PERIODS = ["day", "week", "month", "year"];
var SubscriptionPayments = class {
  constructor(config) {
    this.config = config;
  }
  config;
  // ── Public API ──────────────────────────────────────────────────────────
  /** Pay for (or renew) a subscription using the chosen rail. */
  async pay(input) {
    switch (input.method) {
      case "chain":
        return this._payChain(input);
      case "fiat":
        return this._payFiat(input);
      case "x402":
        return this._payX402(input);
    }
  }
  /**
   * Unified access check across all rails (chain OR fiat/x402) via the Gateway
   * `/api/v1/chain/check-subscription` endpoint (which already merges them).
   */
  async hasAccess(agentId, subscriber) {
    if (!this.config.gatewayUrl) {
      throw new Error("hasAccess() requires a gatewayUrl");
    }
    const params = new URLSearchParams({
      chain: this.config.chain ?? "oxachain",
      subscriber,
      agentId: String(agentId)
    });
    const data = await this._fetchJson(`/api/v1/chain/check-subscription?${params}`);
    return data.active === true;
  }
  /** x402 protocol discovery (price / pay-to wallet / network). */
  async fetchX402Info() {
    if (!this.config.gatewayUrl) {
      throw new Error("fetchX402Info() requires a gatewayUrl");
    }
    return this._fetchJson("/api/v1/x402/info");
  }
  // ── Rails ───────────────────────────────────────────────────────────────
  async _payChain(input) {
    const sm = this.config.subscriptionManager;
    if (!sm) throw new Error('method "chain" requires a SubscriptionManager in the config');
    const result = await sm.subscribe(input.planId, {
      valueWei: input.valueWei,
      approveTokenFirst: input.approveTokenFirst
    });
    return { method: "chain", subscriptionId: result.subscriptionId, txHash: result.txHash };
  }
  async _payFiat(input) {
    if (!this.config.gatewayUrl) throw new Error('method "fiat" requires a gatewayUrl');
    if (!input.subscriber) throw new Error('method "fiat" requires a subscriber address');
    const body = {
      subscriber: input.subscriber,
      agentId: input.agentId,
      planId: input.planId,
      period: input.period ?? "month",
      currency: input.currency ?? "usd",
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl
    };
    if (input.amountCents) body.amountCents = input.amountCents;
    const data = await this._fetchJson("/api/v1/fiat/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!data.url) throw new Error("Fiat checkout returned no redirect URL");
    return { method: "fiat", sessionUrl: data.url, sessionId: data.sessionId, redirect: true };
  }
  async _payX402(input) {
    if (!this.config.gatewayUrl) throw new Error('method "x402" requires a gatewayUrl');
    if (!input.subscriber) throw new Error('method "x402" requires a subscriber address');
    if (!PERIODS.includes(input.period ?? "month")) {
      throw new Error("period must be one of: day | week | month | year");
    }
    let txHash = input.txHash;
    if (!txHash) {
      txHash = await this._autoFundX402(input);
    }
    const body = {
      subscriber: input.subscriber,
      agentId: input.agentId,
      planId: input.planId,
      period: input.period ?? "month",
      txHash,
      chain: this.config.chain ?? "oxachain"
    };
    const data = await this._fetchJson("/api/v1/x402/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return {
      method: "x402",
      subscriptionId: data.subscriptionId,
      txHash,
      creditedWei: data.creditedWei
    };
  }
  /** Send the on-chain native transfer to the platform wallet (x402 rail). */
  async _autoFundX402(input) {
    const { walletClient, subscriptionManager } = this.config;
    if (!walletClient || !subscriptionManager) {
      throw new Error("x402 automatic payment needs a txHash, or a walletClient + subscriptionManager in the config");
    }
    const info = await this.fetchX402Info();
    if (!info.enabled || !info.payTo) {
      throw new Error("x402 is not enabled on the Gateway (X402_ENABLED / X402_PAY_TO missing)");
    }
    const plan = await subscriptionManager.getPlan(input.planId);
    const priceWei = BigInt(info.priceWei || "0");
    const amount = plan.price > priceWei ? plan.price : priceWei;
    let account = walletClient.account?.address;
    if (!account) {
      const [addr] = await walletClient.getAddresses();
      account = addr;
    }
    if (!account) throw new Error("Wallet not connected for x402 payment");
    const hash2 = await walletClient.sendTransaction({
      to: info.payTo,
      value: amount,
      chain: void 0,
      account
    });
    return hash2;
  }
  // ── HTTP helpers ────────────────────────────────────────────────────────
  async _fetchJson(path, init) {
    const base = (this.config.gatewayUrl ?? "").replace(/\/$/, "");
    const headers = { ...init?.headers };
    if (this.config.accessToken) headers.Authorization = `Bearer ${this.config.accessToken}`;
    const resp = await fetch(`${base}${path}`, { ...init, headers });
    if (!resp.ok) {
      let message = `Gateway request failed (${resp.status}): ${path}`;
      try {
        const body = await resp.json();
        if (body.error) message = body.error;
      } catch {
      }
      throw new Error(message);
    }
    return await resp.json();
  }
};

// src/payment/index.ts
var PAYMENT_VERSION = "0.1.0";

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
      { name: "outputData", type: "string" },
      { name: "status", type: "uint256" }
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
  },
  getAgentTasks: {
    inputs: [{ name: "agentId", type: "uint256" }],
    name: "getAgentTasks",
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "taskId", type: "uint256" },
          { name: "agentId", type: "uint256" },
          { name: "taskType", type: "string" },
          { name: "inputData", type: "string" },
          { name: "outputData", type: "string" },
          { name: "status", type: "uint256" },
          { name: "clientAddress", type: "address" },
          { name: "createdAt", type: "uint256" },
          { name: "completedAt", type: "uint256" },
          { name: "taskHash", type: "bytes32" }
        ]
      }
    ],
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
    const hash2 = await this.walletClient.writeContract(request);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: hash2 });
    const cardId = this._parseUintFromLog(receipt, "AgentCardCreated");
    return { cardId, txHash: hash2 };
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
    const hash2 = await this.walletClient.writeContract(request);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: hash2 });
    const taskId = this._parseUintFromLog(receipt, "TaskCreated");
    return { taskId, txHash: hash2 };
  }
  async completeTask(taskId, output, status = 3) {
    const acct = await this.account;
    const outputStr = typeof output === "string" ? output : JSON.stringify(output);
    const { request } = await this.publicClient.simulateContract({
      account: acct,
      address: this.address,
      abi: [A2A_ABI.completeTask],
      functionName: "completeTask",
      args: [BigInt(taskId), outputStr, BigInt(status)]
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
  async getAgentTasks(agentId) {
    const r = await this.publicClient.readContract({
      address: this.address,
      abi: [A2A_ABI.getAgentTasks],
      functionName: "getAgentTasks",
      args: [BigInt(agentId)]
    });
    const statusMap = ["created", "accepted", "in_progress", "completed", "failed"];
    const tasks = r;
    return tasks.map((t) => ({
      taskId: Number(t.taskId),
      creator: t.clientAddress,
      targetAgentId: Number(t.agentId),
      taskType: t.taskType,
      input: t.inputData,
      status: statusMap[Number(t.status)] ?? "created",
      result: t.outputData,
      createdAt: Number(t.createdAt),
      completedAt: t.completedAt > 0n ? Number(t.completedAt) : void 0
    }));
  }
  async getAddress() {
    return this.account;
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

// src/traces/types.ts
var NoopTraceEmitter = class {
  emit(_event) {
  }
};
var HttpTraceEmitter = class {
  constructor(endpoint, authToken, flushIntervalMs = 5e3, maxBufferSize = 100) {
    this.endpoint = endpoint;
    this.authToken = authToken;
    this.flushIntervalMs = flushIntervalMs;
    this.maxBufferSize = maxBufferSize;
  }
  endpoint;
  authToken;
  flushIntervalMs;
  maxBufferSize;
  buffer = [];
  timer = null;
  emit(event) {
    this.buffer.push(event);
    if (this.buffer.length >= this.maxBufferSize) {
      this.flush();
      return;
    }
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.flushIntervalMs);
    }
  }
  flush() {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.authToken ? { "Authorization": `Bearer ${this.authToken}` } : {}
      },
      body: JSON.stringify({ events: batch })
    }).catch(() => {
    });
  }
};

// src/skills/browser.ts
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function extractAccessibleDOM() {
  if (typeof document === "undefined") {
    return "Browser DOM not available (not running in browser)";
  }
  const interactiveTags = /* @__PURE__ */ new Set([
    "A",
    "BUTTON",
    "INPUT",
    "SELECT",
    "TEXTAREA",
    "FORM",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "P",
    "SPAN",
    "DIV",
    "LI",
    "TD",
    "TH",
    "LABEL"
  ]);
  const elements = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node2) => {
        if (!(node2 instanceof HTMLElement)) return NodeFilter.FILTER_REJECT;
        if (!interactiveTags.has(node2.tagName)) return NodeFilter.FILTER_REJECT;
        if (node2.offsetParent === null && node2.tagName !== "A") return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );
  let node;
  while (node = walker.nextNode()) {
    const el = node;
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80);
    const id = el.id ? `#${el.id}` : "";
    const classes = el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    const href = el.getAttribute("href");
    const placeholder = el.getAttribute("placeholder");
    const type = el.getAttribute("type");
    const name = el.getAttribute("name");
    const role = el.getAttribute("role");
    const ariaLabel = el.getAttribute("aria-label");
    let desc = `<${tag}${id}${classes}`;
    if (href) desc += ` href="${href}"`;
    if (placeholder) desc += ` placeholder="${placeholder}"`;
    if (type) desc += ` type="${type}"`;
    if (name) desc += ` name="${name}"`;
    if (role) desc += ` role="${role}"`;
    if (ariaLabel) desc += ` aria-label="${ariaLabel}"`;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (el.value) desc += ` value="${String(el.value).slice(0, 60)}"`;
      if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
        desc += ` checked="${el.checked}"`;
      }
    } else if (el instanceof HTMLSelectElement && el.value) {
      desc += ` value="${el.value}"`;
    } else if (el instanceof HTMLAnchorElement) {
      desc += ` target="${el.target || "_self"}"`;
    }
    desc += ">";
    if (text) desc += `${text}`;
    desc += `</${tag}>`;
    elements.push(desc);
  }
  return elements.join("\n").slice(0, 8e3);
}
function executeBrowserAction(action) {
  if (typeof document === "undefined") {
    return { success: false, error: "Not running in browser environment" };
  }
  try {
    const el = findElement(action.selector, action.description);
    const needsEl = !["navigate", "extract", "getInfo", "back", "forward", "scroll"].includes(action.type);
    if (!el && needsEl) {
      return { success: false, error: `Element not found: ${action.selector || action.description}` };
    }
    switch (action.type) {
      case "click": {
        el.click();
        return { success: true, result: "Clicked" };
      }
      case "type": {
        const input = el;
        input.focus();
        input.value = action.value || "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return { success: true, result: `Typed: ${action.value}` };
      }
      case "press": {
        const key = action.value || action.selector || "";
        if (!key) return { success: false, error: "No key provided for press" };
        const target = el || document.activeElement || document.body;
        const opts = { bubbles: true, cancelable: true, key };
        target.dispatchEvent(new KeyboardEvent("keydown", opts));
        target.dispatchEvent(new KeyboardEvent("keyup", opts));
        return { success: true, result: `Pressed: ${key}` };
      }
      case "hover": {
        const target = el;
        target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        target.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
        target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
        return { success: true, result: `Hovered: ${action.selector || action.description || target.tagName}` };
      }
      case "select": {
        const value = action.value || "";
        if (el instanceof HTMLSelectElement) {
          el.value = value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return { success: true, result: `Selected: ${value}` };
        }
        if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
          const checked = value === "" ? !el.checked : value.toLowerCase() === "true" || value === "1";
          el.checked = checked;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return { success: true, result: `Checked: ${checked}` };
        }
        return { success: false, error: `Element is not a select/checkbox/radio: ${action.selector}` };
      }
      case "extract": {
        if (action.selector) {
          const content = el?.textContent || "";
          return { success: true, result: content.slice(0, 5e3) };
        }
        return { success: true, result: extractAccessibleDOM() };
      }
      case "getInfo": {
        return {
          success: true,
          result: JSON.stringify({
            url: window.location.href,
            title: document.title,
            readyState: document.readyState,
            viewport: { width: window.innerWidth, height: window.innerHeight },
            scrollY: Math.round(window.scrollY)
          })
        };
      }
      case "scroll": {
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          window.scrollBy({ top: action.value ? parseInt(action.value) || 500 : 500, behavior: "smooth" });
        }
        return { success: true, result: "Scrolled" };
      }
      case "navigate": {
        const url = action.value || action.selector;
        if (!url) return { success: false, error: "No URL provided" };
        window.location.href = url;
        return { success: true, result: `Navigating to ${url}` };
      }
      case "back": {
        window.history.back();
        return { success: true, result: "Navigated back" };
      }
      case "forward": {
        window.history.forward();
        return { success: true, result: "Navigated forward" };
      }
      default:
        return { success: false, error: `Unknown action type: ${action.type}` };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
function findElement(selector, description) {
  if (selector) {
    try {
      const el = document.querySelector(selector);
      if (el) return el;
    } catch {
    }
  }
  const searchText = description || selector;
  if (!searchText) return null;
  const all = document.querySelectorAll('a, button, input, select, textarea, [role="button"]');
  const lower = searchText.toLowerCase();
  for (const el of all) {
    const text = (el.textContent || "").toLowerCase();
    const placeholder = (el.getAttribute("placeholder") || "").toLowerCase();
    const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
    const name = (el.getAttribute("name") || "").toLowerCase();
    if (text.includes(lower) || placeholder.includes(lower) || ariaLabel.includes(lower) || name.includes(lower)) {
      return el;
    }
  }
  return null;
}

// src/conversation/client.ts
var ConversationTaskError = class extends Error {
  status;
  code;
  constructor(status, message, code) {
    super(message);
    this.name = "ConversationTaskError";
    this.status = status;
    this.code = code;
  }
};
var ConversationClient = class {
  constructor(config) {
    this.config = config;
    this.baseUrl = config.gatewayUrl.replace(/\/$/, "");
  }
  config;
  baseUrl;
  /** Common auth/tenant headers for all Gateway API calls. */
  _headers() {
    const headers = {
      "Content-Type": "application/json"
    };
    if (this.config.apiKey) headers["X-Api-Key"] = this.config.apiKey;
    if (this.config.accessToken) headers["Authorization"] = `Bearer ${this.config.accessToken}`;
    if (!this.config.apiKey && !this.config.accessToken) {
      throw new Error("ConversationClient requires either apiKey or accessToken");
    }
    if (this.config.endUserId) headers["X-End-User-Id"] = this.config.endUserId;
    if (this.config.llmApiKey) headers["X-Llm-Api-Key"] = this.config.llmApiKey;
    if (this.config.llmEndpoint) headers["X-Llm-Endpoint"] = this.config.llmEndpoint;
    if (this.config.llmModel) headers["X-Llm-Model"] = this.config.llmModel;
    return headers;
  }
  /**
   * Stream an agent conversation (SSE). Yields parsed events.
   * @param opts.signal external AbortSignal — aborts the stream (e.g. user "stop")
   */
  async *stream(params, opts) {
    const headers = this._headers();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 12e4);
    const onExternalAbort = () => controller.abort();
    opts?.signal?.addEventListener("abort", onExternalAbort, { once: true });
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/agent/runs`, {
        method: "POST",
        headers,
        body: JSON.stringify(params),
        signal: controller.signal
      });
      if (!res.ok) {
        let detail = "";
        try {
          const body = await res.json();
          detail = body?.error ?? "";
        } catch {
        }
        throw new Error(`Conversation request failed (HTTP ${res.status}) ${detail}`.trim());
      }
      if (!res.body) {
        throw new Error("Conversation stream unavailable");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6));
              yield event;
              if (event.type === "error") {
                throw new Error(event.error || "Conversation error");
              }
            } catch (err) {
              if (err instanceof SyntaxError) continue;
              throw err;
            }
          }
        }
      }
    } finally {
      clearTimeout(timeout);
      opts?.signal?.removeEventListener("abort", onExternalAbort);
    }
  }
  /**
   * Run a conversation and collect the full result.
   */
  async chat(params) {
    const result = { text: "", toolCalls: [] };
    for await (const event of this.stream(params)) {
      switch (event.type) {
        case "text":
          result.text += event.content ?? "";
          break;
        case "tool_call":
          result.toolCalls.push({ name: event.toolName ?? "", arguments: event.toolArgs ?? {} });
          break;
        case "tool_result": {
          const last = result.toolCalls[result.toolCalls.length - 1];
          if (last) {
            last.result = event.toolResult;
          }
          break;
        }
        case "clarification":
          result.clarification = event.question ?? "";
          break;
        case "done":
          result.usage = event.usage;
          result.iterations = event.iterations;
          break;
      }
    }
    return result;
  }
  // ── Sessions & Tasks (parallel runs) ────────────────────────────────────
  /**
   * Query the integrator's capability flags (P9). When `parallelTasks` is false,
   * `createTask` will be rejected with HTTP 403 `PARALLEL_TASKS_DISABLED` —
   * callers should degrade to single-turn `chat()` in that case.
   */
  async getCapabilities() {
    const res = await fetch(`${this.baseUrl}/api/v1/tenant/me`, { headers: this._headers() });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ConversationTaskError(res.status, body?.error || `Capability lookup failed (HTTP ${res.status})`);
    }
    return {
      parallelTasks: body?.capabilities?.parallel_tasks ?? true,
      parallelTasksOverride: body?.capabilities?.parallel_tasks_override ?? null
    };
  }
  /**
   * Create a session (dialog container that owns many tasks). Idempotent.
   */
  async createSession(params) {
    const res = await fetch(`${this.baseUrl}/api/v1/sessions`, {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      throw new ConversationTaskError(res.status, `Session creation failed (HTTP ${res.status})`);
    }
    return res.json();
  }
  /**
   * Create a task — returns immediately with the task row (`status: queued`);
   * execution happens in the background. Throws `ConversationTaskError` with
   * `code === 'PARALLEL_TASKS_DISABLED'` (HTTP 403) when the tenant/plan is
   * configured to disallow multi-task / sub-agent.
   */
  async createTask(params) {
    const res = await fetch(`${this.baseUrl}/api/v1/sessions/${params.sessionId}/tasks`, {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify(params)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ConversationTaskError(
        res.status,
        body?.error || `Task creation failed (HTTP ${res.status})`,
        body?.code
      );
    }
    return body;
  }
  /** Fetch a single task by id. */
  async getTask(taskId) {
    const res = await fetch(`${this.baseUrl}/api/v1/tasks/${taskId}`, { headers: this._headers() });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ConversationTaskError(res.status, body?.error || `Task lookup failed (HTTP ${res.status})`, body?.code);
    }
    return body;
  }
  /** List tasks of a session. */
  async listTasks(sessionId) {
    const res = await fetch(`${this.baseUrl}/api/v1/sessions/${sessionId}/tasks`, { headers: this._headers() });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ConversationTaskError(res.status, body?.error || `Task list failed (HTTP ${res.status})`, body?.code);
    }
    return body.tasks ?? [];
  }
  /** Cancel a task (queued → cancelled directly, running → aborted). */
  async cancelTask(taskId) {
    const res = await fetch(`${this.baseUrl}/api/v1/tasks/${taskId}`, {
      method: "DELETE",
      headers: this._headers()
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ConversationTaskError(res.status, body?.error || `Task cancel failed (HTTP ${res.status})`, body?.code);
    }
    return body;
  }
};
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
  ContextCompactor,
  ConversationClient,
  ConversationTaskError,
  FactExtractor,
  GatewayProvider,
  HttpTraceEmitter,
  IPFSFetcher,
  IPFSUploader,
  KNOWN_CHAINS,
  LoopTraceEmitter,
  MCPConnector,
  MCP_VERSION,
  MultiEndpointClient,
  NoopTraceEmitter,
  OpenAIProvider,
  PAYMENT_VERSION,
  REGISTRY_VERSION,
  REPUTATION_VERSION,
  ReputationRegistry,
  SUBSCRIPTION_PERIODS,
  SUBSCRIPTION_VERSION,
  SubscriptionManager,
  SubscriptionPayments,
  ToolExecutor,
  ZERO_ADDRESS2 as ZERO_ADDRESS,
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
  executeBrowserAction,
  executePlatformTool,
  extractAccessibleDOM,
  generateAesKey,
  generateKeyPair,
  getAllPlatformToolNames,
  getPublicKey,
  guardSubscription,
  hexToBytes,
  packAgentForPublish,
  publishAgent,
  randomBytes,
  sleep,
  subscribeToEvents,
  unpackAgent,
  wrapPlatformToolsAsSkills
};
//# sourceMappingURL=index.mjs.map