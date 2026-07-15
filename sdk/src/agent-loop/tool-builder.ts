// ---------------------------------------------------------------------------
// @agentx/sdk — Tool Builder
// ---------------------------------------------------------------------------
// Converts AgentX RunnableSkill[] into OpenAI function-calling Tool JSON.
//
//   const tools = buildTools(ctx.skills)
//   // → [{ type: "function", function: { name, description, parameters } }]
// ---------------------------------------------------------------------------

import type { RunnableSkill } from '../agent/agent-runner'
import type { OpenAIToolDef } from './types'

function toOpenAIParameters(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { type: (schema.type as string) ?? 'object' }

  if (schema.properties) {
    result.properties = convertProperties(schema.properties as Record<string, Record<string, unknown>>)
  }
  if (schema.required && Array.isArray(schema.required)) {
    result.required = schema.required
  }
  if (schema.description) {
    result.description = schema.description
  }

  return result
}

function convertProperties(properties: Record<string, Record<string, unknown>>): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {}
  for (const [key, prop] of Object.entries(properties)) {
    const converted: Record<string, unknown> = {}

    if (prop.type) converted.type = prop.type
    if (prop.description) converted.description = prop.description
    if (prop.items) converted.items = prop.items
    if (prop.enum) converted.enum = prop.enum
    if (prop.properties) {
      converted.properties = convertProperties(prop.properties as Record<string, Record<string, unknown>>)
    }
    if (prop.required) converted.required = prop.required

    out[key] = converted
  }
  return out
}

export function buildTools(skills: RunnableSkill[]): OpenAIToolDef[] {
  if (!skills || skills.length === 0) return []

  return skills.map(skill => ({
    type: 'function' as const,
    function: {
      name: skill.name,
      description: skill.description || `Execute the "${skill.name}" skill`,
      parameters: toOpenAIParameters(skill.inputSchema),
    },
  }))
}

export function buildSystemPrompt(prompt: string, skills: RunnableSkill[]): string {
  if (!skills || skills.length === 0) return prompt

  const skillList = skills
    .map(s => `- **${s.name}**: ${s.description}`)
    .join('\n')

  return `${prompt}\n\n## Available Tools\nYou have access to the following tools. Use them when appropriate:\n${skillList}`
}
