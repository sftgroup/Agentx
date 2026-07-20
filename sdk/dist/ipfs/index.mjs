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
export {
  IPFSUploader,
  defaultIPFSUploader
};
//# sourceMappingURL=index.mjs.map