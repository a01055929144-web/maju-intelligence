/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: "/map", destination: "/dashboard?routeMode=map" },
      { source: "/leads", destination: "/dashboard?routeMode=leads" }
    ];
  },
  async headers() {
    return [
      {
        source: "/maps/sales-areas/2025/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" }
        ]
      }
    ];
  }
};

export default nextConfig;
