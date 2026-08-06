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
    const hash = await walletClient.sendTransaction({
      to: info.payTo,
      value: amount,
      chain: void 0,
      account
    });
    return hash;
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
export {
  PAYMENT_VERSION,
  SubscriptionPayments
};
//# sourceMappingURL=index.mjs.map