// src/a2a/a2a.ts
var A2A_ABI = {
  createAgentCard: {
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "name", type: "string" },
      { name: "description", type: "string" },
      { name: "version", type: "string" },
      { name: "capabilities", type: "string[]" },
      { name: "supportedTasks", type: "string[]" },
      { name: "communicationProtocol", type: "string" },
      { name: "authenticationMethod", type: "string" },
      { name: "cardURI", type: "string" }
    ],
    name: "createAgentCard",
    outputs: [{ name: "cardId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  getAgentCard: {
    inputs: [{ name: "agentId", type: "uint256" }],
    name: "getAgentCard",
    outputs: [
      { name: "cardId", type: "uint256" },
      { name: "agentId", type: "uint256" },
      { name: "name", type: "string" },
      { name: "description", type: "string" },
      { name: "version", type: "string" },
      { name: "capabilities", type: "string[]" },
      { name: "supportedTasks", type: "string[]" },
      { name: "communicationProtocol", type: "string" },
      { name: "authenticationMethod", type: "string" },
      { name: "cardURI", type: "string" },
      { name: "isActive", type: "bool" }
    ],
    stateMutability: "view",
    type: "function"
  },
  registerSkill: {
    inputs: [
      { name: "name", type: "string" },
      { name: "description", type: "string" },
      { name: "inputSchema", type: "string" },
      { name: "outputSchema", type: "string" },
      { name: "requiredCapabilities", type: "string[]" },
      { name: "complexity", type: "uint256" }
    ],
    name: "registerSkill",
    outputs: [{ name: "skillId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  addAgentSkill: {
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "skillId", type: "uint256" },
      { name: "skillEndpoint", type: "string" },
      { name: "version", type: "string" },
      { name: "price", type: "uint256" },
      { name: "priceToken", type: "address" }
    ],
    name: "addAgentSkill",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  createTask: {
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "taskType", type: "string" },
      { name: "inputData", type: "string" }
    ],
    name: "createTask",
    outputs: [{ name: "taskId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  completeTask: {
    inputs: [
      { name: "taskId", type: "uint256" },
      { name: "outputData", type: "string" },
      { name: "status", type: "uint256" }
    ],
    name: "completeTask",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  getTask: {
    inputs: [{ name: "taskId", type: "uint256" }],
    name: "getTask",
    outputs: [
      { name: "taskId", type: "uint256" },
      { name: "agentId", type: "uint256" },
      { name: "taskType", type: "string" },
      { name: "inputData", type: "string" },
      { name: "outputData", type: "string" },
      { name: "status", type: "uint256" },
      { name: "clientAddress", type: "address" },
      { name: "createdAt", type: "uint256" },
      { name: "completedAt", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  getUserTasks: {
    inputs: [{ name: "user", type: "address" }],
    name: "getUserTasks",
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
    type: "function"
  },
  getAgentTasks: {
    inputs: [{ name: "agentId", type: "uint256" }],
    name: "getAgentTasks",
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "taskId", type: "uint256" },
          { name: "agentId", type: "uint256" },
          { name: "taskType", type: "string" },
          { name: "inputData", type: "string" },
          { name: "outputData", type: "string" },
          { name: "status", type: "uint256" },
          { name: "clientAddress", type: "address" },
          { name: "createdAt", type: "uint256" },
          { name: "completedAt", type: "uint256" },
          { name: "taskHash", type: "bytes32" }
        ]
      }
    ],
    stateMutability: "view",
    type: "function"
  }
};
var A2AProtocol = class {
  address;
  publicClient;
  walletClient;
  constructor(config) {
    this.address = config.contractAddress;
    this.publicClient = config.publicClient;
    this.walletClient = config.walletClient;
  }
  get account() {
    return this.walletClient.getAddresses().then((a) => {
      if (!a[0]) throw new Error("Wallet not connected");
      return a[0];
    });
  }
  // ── Agent Card ──────────────────────────────────────────────────────────
  async createAgentCard(agentId, card) {
    const acct = await this.account;
    const { request } = await this.publicClient.simulateContract({
      account: acct,
      address: this.address,
      abi: [A2A_ABI.createAgentCard],
      functionName: "createAgentCard",
      args: [
        BigInt(agentId),
        card.name,
        card.description,
        card.version,
        card.capabilities,
        card.supportedTasks,
        card.commProtocol ?? "a2a",
        card.authMethod ?? "ecdsa",
        card.cardURI ?? ""
      ]
    });
    const hash = await this.walletClient.writeContract(request);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    const cardId = this._parseUintFromLog(receipt, "AgentCardCreated");
    return { cardId, txHash: hash };
  }
  async getAgentCard(agentId) {
    const r = await this.publicClient.readContract({
      address: this.address,
      abi: [A2A_ABI.getAgentCard],
      functionName: "getAgentCard",
      args: [BigInt(agentId)]
    });
    const [, aId, name, , , capabilities, supportedTasks, , , , isActive] = r;
    if (!isActive) return null;
    return {
      agentId: Number(aId),
      name,
      capabilities,
      supportedTasks,
      endpoint: "",
      publicKey: ""
    };
  }
  // ── Task ────────────────────────────────────────────────────────────────
  async createTask(agentId, taskType, input) {
    const acct = await this.account;
    const inputStr = JSON.stringify(input);
    const { request } = await this.publicClient.simulateContract({
      account: acct,
      address: this.address,
      abi: [A2A_ABI.createTask],
      functionName: "createTask",
      args: [BigInt(agentId), taskType, inputStr]
    });
    const hash = await this.walletClient.writeContract(request);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    const taskId = this._parseUintFromLog(receipt, "TaskCreated");
    return { taskId, txHash: hash };
  }
  async completeTask(taskId, output, status = 3) {
    const acct = await this.account;
    const outputStr = typeof output === "string" ? output : JSON.stringify(output);
    const { request } = await this.publicClient.simulateContract({
      account: acct,
      address: this.address,
      abi: [A2A_ABI.completeTask],
      functionName: "completeTask",
      args: [BigInt(taskId), outputStr, BigInt(status)]
    });
    return this.walletClient.writeContract(request);
  }
  async getTask(taskId) {
    const r = await this.publicClient.readContract({
      address: this.address,
      abi: [A2A_ABI.getTask],
      functionName: "getTask",
      args: [BigInt(taskId)]
    });
    const [, aId, taskType, inputData, outputData, status, client, createdAt, completedAt] = r;
    const statusMap = ["created", "accepted", "in_progress", "completed", "failed"];
    return {
      taskId,
      creator: client,
      targetAgentId: Number(aId),
      taskType,
      input: inputData,
      status: statusMap[Number(status)] ?? "created",
      result: outputData,
      createdAt: Number(createdAt),
      completedAt: completedAt > 0n ? Number(completedAt) : void 0
    };
  }
  async getUserTasks(user) {
    const r = await this.publicClient.readContract({
      address: this.address,
      abi: [A2A_ABI.getUserTasks],
      functionName: "getUserTasks",
      args: [user]
    });
    return r.map(Number);
  }
  async getAgentTasks(agentId) {
    const r = await this.publicClient.readContract({
      address: this.address,
      abi: [A2A_ABI.getAgentTasks],
      functionName: "getAgentTasks",
      args: [BigInt(agentId)]
    });
    const statusMap = ["created", "accepted", "in_progress", "completed", "failed"];
    const tasks = r;
    return tasks.map((t) => ({
      taskId: Number(t.taskId),
      creator: t.clientAddress,
      targetAgentId: Number(t.agentId),
      taskType: t.taskType,
      input: t.inputData,
      status: statusMap[Number(t.status)] ?? "created",
      result: t.outputData,
      createdAt: Number(t.createdAt),
      completedAt: t.completedAt > 0n ? Number(t.completedAt) : void 0
    }));
  }
  async getAddress() {
    return this.account;
  }
  // ── Helpers ─────────────────────────────────────────────────────────────
  _parseUintFromLog(receipt, _eventName) {
    for (const log of receipt.logs) {
      if (log.topics.length >= 2) {
        try {
          return Number(BigInt(log.topics[1]));
        } catch {
        }
      }
      if (log.data && log.data !== "0x") {
        try {
          return Number(BigInt(log.data));
        } catch {
        }
      }
    }
    return 0;
  }
};

// src/a2a/index.ts
var A2A_VERSION = "0.1.0";

export {
  A2AProtocol,
  A2A_VERSION
};
