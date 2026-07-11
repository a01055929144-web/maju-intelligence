/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      "/api/admin/migrate": ["./supabase/**/*.sql"]
    }
  }
};

export default nextConfig;
