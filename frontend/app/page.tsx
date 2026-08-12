'use client'

import Link from 'next/link'
import { Hexagon, Shield, Key, Users, Terminal, ArrowRight, Sparkles, Cpu, Lock, Globe, Zap, Coins } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Header } from '@/components/layout/Header'

export default function HomePage() {
  const { t } = useTranslation()

  const pillars = [
    { icon: Lock, title: t('home.pillar1Title'), desc: t('home.pillar1Desc'), accent: 'purple' },
    { icon: Terminal, title: t('home.pillar2Title'), desc: t('home.pillar2Desc'), accent: 'cyan' },
    { icon: Cpu, title: t('home.pillar3Title'), desc: t('home.pillar3Desc'), accent: 'blue' },
    { icon: Globe, title: t('home.pillar4Title'), desc: t('home.pillar4Desc'), accent: 'pink' },
  ]

  const steps = [
    { step: '01', icon: Sparkles, title: t('home.step1Title'), desc: t('home.step1Desc') },
    { step: '02', icon: Shield, title: t('home.step2Title'), desc: t('home.step2Desc') },
    { step: '03', icon: Coins, title: t('home.step3Title'), desc: t('home.step3Desc') },
  ]

  const securityRows = [
    { label: t('home.secCreator'), action: t('home.secCreatorAction'), color: 'purple' },
    { label: t('home.secOnChain'), action: t('home.secOnChainAction'), color: 'cyan' },
    { label: t('home.secSubscriber'), action: t('home.secSubscriberAction'), color: 'blue' },
  ]

  return (
    <div className="min-h-screen bg-bg text-text-primary font-sans overflow-x-hidden">
      {/* Shared header (unified nav across all pages, incl. Business + mobile nav) */}
      <Header />

      {/* Hero */}
      <section className="relative pt-20 pb-24 px-6 grid-bg">
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-accent-purple/6 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute top-40 right-1/4 w-[400px] h-[400px] bg-accent-cyan/5 blur-[100px] rounded-full pointer-events-none" />

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-accent-purple/20 bg-accent-purple/5 text-accent-purple text-xs font-medium mb-8">
            <div className="w-1.5 h-1.5 rounded-full bg-accent-purple animate-pulse" />
            {t('home.badge')}
          </div>

          <h1 className="heading-xl mb-6">
            {t('home.heroTitle1')}
            <br />
            <span className="gradient-text">{t('home.heroTitle2')}</span>
          </h1>

          <p className="body-lg max-w-2xl mx-auto mb-10">
            {t('home.heroDesc')}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/studio" className="btn-primary text-base px-8 py-3.5">
              <Sparkles className="w-4 h-4" />
              {t('home.createAgent')}
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/marketplace" className="btn-secondary text-base px-8 py-3.5">
              <Globe className="w-4 h-4" />
              {t('home.exploreMarket')}
            </Link>
          </div>

          {/* Stats row */}
          <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { value: '1,247', label: t('home.statAgents') },
              { value: '93%', label: t('home.statRevenue') },
              { value: '6', label: t('home.statModules') },
              { value: '∞', label: t('home.statLLMs') },
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
            <p className="caption uppercase tracking-widest text-accent-purple mb-3">{t('home.whyTitle')}</p>
            <h2 className="heading-lg mb-4">{t('home.whyHeadline')}</h2>
            <p className="body-lg max-w-xl mx-auto">{t('home.whyDesc')}</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {pillars.map((p, i) => (
              <div key={p.title} className="glass-card glass-card-hover p-8 fade-up" style={{ animationDelay: `${i * 0.1}s` }}>
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

      {/* How It Works */}
      <section className="py-28 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="caption uppercase tracking-widest text-accent-purple mb-3">{t('home.howTitle')}</p>
            <h2 className="heading-lg mb-4">{t('home.howHeadline')}</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((s, i) => (
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

      {/* Security Model */}
      <section className="py-28 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="glass-card p-10 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-accent-purple/5 blur-[80px] rounded-full" />
            <div className="relative grid md:grid-cols-2 gap-10 items-center">
              <div>
                <p className="caption uppercase tracking-widest text-accent-purple mb-3">{t('home.securityTitle')}</p>
                <h2 className="heading-md mb-4">{t('home.securityHeadline')}</h2>
                <p className="body text-text-secondary mb-6 leading-relaxed">
                  {t('home.securityDesc')}
                </p>
                <div className="space-y-3 text-sm text-text-secondary">
                  {[t('home.securityItem1'), t('home.securityItem2'), t('home.securityItem3'), t('home.securityItem4')].map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-accent-cyan" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {securityRows.map((row, i) => (
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
              <h2 className="heading-md mb-4">{t('home.ctaTitle')}</h2>
              <p className="body-lg text-text-secondary mb-8 max-w-lg mx-auto">
                {t('home.ctaDesc')}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/studio" className="btn-primary text-base px-8 py-3.5">
                  <Zap className="w-4 h-4" />
                  {t('home.startBuilding')}
                </Link>
                <a href="https://github.com/sftgroup/Agentx" target="_blank" rel="noopener" className="btn-secondary text-base px-8 py-3.5">
                  <Terminal className="w-4 h-4" />
                  {t('home.readDocs')}
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
            <span>{t('home.footer')}</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-text-muted">
            <a href="https://github.com/sftgroup/Agentx" className="hover:text-text-secondary transition-colors">{t('home.footerGithub')}</a>
            <span>OxaChain L1</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
