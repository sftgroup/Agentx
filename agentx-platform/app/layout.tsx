import type { Metadata } from 'next'
import './globals.css'
import { CustomWagmiProvider } from '@/components/providers/WagmiProvider'

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME || 'AgentX — Decentralized AI Agent Platform',
  description: 'Mint, trade, and use AI Agents on-chain. Your Agent, your rules.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased">
        <CustomWagmiProvider>
          {children}
        </CustomWagmiProvider>
      </body>
    </html>
  )
}
