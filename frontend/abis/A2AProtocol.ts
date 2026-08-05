// abis/A2AProtocol.ts — A2AProtocolRegistry ABI (canonical)
//
// Single source of truth for A2A task creation/query ABIs.
// Consumers MUST import from here instead of defining inline ABIs.

export const A2A_CREATE_TASK_ABI = {
  inputs: [{ name: 'agentId', type: 'uint256' }, { name: 'taskType', type: 'string' }, { name: 'inputData', type: 'string' }],
  name: 'createTask', outputs: [{ name: 'taskId', type: 'uint256' }], stateMutability: 'nonpayable', type: 'function',
} as const

export const A2A_COMPLETE_TASK_ABI = {
  inputs: [{ name: 'taskId', type: 'uint256' }, { name: 'outputData', type: 'string' }, { name: 'status', type: 'uint256' }],
  name: 'completeTask', outputs: [], stateMutability: 'nonpayable', type: 'function',
} as const

export const A2A_TASK_ABI = {
  inputs: [{ name: 'taskId', type: 'uint256' }], name: 'getTask',
  outputs: [
    { name: 'taskId', type: 'uint256' }, { name: 'agentId', type: 'uint256' }, { name: 'taskType', type: 'string' },
    { name: 'inputData', type: 'string' }, { name: 'outputData', type: 'string' }, { name: 'status', type: 'uint256' },
    { name: 'clientAddress', type: 'address' }, { name: 'createdAt', type: 'uint256' }, { name: 'completedAt', type: 'uint256' },
  ], stateMutability: 'view', type: 'function',
} as const

export const A2A_USER_TASKS_ABI = {
  inputs: [{ name: 'user', type: 'address' }], name: 'getUserTasks',
  outputs: [{ name: '', type: 'uint256[]' }], stateMutability: 'view', type: 'function',
} as const
