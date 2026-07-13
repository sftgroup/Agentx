/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
  // P2 #16: Studio route split — redirect /studio to /studio/basics
  async redirects() {
    return [
      { source: '/studio', destination: '/studio/basics', permanent: false },
    ]
  },
}

module.exports = nextConfig
