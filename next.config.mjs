/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  optimizePackageImports: ['lucide-react', 'recharts'],
}

export default nextConfig
