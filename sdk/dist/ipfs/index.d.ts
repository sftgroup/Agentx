import { E as EncryptedPayload } from '../types-CCl4P8IB.js';

interface IPFSUploaderConfig {
    /** Pinata JWT token. Required for Pinata uploads. */
    pinataJwt?: string;
    /** Custom IPFS API endpoint. Falls back to Pinata if not set. */
    customEndpoint?: string;
    /** Custom API key for non-Pinata endpoints */
    customApiKey?: string;
    /** Gateway URL for building access URLs (default: ipfs.io) */
    gatewayUrl?: string;
    /** Request timeout in ms (default: 30_000) */
    timeoutMs?: number;
    /** Pinata group ID for organizing pinned files */
    pinataGroupId?: string;
    /** Metadata name prefix for pinned files */
    namePrefix?: string;
}
interface IPFSUploadResult {
    /** IPFS CID (Content Identifier) */
    cid: string;
    /** Full IPFS gateway URL */
    url: string;
    /** Raw response from the upload endpoint */
    raw: Record<string, unknown>;
}
declare class IPFSUploader {
    private pinataJwt;
    private customEndpoint;
    private customApiKey;
    private gatewayUrl;
    private timeoutMs;
    private pinataGroupId;
    private namePrefix;
    private static readonly PINATA_JSON_API;
    private static readonly PINATA_FILE_API;
    constructor(config?: IPFSUploaderConfig);
    isConfigured(): boolean;
    /**
     * Upload JSON-serializable data to IPFS.
     *
     * @param data       Any JSON-serializable value
     * @param metadata   Optional name / keyvalues for Pinata metadata
     */
    uploadJSON(data: unknown, metadata?: {
        name?: string;
        keyvalues?: Record<string, string>;
    }): Promise<IPFSUploadResult>;
    /**
     * Upload a file / Blob / Buffer / Uint8Array / string to IPFS.
     */
    uploadFile(content: Blob | Buffer | Uint8Array | string, fileName?: string, mimeType?: string): Promise<IPFSUploadResult>;
    /**
     * Upload an encrypted agent payload to IPFS.
     * This is the primary method used by Agent Studio publish flow.
     */
    uploadEncryptedPayload(payload: EncryptedPayload, agentName?: string): Promise<IPFSUploadResult>;
    uploadString(content: string, name?: string): Promise<IPFSUploadResult>;
    /** Build a public access URL from a CID. */
    getUrl(cid: string): string;
    private _doFetch;
}
/** Shared default instance (unconfigured until pinataJwt is set). */
declare const defaultIPFSUploader: IPFSUploader;

export { type IPFSUploadResult, IPFSUploader, type IPFSUploaderConfig, defaultIPFSUploader };
