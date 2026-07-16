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
  // P2 #16: Studio route split — redirect /studio to /studio/basics
  async redirects() {
    return [
      { source: '/studio', destination: '/studio/basics', permanent: false },
    ]
  },
}

module.exports = nextConfig
