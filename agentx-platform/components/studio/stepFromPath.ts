// components/studio/stepFromPath.ts
'use client'

import { usePathname } from 'next/navigation'

const STEP_MAP: Record<string, number> = {
  '/studio/basics': 1,
  '/studio/skills': 2,
  '/studio/encrypt': 3,
  '/studio/publish': 4,
}

export function useCurrentStep(): number {
  const pathname = usePathname()
  return STEP_MAP[pathname] ?? 1
}
