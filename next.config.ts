import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true, // Next 16: caching is opt-in; base stays dynamic
}

export default nextConfig
