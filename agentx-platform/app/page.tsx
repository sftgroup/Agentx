'use client'

import Link from 'next/link'
import { Hexagon, Shield, Key, Users, Terminal, ArrowRight, Sparkles, Cpu, Lock, Globe, Zap, Coins } from 'lucide-react'

const navLinks = [
  { href: '/marketplace', label: 'Marketplace' },
  { href: '/studio', label: 'Studio' },
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-bg text-text-primary font-sans overflow-x-hidden">
      {/* Nav */}
      <header className="fixed top-0 inset-x-0 z-50 border-b border-white/5 bg-bg/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto flex items-center justify-between h-16 px-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-purple to-accent-cyan flex items-center justify-center ring-1 ring-white/10 group-hover:ring-accent-purple/50 transition-all">
              <Hexagon className="w-4 h-4 text-white" strokeWidth={2} />
            </div>
            <span className="text-lg font-bold tracking-tight">AgentX</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-6">
            {navLinks.map(l => (
              <Link key={l.href} href={l.href} className="text-sm text-text-secondary hover:text-text-primary transition-colors">
                {l.label}
              </Link>
            ))}
          </nav>
          <Link href="/studio" className="btn-primary text-sm py-2 px-4">
            <Sparkles className="w-3.5 h-3.5" />
            Create Agent
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-32 pb-24 px-6 grid-bg">
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-accent-purple/6 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute top-40 right-1/4 w-[400px] h-[400px] bg-accent-cyan/5 blur-[100px] rounded-full pointer-events-none" />

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-accent-purple/20 bg-accent-purple/5 text-accent-purple text-xs font-medium mb-8">
            <div className="w-1.5 h-1.5 rounded-full bg-accent-purple animate-pulse" />
            Now on Sepolia Testnet
          </div>

          <h1 className="heading-xl mb-6">
            Build AI Agents.
            <br />
            <span className="gradient-text">Own Them On-Chain.</span>
          </h1>

          <p className="body-lg max-w-2xl mx-auto mb-10">
            Encrypt your Agent payloads with ECIES. Sell them as subscriptions.
            Let agents collaborate via A2A protocol. The first truly decentralized agent economy — not a platform, a protocol.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/studio" className="btn-primary text-base px-8 py-3.5">
              <Sparkles className="w-4 h-4" />
              Create Your First Agent
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/marketplace" className="btn-secondary text-base px-8 py-3.5">
              <Globe className="w-4 h-4" />
              Explore Marketplace
            </Link>
          </div>

          {/* Stats row */}
          <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { value: '1,247', label: 'Agents Minted' },
              { value: '93%', label: 'Revenue to Creators' },
              { value: '6', label: 'Contract Modules' },
              { value: '∞', label: 'LLMs Supported' },
            ].map(s => (
              <div key={s.label}>
                <div className="text-2xl md:text-3xl font-bold text-text-primary">{s.value}</div>
                <div className="text-xs text-text-muted mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Product Pillars */}
      <section className="py-28 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="caption uppercase tracking-widest text-accent-purple mb-3">Why AgentX</p>
            <h2 className="heading-lg mb-4">Not Another GPT Wrapper</h2>
            <p className="body-lg max-w-xl mx-auto">
              Four pillars that make AgentX fundamentally different from every AI agent platform.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                icon: Lock,
                title: 'Encrypted Ownership',
                desc: 'AES-256-GCM + ECIES double encryption. Your Agent payload exists on IPFS as ciphertext — readable only by active subscribers with the decryption key on-chain.',
                accent: 'purple',
              },
              {
                icon: Terminal,
                title: 'Closed Skill Execution',
                desc: 'Publish proprietary strategies as remote MCP tools. Subscribers invoke them — they never see your source code. Your edge stays yours.',
                accent: 'cyan',
              },
              {
                icon: Cpu,
                title: 'Agent-to-Agent Protocol',
                desc: 'Agents talk to agents. Create autonomous chains: audit → deploy → monitor. Every step on-chain, auditable, and composable.',
                accent: 'blue',
              },
              {
                icon: Globe,
                title: 'Any Model, Anywhere',
                desc: 'Inject your Agent into any LLM via @agentx/sdk. OpenAI, Claude, local models — no lock-in. The Agent travels, the platform stays out of the way.',
                accent: 'pink',
              },
            ].map((p, i) => (
              <div
                key={p.title}
                className="glass-card glass-card-hover p-8 fade-up"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div className={`w-10 h-10 rounded-xl bg-accent-${p.accent}/10 flex items-center justify-center mb-5 ring-1 ring-accent-${p.accent}/20`}>
                  <p.icon className={`w-5 h-5 text-accent-${p.accent}`} />
                </div>
                <h3 className="text-lg font-semibold mb-3">{p.title}</h3>
                <p className="body text-text-secondary leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works — 3 Steps */}
      <section className="py-28 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="caption uppercase tracking-widest text-accent-purple mb-3">How It Works</p>
            <h2 className="heading-lg mb-4">Three Steps to Your Agent Economy</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                icon: Sparkles,
                title: 'Craft Your Agent',
                desc: 'Write a prompt. Attach skills with JSON Schemas. Connect MCP tools. All in a 4-step visual wizard.',
              },
              {
                step: '02',
                icon: Shield,
                title: 'Encrypt & Publish',
                desc: 'One-click AES + ECIES encryption. Payload goes to IPFS. Encryption key locked on-chain. Minted as an NFT.',
              },
              {
                step: '03',
                icon: Coins,
                title: 'Subscribe & Use',
                desc: 'Users subscribe with ETH on-chain. SDK auto-decrypts. Agent injected into their chat. Revenue flows to you.',
              },
            ].map((s, i) => (
              <div key={s.step} className="text-center fade-up" style={{ animationDelay: `${i * 0.15}s` }}>
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-purple/20 to-accent-cyan/10 border border-white/5 flex items-center justify-center mx-auto mb-5">
                  <s.icon className="w-7 h-7 text-accent-purple" />
                </div>
                <div className="text-xs font-bold text-accent-purple/60 mb-2">STEP {s.step}</div>
                <h3 className="text-lg font-semibold mb-2">{s.title}</h3>
                <p className="body text-text-secondary">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Highlight — Encrypted Payload diagram */}
      <section className="py-28 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="glass-card p-10 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-accent-purple/5 blur-[80px] rounded-full" />
            <div className="relative grid md:grid-cols-2 gap-10 items-center">
              <div>
                <p className="caption uppercase tracking-widest text-accent-purple mb-3">Security Model</p>
                <h2 className="heading-md mb-4">End-to-End Encrypted. On-Chain Access Control.</h2>
                <p className="body text-text-secondary mb-6 leading-relaxed">
                  Every Agent payload is AES-256-GCM encrypted before touching IPFS. The AES key is then wrapped with
                  the subscriber&apos;s ECIES public key. Only the subscription NFT holder can decrypt. No backend. No trusted third party.
                </p>
                <div className="space-y-3 text-sm text-text-secondary">
                  {[
                    'AES-256-GCM for payload encryption',
                    'ECIES (secp256k1) for key wrapping',
                    'Subscription NFT gates decryption',
                    'Compatible with @agentx/sdk out of the box',
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-accent-cyan" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {[
                  { label: 'Creator', action: 'AES encrypts payload → IPFS', color: 'purple' },
                  { label: 'On-Chain', action: 'ECIES wraps AES key → stored in metadata', color: 'cyan' },
                  { label: 'Subscriber', action: 'ECIES decrypts key → fetches IPFS → AES decrypts', color: 'blue' },
                ].map((row, i) => (
                  <div key={i} className={`flex items-center gap-4 p-4 rounded-xl bg-accent-${row.color}/5 border border-accent-${row.color}/10`}>
                    <div className={`w-8 h-8 rounded-lg bg-accent-${row.color}/10 flex items-center justify-center text-xs font-bold text-accent-${row.color}`}>
                      {i + 1}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{row.label}</div>
                      <div className="text-xs text-text-muted">{row.action}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-28 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="glass-card p-12 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-accent-purple/10 via-transparent to-accent-cyan/5" />
            <div className="relative">
              <h2 className="heading-md mb-4">Ready to Build the Agent Economy?</h2>
              <p className="body-lg text-text-secondary mb-8 max-w-lg mx-auto">
                Mint your first Agent in under 5 minutes. No backend. No platform lock-in. Just you and your Agent, on-chain.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/studio" className="btn-primary text-base px-8 py-3.5">
                  <Zap className="w-4 h-4" />
                  Start Building
                </Link>
                <a href="https://github.com/sftgroup/erc8004" target="_blank" rel="noopener" className="btn-secondary text-base px-8 py-3.5">
                  <Terminal className="w-4 h-4" />
                  Read the Docs
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-text-muted text-sm">
            <Hexagon className="w-4 h-4" />
            <span>AgentX — Decentralized AI Agent Protocol</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-text-muted">
            <a href="https://github.com/sftgroup/erc8004" className="hover:text-text-secondary transition-colors">GitHub</a>
            <span>Sepolia Testnet</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
