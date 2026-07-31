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
export {
  HttpTraceEmitter,
  NoopTraceEmitter
};
//# sourceMappingURL=index.mjs.map