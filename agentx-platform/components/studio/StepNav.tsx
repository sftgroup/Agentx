// components/studio/StepNav.tsx — Shared Back/Next navigation
'use client'

import { useRouter } from 'next/navigation'
import { ArrowRight, ArrowLeft } from 'lucide-react'
import { useStudio } from './StudioContext'
import { validateBasics, validateSkills, validatePublish } from './types'

interface Props { step: number }

const ROUTES = ['/studio/basics', '/studio/skills', '/studio/encrypt', '/studio/publish']

export function StepNav({ step }: Props) {
  const router = useRouter()
  const { form, setFieldErrors } = useStudio()

  if (step === 4) return null // publish handles navigation itself

  return (
    <div className="flex justify-between">
      <button
        onClick={() => { setFieldErrors({}); router.push(ROUTES[step - 2]) }}
        disabled={step === 1}
        className="btn-secondary text-sm px-4 py-2 disabled:opacity-30">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <button
        onClick={() => {
          let errs: Record<string, string> = {}
          if (step === 1) errs = validateBasics(form)
          else if (step === 2) errs = validateSkills(form)
          else if (step === 3) errs = validatePublish(form)
          setFieldErrors(errs)
          if (Object.keys(errs).length === 0) router.push(ROUTES[step])
        }}
        className="btn-primary text-sm px-6 py-2">
        Next <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  )
}
