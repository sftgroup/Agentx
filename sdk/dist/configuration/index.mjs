// src/configuration/configuration.ts
var ABI = [
  {
    name: "getConfig",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "configKey", type: "string" }
    ],
    outputs: [{
      type: "tuple",
      components: [
        { name: "agentId", type: "uint256" },
        { name: "key", type: "string" },
        { name: "value", type: "string" },
        { name: "dataType", type: "string" },
        { name: "updatedAt", type: "uint256" },
        { name: "updatedBy", type: "address" }
      ]
    }]
  },
  {
    name: "getAgentConfigs",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{
      type: "tuple[]",
      components: [
        { name: "agentId", type: "uint256" },
        { name: "key", type: "string" },
        { name: "value", type: "string" },
        { name: "dataType", type: "string" },
        { name: "updatedAt", type: "uint256" },
        { name: "updatedBy", type: "address" }
      ]
    }]
  },
  {
    name: "getConfigKeys",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "string[]" }]
  },
  {
    name: "getConfigCount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "uint256" }]
  },
  {
    name: "configExists",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "configKey", type: "string" }
    ],
    outputs: [{ type: "bool" }]
  }
];
var ConfigurationClient = class {
  address;
  publicClient;
  constructor(config, publicClient) {
    this.address = config.address;
    this.publicClient = publicClient ?? null;
  }
  setPublicClient(client) {
    this.publicClient = client;
  }
  async get(agentId, key) {
    if (!this.publicClient) throw new Error("publicClient not set");
    try {
      return await this.publicClient.readContract({
        address: this.address,
        abi: ABI,
        functionName: "getConfig",
        args: [agentId, key]
      });
    } catch {
      return null;
    }
  }
  async getAll(agentId) {
    if (!this.publicClient) throw new Error("publicClient not set");
    return await this.publicClient.readContract({
      address: this.address,
      abi: ABI,
      functionName: "getAgentConfigs",
      args: [agentId]
    });
  }
  async getKeys(agentId) {
    if (!this.publicClient) throw new Error("publicClient not set");
    return await this.publicClient.readContract({
      address: this.address,
      abi: ABI,
      functionName: "getConfigKeys",
      args: [agentId]
    });
  }
  async getCount(agentId) {
    if (!this.publicClient) throw new Error("publicClient not set");
    return await this.publicClient.readContract({
      address: this.address,
      abi: ABI,
      functionName: "getConfigCount",
      args: [agentId]
    });
  }
  async exists(agentId, key) {
    if (!this.publicClient) throw new Error("publicClient not set");
    return await this.publicClient.readContract({
      address: this.address,
      abi: ABI,
      functionName: "configExists",
      args: [agentId, key]
    });
  }
};
export {
  ConfigurationClient
};
//# sourceMappingURL=index.mjs.map