// app/studio/page.tsx — Redirect to step 1
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function StudioPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/studio/basics') }, [router])
  return null
}
