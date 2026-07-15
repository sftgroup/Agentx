'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, ShoppingBag, Brain, BarChart3, Users,
  Zap, Settings, ChevronLeft, ChevronRight, Sparkles, Terminal,
} from 'lucide-react'
import { WalletStatus } from '@/components/wallet/WalletStatus'

const navigation = [
  { name: 'Home', href: '/', icon: Home },
  { name: 'Marketplace', href: '/marketplace', icon: ShoppingBag },
  { name: 'Studio', href: '/studio', icon: Sparkles, highlight: true },
  {
    name: 'Dashboard',
    href: '/dashboard/agent',
    icon: BarChart3,
    description: 'Manage your Agents'
  },
  { name: 'A2A Tasks', href: '/a2a', icon: Terminal, description: 'Agent collaboration' },
]

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const pathname = usePathname()

  return (
    <aside className={`
      border-r border-white/5 bg-bg/80 transition-all duration-300
      ${isCollapsed ? 'w-16' : 'w-60'}
      hidden md:block
    `}>
      <div className="flex flex-col h-full">
        <div className="flex justify-end p-4 border-b border-white/5">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-white/5 rounded-lg transition-colors"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 p-3">
          <ul className="space-y-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              const Icon = item.icon

              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm
                      ${isActive
                        ? 'bg-accent-purple/10 text-accent-purple ring-1 ring-accent-purple/20'
                        : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
                      }
                      ${item.highlight && !isActive ? 'text-accent-purple' : ''}
                    `}
                    title={isCollapsed ? item.name : undefined}
                  >
                    <Icon className="w-4.5 h-4.5 flex-shrink-0" />
                    {!isCollapsed && (
                      <div className="flex flex-col">
                        <span className="font-medium">{item.name}</span>
                        {item.description && (
                          <span className="text-[11px] text-text-muted mt-0.5">{item.description}</span>
                        )}
                      </div>
                    )}
                    {item.highlight && !isCollapsed && (
                      <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-md bg-accent-purple/20 text-accent-purple font-medium">NEW</span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {!isCollapsed && (
          <div className="p-3 border-t border-white/5">
            <div className="bg-white/3 rounded-lg p-3">
              <WalletStatus />
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
