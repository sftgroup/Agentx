// components/studio/types.ts — Shared types & validation for Studio routes
'use client'

export type Skill = { name: string; description: string; endpoint?: string }

// Must stay in sync with @agentxv2/sdk AGENT_CATEGORIES
export const AGENT_CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: 'operations', label: '运营 Operations' },
  { value: 'customer-service', label: '客服 Customer Service' },
  { value: 'sales', label: '销售 Sales' },
  { value: 'personal-assistant', label: '个人助理 Personal Assistant' },
  { value: 'coding', label: '写代码 Coding' },
  { value: 'server-monitoring', label: '服务器监控 Server Monitoring' },
  { value: 'airdrop', label: '空投 Airdrop' },
  { value: 'quant-trading', label: '量化策略 Quant Trading' },
  { value: 'data-analysis', label: '数据分析 Data Analysis' },
  { value: 'content', label: '内容创作 Content' },
  { value: 'security', label: '安全 Security' },
  { value: 'finance', label: '金融 Finance' },
  { value: 'other', label: '其他 Other' },
]

export type AgentForm = {
  name: string; description: string; prompt: string; tags: string[]
  category: string
  pricingType: 'subscription' | 'per-use'; price: string
  skills: Skill[]
}

export function makeEmptyForm(): AgentForm {
  return { name: '', description: '', prompt: '', tags: [], category: '', pricingType: 'subscription', price: '', skills: [] }
}

export const validateBasics = (form: AgentForm): Record<string, string> => {
  const errors: Record<string, string> = {}
  if (!form.name.trim()) errors.name = 'Agent name is required'
  else if (form.name.length < 3) errors.name = 'Name must be at least 3 characters'
  else if (form.name.length > 50) errors.name = 'Name must not exceed 50 characters'
  if (!form.description.trim()) errors.description = 'Description is required'
  else if (form.description.length < 20) errors.description = 'Description must be at least 20 characters'
  if (!form.prompt.trim()) errors.prompt = 'System prompt is required'
  else if (form.prompt.length < 10) errors.prompt = 'Prompt must be at least 10 characters'
  if (!form.category) errors.category = 'Category is required (drives app filtering)'
  return errors
}

export const validateSkills = (form: AgentForm): Record<string, string> => {
  const errors: Record<string, string> = {}
  form.skills.forEach((s, i) => {
    if (!s.name.trim()) errors[`skill_${i}_name`] = `Skill #${i + 1} name is required`
    // description is optional — only validate name
  })
  return errors
}

export const validatePublish = (form: AgentForm): Record<string, string> => {
  const errors: Record<string, string> = {}
  if (!form.price || Number(form.price) <= 0) errors.price = 'Price must be a positive number'
  return errors
}
