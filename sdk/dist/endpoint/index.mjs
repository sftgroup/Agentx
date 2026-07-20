// src/endpoint/multi-endpoint.ts
var ABI = [
  {
    name: "getActiveAgentEndpoints",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{
      type: "tuple[]",
      components: [
        { name: "endpointId", type: "uint256" },
        { name: "agentId", type: "uint256" },
        { name: "name", type: "string" },
        { name: "endpointType", type: "string" },
        { name: "protocol", type: "string" },
        { name: "url", type: "string" },
        { name: "description", type: "string" },
        { name: "isActive", type: "bool" },
        { name: "createdAt", type: "uint256" },
        { name: "updatedAt", type: "uint256" },
        { name: "createdBy", type: "address" }
      ]
    }]
  },
  {
    name: "getAgentEndpoints",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{
      type: "tuple[]",
      components: [
        { name: "endpointId", type: "uint256" },
        { name: "agentId", type: "uint256" },
        { name: "name", type: "string" },
        { name: "endpointType", type: "string" },
        { name: "protocol", type: "string" },
        { name: "url", type: "string" },
        { name: "description", type: "string" },
        { name: "isActive", type: "bool" },
        { name: "createdAt", type: "uint256" },
        { name: "updatedAt", type: "uint256" },
        { name: "createdBy", type: "address" }
      ]
    }]
  },
  {
    name: "createEndpoint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "name", type: "string" },
      { name: "endpointType", type: "string" },
      { name: "protocol", type: "string" },
      { name: "url", type: "string" },
      { name: "description", type: "string" }
    ],
    outputs: [{ name: "endpointId", type: "uint256" }]
  },
  {
    name: "getEndpoint",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "endpointId", type: "uint256" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "endpointId", type: "uint256" },
        { name: "agentId", type: "uint256" },
        { name: "name", type: "string" },
        { name: "endpointType", type: "string" },
        { name: "protocol", type: "string" },
        { name: "url", type: "string" },
        { name: "description", type: "string" },
        { name: "isActive", type: "bool" },
        { name: "createdAt", type: "uint256" },
        { name: "updatedAt", type: "uint256" },
        { name: "createdBy", type: "address" }
      ]
    }]
  },
  {
    name: "getSupportedProtocols",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string[]" }]
  },
  {
    name: "getAgentEndpointStats",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      { name: "totalEndpoints", type: "uint256" },
      { name: "activeEndpoints", type: "uint256" },
      { name: "httpEndpoints", type: "uint256" },
      { name: "websocketEndpoints", type: "uint256" },
      { name: "grpcEndpoints", type: "uint256" }
    ]
  }
];
var MultiEndpointClient = class {
  address;
  publicClient;
  constructor(config, publicClient) {
    this.address = config.address;
    this.publicClient = publicClient ?? null;
  }
  setPublicClient(client) {
    this.publicClient = client;
  }
  async getActiveEndpoints(agentId) {
    if (!this.publicClient) throw new Error("publicClient not set");
    return await this.publicClient.readContract({
      address: this.address,
      abi: ABI,
      functionName: "getActiveAgentEndpoints",
      args: [agentId]
    });
  }
  async getAllEndpoints(agentId) {
    if (!this.publicClient) throw new Error("publicClient not set");
    return await this.publicClient.readContract({
      address: this.address,
      abi: ABI,
      functionName: "getAgentEndpoints",
      args: [agentId]
    });
  }
  async getEndpoint(endpointId) {
    if (!this.publicClient) throw new Error("publicClient not set");
    return await this.publicClient.readContract({
      address: this.address,
      abi: ABI,
      functionName: "getEndpoint",
      args: [endpointId]
    });
  }
  async getStats(agentId) {
    if (!this.publicClient) throw new Error("publicClient not set");
    return await this.publicClient.readContract({
      address: this.address,
      abi: ABI,
      functionName: "getAgentEndpointStats",
      args: [agentId]
    });
  }
  /** Pick best active endpoint for the agent — prefer HTTP, take first active */
  async pickBestEndpoint(agentId) {
    const endpoints = await this.getActiveEndpoints(agentId);
    if (endpoints.length === 0) return null;
    const http = endpoints.find((e) => e.protocol === "HTTP");
    return http ?? endpoints[0] ?? null;
  }
  /** Pick any active endpoint URL — for MCP connector */
  async getBestMCPUrl(agentId) {
    const best = await this.pickBestEndpoint(agentId);
    return best?.url ?? null;
  }
};
export {
  MultiEndpointClient
};
//# sourceMappingURL=index.mjs.map