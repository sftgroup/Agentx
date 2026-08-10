/** @type {import('next').NextConfig} */
// 代码审查 D1：已移除 typescript.ignoreBuildErrors / eslint.ignoreDuringBuilds
// 历史豁免（@x402/* 类型解析问题已不存在，typecheck 零错误），恢复构建期检查。
const nextConfig = {
  output: 'standalone',
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
  webpack: (config) => {
    // Ignore missing @x402/* sub-dependencies (Solana SVM) pulled by @coinbase/cdp-sdk
    config.resolve.alias = {
      ...config.resolve.alias,
      '@x402/evm': false,
      '@x402/svm': false,
    }
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@x402/evm': false,
      '@x402/svm': false,
    }
    return config
  },
  // P2 #16: Studio route split — redirect /studio to /studio/basics
  async redirects() {
    return [
      { source: '/studio', destination: '/studio/basics', permanent: false },
    ]
  },
}

module.exports = nextConfig
