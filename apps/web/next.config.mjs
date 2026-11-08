/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@udyamone/shared-types'],
  reactStrictMode: true,
  output: 'standalone'
};

export default nextConfig;
