export const AGENT_FACTORY_ABI = const AGENT_FACTORY_ABI = [
  // 模板管理函数
  {
    name: 'createTemplate',
    type: 'function',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'baseURI', type: 'string' },
      { name: 'endpointTypes', type: 'string[]' },
      { name: 'endpointURIs', type: 'string[]' },
      { name: 'protocols', type: 'string[]' },
      { name: 'endpointNames', type: 'string[]' },
      { name: 'configKeys', type: 'string[]' },
      { name: 'configValues', type: 'string[]' },
      { name: 'dataTypes', type: 'string[]' }
    ],
    outputs: [{ name: 'templateId', type: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    name: 'updateTemplate',
    type: 'function',
    inputs: [
      { name: 'templateId', type: 'uint256' },
      { name: 'name', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'baseURI', type: 'string' },
      { name: 'endpointTypes', type: 'string[]' },
      { name: 'endpointURIs', type: 'string[]' },
      { name: 'protocols', type: 'string[]' },
      { name: 'endpointNames', type: 'string[]' },
      { name: 'configKeys', type: 'string[]' },
      { name: 'configValues', type: 'string[]' },
      { name: 'dataTypes', type: 'string[]' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'setTemplateActive',
    type: 'function',
    inputs: [
      { name: 'templateId', type: 'uint256' },
      { name: 'isActive', type: 'bool' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  
  // Agent 创建函数
  {
    name: 'createAgentFromTemplate',
    type: 'function',
    inputs: [{ name: 'templateId', type: 'uint256' }],
    outputs: [{ name: 'agentId', type: 'uint256' }],
    stateMutability: 'payable'
  },
  {
    name: 'createAgentsFromTemplate',
    type: 'function',
    inputs: [
      { name: 'templateId', type: 'uint256' },
      { name: 'count', type: 'uint256' }
    ],
    outputs: [{ name: 'agentIds', type: 'uint256[]' }],
    stateMutability: 'payable'
  },
  
  // 查询函数
  {
    name: 'getTemplate',
    type: 'function',
    inputs: [{ name: 'templateId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'templateId', type: 'uint256' },
          { name: 'name', type: 'string' },
          { name: 'description', type: 'string' },
          { name: 'baseURI', type: 'string' },
          { name: 'endpointTypes', type: 'string[]' },
          { name: 'endpointURIs', type: 'string[]' },
          { name: 'protocols', type: 'string[]' },
          { name: 'endpointNames', type: 'string[]' },
          { name: 'configKeys', type: 'string[]' },
          { name: 'configValues', type: 'string[]' },
          { name: 'dataTypes', type: 'string[]' },
          { name: 'isActive', type: 'bool' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'createdBy', type: 'address' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getAllTemplates',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'templateId', type: 'uint256' },
          { name: 'name', type: 'string' },
          { name: 'description', type: 'string' },
          { name: 'baseURI', type: 'string' },
          { name: 'endpointTypes', type: 'string[]' },
          { name: 'endpointURIs', type: 'string[]' },
          { name: 'protocols', type: 'string[]' },
          { name: 'endpointNames', type: 'string[]' },
          { name: 'configKeys', type: 'string[]' },
          { name: 'configValues', type: 'string[]' },
          { name: 'dataTypes', type: 'string[]' },
          { name: 'isActive', type: 'bool' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'createdBy', type: 'address' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    name: 'getAgentTemplates',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view'
  },
  {
    name: 'getTotalTemplates',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    name: 'getTemplateCounter',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    name: 'templateExists',
    type: 'function',
    inputs: [{ name: 'templateId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view'
  },
  
  // 事件定义
  {
    name: 'TemplateCreated',
    type: 'event',
    inputs: [
      { name: 'templateId', type: 'uint256', indexed: true },
      { name: 'name', type: 'string', indexed: false },
      { name: 'description', type: 'string', indexed: false },
      { name: 'createdBy', type: 'address', indexed: true }
    ]
  },
  {
    name: 'AgentCreated',
    type: 'event',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'templateId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'agentURI', type: 'string', indexed: false }
    ]
  }
];
