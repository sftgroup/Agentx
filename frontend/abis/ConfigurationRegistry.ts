export const CONFIGURATION_REGISTRY_ABI = const CONFIGURATION_REGISTRY_ABI = [
  // 配置管理函数
  {
    name: 'setConfig',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'configKey', type: 'string' },
      { name: 'configValue', type: 'string' },
      { name: 'dataType', type: 'string' },
      { name: 'description', type: 'string' }
    ],
    outputs: [{ name: 'configId', type: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    name: 'setConfigsBulk',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'configKeys', type: 'string[]' },
      { name: 'configValues', type: 'string[]' },
      { name: 'dataTypes', type: 'string[]' },
      { name: 'descriptions', type: 'string[]' }
    ],
    outputs: [{ name: 'configIds', type: 'uint256[]' }],
    stateMutability: 'nonpayable'
  },
  {
    name: 'removeConfig',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'configKey', type: 'string' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  
  // 查询函数
  {
    name: 'getConfig',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'configKey', type: 'string' }
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'configId', type: 'uint256' },
          { name: 'agentId', type: 'uint256' },
          { name: 'configKey', type: 'string' },
          { name: 'configValue', type: 'string' },
          { name: 'dataType', type: 'string' },
          { name: 'description', type: 'string' },
          { name: 'isActive', type: 'bool' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'updatedAt', type: 'uint256' },
          { name: 'createdBy', type: 'address' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getAgentConfigs',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'configId', type: 'uint256' },
          { name: 'agentId', type: 'uint256' },
          { name: 'configKey', type: 'string' },
          { name: 'configValue', type: 'string' },
          { name: 'dataType', type: 'string' },
          { name: 'description', type: 'string' },
          { name: 'isActive', type: 'bool' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'updatedAt', type: 'uint256' },
          { name: 'createdBy', type: 'address' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getConfigKeys',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string[]' }],
    stateMutability: 'view'
  },
  {
    name: 'getConfigCount',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    name: 'configExists',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'configKey', type: 'string' }
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view'
  },
  {
    name: 'getConfigCounter',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  
  // 事件定义
  {
    name: 'ConfigSet',
    type: 'event',
    inputs: [
      { name: 'configId', type: 'uint256', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'configKey', type: 'string', indexed: true },
      { name: 'configValue', type: 'string', indexed: false },
      { name: 'dataType', type: 'string', indexed: false },
      { name: 'createdBy', type: 'address', indexed: false }
    ]
  },
  {
    name: 'ConfigUpdated',
    type: 'event',
    inputs: [
      { name: 'configId', type: 'uint256', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'configKey', type: 'string', indexed: false },
      { name: 'configValue', type: 'string', indexed: false },
      { name: 'updatedAt', type: 'uint256', indexed: false }
    ]
  },
  {
    name: 'ConfigRemoved',
    type: 'event',
    inputs: [
      { name: 'configId', type: 'uint256', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'configKey', type: 'string', indexed: false }
    ]
  }
];
