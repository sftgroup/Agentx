/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
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
