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

// src/conversation/index.ts
var conversation_exports = {};
__export(conversation_exports, {
  ConversationClient: () => ConversationClient
});
module.exports = __toCommonJS(conversation_exports);

// src/conversation/client.ts
var ConversationClient = class {
  constructor(config) {
    this.config = config;
    this.baseUrl = config.gatewayUrl.replace(/\/$/, "");
  }
  config;
  baseUrl;
  /**
   * Stream an agent conversation (SSE). Yields parsed events.
   */
  async *stream(params) {
    const headers = {
      "Content-Type": "application/json",
      "X-Api-Key": this.config.apiKey
    };
    if (this.config.endUserId) headers["X-End-User-Id"] = this.config.endUserId;
    if (this.config.llmApiKey) headers["X-Llm-Api-Key"] = this.config.llmApiKey;
    if (this.config.llmEndpoint) headers["X-Llm-Endpoint"] = this.config.llmEndpoint;
    if (this.config.llmModel) headers["X-Llm-Model"] = this.config.llmModel;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 12e4);
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
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ConversationClient
});
//# sourceMappingURL=index.js.map