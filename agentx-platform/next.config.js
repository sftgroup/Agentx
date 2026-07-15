/** @type {import('next').NextConfig} */
const path = require('path')
const nextConfig = {
  output: 'standalone',
  typescript: { ignoreBuildErrors: true },
  turbopack: { root: '/home/ubuntu/agentx-platform' },
}
module.exports = nextConfig
