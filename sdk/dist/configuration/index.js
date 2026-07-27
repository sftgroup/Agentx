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

// src/configuration/index.ts
var configuration_exports = {};
__export(configuration_exports, {
  ConfigurationClient: () => ConfigurationClient
});
module.exports = __toCommonJS(configuration_exports);

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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ConfigurationClient
});
//# sourceMappingURL=index.js.map