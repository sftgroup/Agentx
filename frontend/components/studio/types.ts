// components/studio/types.ts — Shared types & validation for Studio routes
'use client'

export type Skill = { name: string; description: string; endpoint?: string }

export type AgentForm = {
  name: string; description: string; prompt: string; tags: string
  pricingType: 'subscription' | 'per-use'; price: string
  skills: Skill[]
}

export function makeEmptyForm(): AgentForm {
  return { name: '', description: '', prompt: '', tags: '', pricingType: 'subscription', price: '', skills: [] }
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
