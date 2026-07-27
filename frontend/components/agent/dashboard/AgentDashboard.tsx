// components/agent/dashboard/AgentDashboard.tsx
// @deprecated 此独立 Dashboard 组件将在重构中被应用级 Dashboard 页面取代。
//           请使用 app/user/dashboard/ 作为新的统一入口。
'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '@/lib/i18n'
import { useAccount, useConnect } from 'wagmi'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { 
  Brain, 
  CreditCard, 
  DollarSign, 
  Settings, 
  Globe,
  Users,
  TrendingUp,
  Zap,
  BarChart3,
  Plus,
  Server,
  FileText,
  Link as LinkIcon
} from 'lucide-react'
import { useOnChainAgentRegistry as useAgentRegistry } from '../hooks/useAgentRegistry'
import { usePaymentGateway } from '../hooks/usePaymentGateway'
import { useSubscription } from '../hooks/useSubscription'
import { useMultiEndpoint } from '../hooks/useMultiEndpoint'
import { useA2AProtocol } from '../hooks/useA2AProtocol'
import { AgentRegistration } from './AgentRegistration'
import { RevenueDisplay } from './RevenueDisplay'
import { EndpointManager } from './EndpointManager'
import { SubscriptionManager } from './SubscriptionManager'
import { AgentCardManager } from './AgentCardManager'
import { ConfigurationManager } from './ConfigurationManager'

interface AgentStats {
  totalAgents: number
  activeSubscriptions: number
  totalRevenue: string
  pendingTasks: number
  activeEndpoints: number
  totalSkills: number
}

// Agent Dashboard 侧边栏导航项
const getDashboardNav = () => [
  { id: 'overview', label: i18n.t('agentDashboard.overview'), icon: BarChart3 },
  { id: 'register', label: i18n.t('agentDashboard.registerAgent'), icon: Users },
  { id: 'revenue', label: i18n.t('agentDashboard.revenueManage'), icon: DollarSign },
  { id: 'endpoints', label: i18n.t('agentDashboard.endpointManage'), icon: Globe },
  { id: 'subscriptions', label: i18n.t('agentDashboard.subscriptionManage'), icon: CreditCard },
  { id: 'cards', label: i18n.t('agentDashboard.cardManage'), icon: TrendingUp },
  { id: 'config', label: i18n.t('agentDashboard.configManage'), icon: Settings }
]

