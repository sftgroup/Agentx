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
    if (params.endUserId) headers["X-End-User-Id"] = params.endUserId;
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
    const headers = this._headers();
    if (params.endUserId) headers["X-End-User-Id"] = params.endUserId;
    const res = await fetch(`${this.baseUrl}/api/v1/sessions/${params.sessionId}/tasks`, {
      method: "POST",
      headers,
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
  ConversationClient,
  ConversationTaskError
};
//# sourceMappingURL=index.mjs.map