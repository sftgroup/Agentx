// src/llm/openai-provider.ts
var DEFAULT_ENDPOINT = "https://api.openai.com/v1";
var OpenAIProvider = class {
  config;
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
export {
  GatewayProvider,
  OpenAIProvider,
  createLLMProvider
};
//# sourceMappingURL=index.mjs.map