// app/studio/skills/page.tsx — Step 2: Agent Skills
'use client'

import { Zap } from 'lucide-react'
import { useStudio } from '@/components/studio/StudioContext'
import { StepNav } from '@/components/studio/StepNav'

export default function SkillsPage() {
  const { form, addSkill, updateSkill, removeSkill } = useStudio()

  return (
    <>
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Agent Skills (MCP Tools)</h2>
          <button onClick={addSkill} className="btn-primary text-xs py-1.5 px-3">
            <Zap className="w-3.5 h-3.5" /> Add Skill
          </button>
        </div>
        <p className="text-sm text-text-muted">
          Skills are MCP tools your Agent can invoke. Closed skills execute remotely — subscribers never see your source code.
        </p>
        {form.skills.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-white/10 rounded-xl">
            <Zap className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-30" />
            <p className="text-sm text-text-muted">No skills yet. Add MCP tools your Agent can use.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {form.skills.map((skill, i) => (
              <div key={i} className="flex gap-3 items-start p-3 rounded-xl bg-white/3 border border-white/5">
                <div className="flex-1 space-y-2">
                  <input value={skill.name} onChange={e => updateSkill(i, 'name', e.target.value)} placeholder="Skill name (e.g., get_balance)"
                    className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-cyan/40 transition-colors" />
                  <input value={skill.description} onChange={e => updateSkill(i, 'description', e.target.value)} placeholder="Description"
                    className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-cyan/40 transition-colors" />
                  <input value={skill.endpoint} onChange={e => updateSkill(i, 'endpoint', e.target.value)} placeholder="MCP endpoint URL (optional)"
                    className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-cyan/40 transition-colors" />
                </div>
                <button onClick={() => removeSkill(i)} className="text-red-400/60 hover:text-red-400 text-sm transition-colors">Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <StepNav step={2} />
    </>
  )
}
