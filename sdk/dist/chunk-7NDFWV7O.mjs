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

export {
  AgentXErrorCode,
  AgentXError
};
