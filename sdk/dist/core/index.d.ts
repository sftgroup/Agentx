import { A as AgentPayload, P as PackResult, E as EncryptedPayload, h as AgentPrivatePayload } from '../types-CCl4P8IB.js';
export { c as A2AAgentCard, d as A2ASkillExecution, e as A2ATask, f as A2ATaskStatus, g as AgentPricing, i as AgentPublicPayload, b as AgentReputation, a as AgentReview, j as AgentSearchQuery, k as AgentSearchResult, l as AgentSubscription, m as AgentXConfig, n as AgentXContracts, o as AgentXError, p as AgentXErrorCode, J as JSONSchema, q as JSONSchemaProperty, M as McpConnection, r as McpTransport, O as OnChainAgentMetadata, s as PricingType, R as RegisteredAgent, S as SkillDef, t as SkillExecutionMode, u as SkillExecutionRemote, v as SubscriptionRequired, w as SubscriptionStatus, U as UnpackResult } from '../types-CCl4P8IB.js';
import { IPFSUploader, IPFSUploadResult } from '../ipfs/index.js';
export { bytesToHex, hexToBytes } from '@noble/ciphers/utils.js';

declare function randomBytes(length: number): Uint8Array;

/**
 * Encrypt with AES-256-GCM.
 * Wire format (same as aihunter-saas): base64( IV[12] || ciphertext || authTag[16] )
 */
declare function aesEncrypt(plaintext: string, keyHex: string): string;
/**
 * Decrypt AES-256-GCM (same wire format as aihunter-saas).
 */
declare function aesDecrypt(encryptedBase64: string, keyHex: string): string;
/**
 * Generate a cryptographically random AES-256 key (hex, 64 chars).
 */
declare function generateAesKey(): string;
/**
 * Encrypt data with recipient's secp256k1 public key (ECIES).
 *
 * @param dataHex    The data to encrypt (hex, e.g. AES key)
 * @param publicKey  Recipient's public key (hex, 04-prefixed uncompressed or 02/03 compressed)
 */
declare function eciesEncrypt(dataHex: string, publicKey: string): string;
/**
 * Decrypt ECIES ciphertext with recipient's secp256k1 private key.
 */
declare function eciesDecrypt(dataHex: string, privateKey: string): string;
/**
 * Encrypt an Agent's private payload with AES-256-GCM.
 */
declare function encryptPayload(payload: AgentPrivatePayload, keyHex?: string): EncryptedPayload;
/**
 * Decrypt an EncryptedPayload.
 */
declare function decryptPayload(encrypted: EncryptedPayload, keyHex: string): AgentPrivatePayload;
/**
 * Pack an AgentPayload for publishing.
 *   1. Split public/private
 *   2. AES-256-GCM encrypt private part
 *   3. ECIES wrap AES key with creator's public key
 */
declare function packAgentForPublish(agent: AgentPayload, publicKey: string, aesKeyHex?: string): PackResult;

interface PublishAgentConfig {
    /** Agent payload to publish */
    agent: AgentPayload;
    /** Creator's secp256k1 public key (hex) */
    publicKey: string;
    /** IPFS uploader instance with Pinata JWT configured */
    uploader: IPFSUploader;
    /** Optional AES key (auto-generated if not provided) */
    aesKeyHex?: string;
    /** Agent name for IPFS metadata */
    agentName?: string;
}
interface PublishAgentResult {
    /** AES encryption key (hex) */
    aesKeyHex: string;
    /** ECIES-encrypted AES key for on-chain storage */
    eciesEncryptedKeyHex: string;
    /** CID of the encrypted private payload on IPFS */
    encryptedCid: string;
    /** Public IPFS gateway URL to the encrypted payload */
    encryptedUrl: string;
    /** CID of the public metadata on IPFS */
    publicCid: string;
    /** Public IPFS gateway URL to the public metadata */
    publicUrl: string;
    /** Full PackResult (compatible with existing code) */
    pack: PackResult;
    /** Raw IPFS upload results */
    uploads: {
        encrypted: IPFSUploadResult;
        public: IPFSUploadResult;
    };
}
/**
 * Full publish pipeline: encrypt + upload to IPFS.
 *
 * Usage:
 *   const uploader = new IPFSUploader({ pinataJwt: '...' })
 *   const result = await publishAgent({ agent, publicKey, uploader })
 *   // result.encryptedCid → IPFS CID to mint as on-chain tokenURI
 */
declare function publishAgent(config: PublishAgentConfig): Promise<PublishAgentResult>;
/**
 * Unpack an Agent:
 *   1. ECIES decrypt the AES key (private key)
 *   2. AES-256-GCM decrypt the payload
 */
declare function unpackAgent(encryptedPayload: EncryptedPayload, eciesEncryptedKey: string, privateKey: string): AgentPrivatePayload;
/**
 * Generate a secp256k1 keypair compatible with Ethereum wallets.
 */
declare function generateKeyPair(): {
    privateKey: string;
    publicKey: string;
};
/**
 * Derive public key from private key (hex).
 */
declare function getPublicKey(privateKey: string): string;

export { AgentPayload, AgentPrivatePayload, EncryptedPayload, PackResult, type PublishAgentConfig, type PublishAgentResult, aesDecrypt, aesEncrypt, decryptPayload, eciesDecrypt, eciesEncrypt, encryptPayload, generateAesKey, generateKeyPair, getPublicKey, packAgentForPublish, publishAgent, randomBytes, unpackAgent };
