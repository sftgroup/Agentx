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

// src/traces/index.ts
var traces_exports = {};
__export(traces_exports, {
  HttpTraceEmitter: () => HttpTraceEmitter,
  NoopTraceEmitter: () => NoopTraceEmitter
});
module.exports = __toCommonJS(traces_exports);

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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  HttpTraceEmitter,
  NoopTraceEmitter
});
//# sourceMappingURL=index.js.map