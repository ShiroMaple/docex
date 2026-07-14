/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist', 'pdf-to-png-converter'],
};

export default nextConfig;
