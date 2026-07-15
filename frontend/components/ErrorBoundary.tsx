// components/ErrorBoundary.tsx — Global Error Boundary
'use client'

import { Component, type ReactNode } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean; error?: Error }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary]', error.message, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="min-h-screen flex items-center justify-center bg-background-dark p-6">
          <div className="glass-card p-8 max-w-md w-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-400/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-sm text-text-secondary mb-2">{this.state.error?.message || 'An unexpected error occurred'}</p>
            <div className="flex gap-3 justify-center mt-6">
              <button onClick={() => this.setState({ hasError: false, error: undefined })}
                className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
                <RefreshCw className="w-4 h-4" /> Retry
              </button>
              <Link href="/" className="btn-secondary text-sm py-2 px-4 flex items-center gap-2">
                <Home className="w-4 h-4" /> Home
              </Link>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
