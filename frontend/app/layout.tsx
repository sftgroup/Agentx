import type { Metadata, Viewport } from 'next'
import './globals.css'
import { CustomWagmiProvider } from '@/components/providers/WagmiProvider'
import { ErrorBoundary } from '@/components/ErrorBoundary'

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME || 'AgentX — Decentralized AI Agent Platform',
  description: 'Mint, trade, and use AI Agents on-chain. E2E encrypted, subscription-gated. Build once, earn forever.',
  keywords: ['AI Agent', 'blockchain', 'decentralized', 'E2E encryption', 'AgentX', 'Web3', 'subscription'],
  authors: [{ name: 'AgentX Team' }],
  robots: { index: true, follow: true },
  openGraph: {
    title: 'AgentX — Decentralized AI Agent Platform',
    description: 'Mint, trade, and use AI Agents on-chain. E2E encrypted.',
    type: 'website',
    siteName: 'AgentX',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AgentX — Decentralized AI Agent Platform',
    description: 'Mint, trade, and use AI Agents on-chain.',
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0a0f',
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
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </CustomWagmiProvider>
      </body>
    </html>
  )
}
