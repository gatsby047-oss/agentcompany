/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    instrumentationHook: false
  }
};

export default nextConfig;
