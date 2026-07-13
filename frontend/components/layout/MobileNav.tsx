// components/layout/MobileNav.tsx — Mobile hamburger menu
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, Home, ShoppingBag, Sparkles, BarChart3, Terminal } from 'lucide-react'

const navigation = [
  { name: 'Home', href: '/', icon: Home },
  { name: 'Marketplace', href: '/marketplace', icon: ShoppingBag },
  { name: 'Studio', href: '/studio', icon: Sparkles },
  { name: 'Dashboard', href: '/dashboard/agent', icon: BarChart3 },
  { name: 'A2A Tasks', href: '/a2a', icon: Terminal },
]

export function MobileNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <div className="md:hidden">
      <button onClick={() => setOpen(true)} className="p-2 text-text-primary">
        <Menu className="w-5 h-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-bg border-r border-white/10 p-4 z-10">
            <div className="flex justify-between items-center mb-6">
              <span className="font-semibold text-sm">AgentX</span>
              <button onClick={() => setOpen(false)} className="p-1.5"><X className="w-4 h-4" /></button>
            </div>
            <nav>
              <ul className="space-y-1">
                {navigation.map(item => {
                  const isActive = pathname === item.href
                  return (
                    <li key={item.name}>
                      <Link href={item.href} onClick={() => setOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${
                          isActive ? 'bg-accent-purple/10 text-accent-purple' : 'text-text-secondary hover:bg-white/5'
                        }`}>
                        <item.icon className="w-4 h-4" /> {item.name}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </nav>
          </div>
        </div>
      )}
    </div>
  )
}