export function AgentDashboard() {
  const { t } = useTranslation()
  const { address, isConnected } = useAccount()
  const { connectors, connect } = useConnect()
  const router = useRouter()
  const dashboardNavigation = getDashboardNav()
  
  const [activeTab, setActiveTab] = useState('overview')
  const [agentStats, setAgentStats] = useState<AgentStats>({
    totalAgents: 0,
    activeSubscriptions: 0,
    totalRevenue: '0',
    pendingTasks: 0,
    activeEndpoints: 0,
    totalSkills: 0
  })
  const [isLoading, setIsLoading] = useState(false)

  const { userAgents } = useAgentRegistry()
  const { agentEarnings } = usePaymentGateway()
  const { userSubscriptions } = useSubscription()
  const { agentEndpoints } = useMultiEndpoint()
  const { allSkills, agentSkills } = useA2AProtocol()

  const connectWallet = async (connector: any) => {
    try {
      await connect({ connector })
    } catch (error) {
      console.error(t('agentDashboard.connectFailed') + ':', error)
    }
  }

  useEffect(() => {
    if (isConnected && address) {
      updateAgentStats()
    }
  }, [isConnected, address, userAgents, agentEarnings, userSubscriptions, agentEndpoints, allSkills, agentSkills])

  // 修复：计算总收益 - 包含支付收益和订阅收益
  const calculateTotalRevenue = (): string => {
    const paymentRevenue = Number(agentEarnings) / 1e18
    const subscriptionRevenue = userSubscriptions
      .filter((sub: any) => sub.status === 0)
      .reduce((sum: number, sub: any) => {
        const totalPaid = Number(sub.totalPaid || 0) / 1e18
        return sum + totalPaid
      }, 0)

    const totalRevenue = paymentRevenue + subscriptionRevenue
    return totalRevenue.toFixed(4)
  }

  const updateAgentStats = async () => {
    if (!address || !isConnected) return
    
    setIsLoading(true)
    try {
      const totalAgents = userAgents.length
      const activeSubscriptions = userSubscriptions.filter((sub: any) => {
        const isActive = sub.status === 0
        const now = Math.floor(Date.now() / 1000)
        const nextBillingDate = Number(sub.nextBillingDate || 0)
        return isActive && nextBillingDate > now
      }).length

      const totalRevenue = calculateTotalRevenue()
      const activeEndpoints = agentEndpoints.filter((endpoint: any) => endpoint.isActive).length
      const totalSkills = allSkills.length

      setAgentStats({
        totalAgents,
        activeSubscriptions,
        totalRevenue,
        pendingTasks: 0,
        activeEndpoints,
        totalSkills
      })

    } catch (error) {
      console.error('Failed to update agent stats:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const statsCards = [
    {
      name: t('agentDashboard.agentCount'),
      value: agentStats.totalAgents.toString(),
      icon: Brain,
      description: t('agentDashboard.agentCountDesc')
    },
    {
      name: t('agentDashboard.activeSubsCount'),
      value: agentStats.activeSubscriptions.toString(),
      icon: CreditCard,
      description: t('agentDashboard.activeSubsCountDesc')
    },
    {
      name: t('agentDashboard.totalRevenueLabel'),
      value: `${agentStats.totalRevenue} ETH`,
      icon: DollarSign,
      description: t('agentDashboard.totalRevenueDesc')
    },
    {
      name: t('agentDashboard.activeEndpointsLabel'),
      value: agentStats.activeEndpoints.toString(),
      icon: Globe,
      description: t('agentDashboard.activeEndpointsDesc')
    },
    {
      name: t('agentDashboard.skillsCount'),
      value: agentStats.totalSkills.toString(),
      icon: Zap,
      description: t('agentDashboard.skillsCountDesc')
    }
  ]

  const quickActions = [
    {
      name: t('agentDashboard.registerNew'),
      description: t('agentDashboard.registerNewDesc'),
      icon: Plus,
      action: () => setActiveTab('register'),
      color: 'blue'
    },
    {
      name: t('agentDashboard.manageEndpoints'),
      description: t('agentDashboard.manageEndpointsDesc'),
      icon: Server,
      action: () => setActiveTab('endpoints'),
      color: 'green'
    },
    {
      name: t('agentDashboard.manageSubscriptions'),
      description: t('agentDashboard.manageSubscriptionsDesc'),
      icon: FileText,
      action: () => setActiveTab('subscriptions'),
      color: 'purple'
    },
    {
      name: t('agentDashboard.viewRevenue'),
      description: t('agentDashboard.viewRevenueDesc'),
      icon: TrendingUp,
      action: () => setActiveTab('revenue'),
      color: 'orange'
    }
  ]

  // 未连接钱包时的显示
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
            <Brain className="w-16 h-16 text-blue-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('agentDashboard.connectWalletTitle')}</h2>
            <p className="text-gray-600 mb-6">{t('agentDashboard.connectWalletDesc')}</p>
            <div className="space-y-3">
              {connectors.map((connector) => (
                <button
                  key={connector.id}
                  onClick={() => connectWallet(connector)}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  {t('agentDashboard.connectBtn', { name: connector.name })}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 主内容区 */}
      <main className="flex-1 flex flex-col">
        {/* 移动端标签导航 */}
        <div className="md:hidden border-t border-gray-200 bg-white">
          <nav className="-mb-px flex space-x-4 overflow-x-auto px-4">
            {dashboardNavigation.slice(0, 4).map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 p-6">
          {/* 桌面端标签导航 */}
          <div className="hidden md:block border-b border-gray-200 mb-8">
            <nav className="-mb-px flex space-x-8">
              {dashboardNavigation.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                )
              })}
            </nav>
          </div>

          {/* 标签内容 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
            {activeTab === 'overview' && (
              <div className="p-6">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">{t('agentDashboard.overview')}</h2>
                    <p className="text-gray-600 mt-1">{t('agentDashboard.overviewDesc')}</p>
                  </div>
                </div>
                
                {isLoading ? (
                  <div className="flex justify-center items-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : (
                  <>
                    {/* 统计卡片 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
                      {statsCards.map((stat) => {
                        const Icon = stat.icon
                        return (
                          <div key={stat.name} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-all duration-300">
                            <div className="flex items-start space-x-4">
                              <div className="bg-blue-50 rounded-xl p-3">
                                <Icon className="w-6 h-6 text-blue-600" />
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                                <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                                <p className="text-xs text-gray-500 mt-1">{stat.description}</p>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* 快速操作 */}
                    <div className="mb-8">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('agentDashboard.quickActions')}</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {quickActions.map((action, index) => {
                          const Icon = action.icon
                          const colorClasses = {
                            blue: 'bg-blue-50 border-blue-200 hover:bg-blue-100',
                            green: 'bg-green-50 border-green-200 hover:bg-green-100',
                            purple: 'bg-purple-50 border-purple-200 hover:bg-purple-100',
                            orange: 'bg-orange-50 border-orange-200 hover:bg-orange-100'
                          }
                          
                          return (
                            <button
                              key={index}
                              onClick={action.action}
                              className={`p-4 rounded-xl border text-left transition-all duration-300 ${colorClasses[action.color as keyof typeof colorClasses]}`}
                            >
                              <div className="flex items-center space-x-3">
                                <div className={`p-2 rounded-lg ${
                                  action.color === 'blue' ? 'bg-blue-100 text-blue-600' :
                                  action.color === 'green' ? 'bg-green-100 text-green-600' :
                                  action.color === 'purple' ? 'bg-purple-100 text-purple-600' :
                                  'bg-orange-100 text-orange-600'
                                }`}>
                                  <Icon className="w-5 h-5" />
                                </div>
                                <div>
                                  <h4 className="font-semibold text-gray-900">{action.name}</h4>
                                  <p className="text-sm text-gray-600 mt-1">{action.description}</p>
                                </div>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* 最近活动 */}
                    <div className="mb-8">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('agentDashboard.recentActivity')}</h3>
                      <div className="bg-gray-50 rounded-xl p-6 text-center">
                        <div className="text-gray-400 mb-2">
                          <BarChart3 className="w-8 h-8 mx-auto" />
                        </div>
                        <p className="text-gray-600">{t('agentDashboard.noRecentActivity')}</p>
                        <p className="text-sm text-gray-500 mt-1">{t('agentDashboard.noRecentActivityDesc')}</p>
                      </div>
                    </div>

                    {/* A2A协议状态 */}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('agentDashboard.a2aStatus')}</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-semibold text-blue-900">{t('agentDashboard.systemSkills')}</h4>
                              <p className="text-blue-700 text-sm mt-1">{t('agentDashboard.systemSkillsDesc')}</p>
                            </div>
                            <div className="text-2xl font-bold text-blue-600">
                              {allSkills.length}
                            </div>
                          </div>
                        </div>
                        <div className="bg-green-50 rounded-xl p-6 border border-green-200">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-semibold text-green-900">{t('agentDashboard.agentSkillsCount')}</h4>
                              <p className="text-green-700 text-sm mt-1">{t('agentDashboard.agentSkillsCountDesc')}</p>
                            </div>
                            <div className="text-2xl font-bold text-green-600">
                              {agentSkills.length}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'register' && <AgentRegistration />}
            {activeTab === 'revenue' && <RevenueDisplay />}
            {activeTab === 'endpoints' && <EndpointManager />}
            {activeTab === 'subscriptions' && <SubscriptionManager />}
            {activeTab === 'cards' && <AgentCardManager />}
            {activeTab === 'config' && <ConfigurationManager />}
          </div>
        </div>
      </main>
    </div>
  )
}
