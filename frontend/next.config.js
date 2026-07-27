/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // FIXME: 临时禁用类型检查以绕过 @x402/* 类型解析问题。
  //        待 @x402 提供正确的类型声明后应移除 ignoreBuildErrors。
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
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
