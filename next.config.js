/** @type {import('next').NextConfig} */
const nextConfig = {
  // 개발 서버의 .next 잠금과 충돌하지 않도록 검증 빌드에서만 별도 출력 경로를 허용한다.
  distDir: process.env.NEXT_AUDIT_DIST_DIR || ".next",
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }
    return config;
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
    unoptimized: true,
    minimumCacheTTL: 86400,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  allowedDevOrigins: [
    "*.sandbox.novita.ai",
    "*.sandbox.gensparksite.com",
    "*.e2b.dev",
  ],
  // output file tracing 비활성화.
  // @vercel/nft 가 Prisma 런타임의 동적 경로를 추적하면서 사용자 홈 디렉터리 전체를 glob 하는데,
  // Windows 의 레거시 정션(Application Data, Cookies 등)에서 EPERM 이 나 빌드가 실패한다.
  // 이 앱은 output: "standalone" 을 쓰지 않으므로 트레이싱 결과물이 필요 없다.
  outputFileTracing: false,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/og-image.png",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, s-maxage=604800, immutable" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ],
      },
    ];
  },
  compress: true,
  reactStrictMode: false,
  experimental: {
    optimizePackageImports: ["date-fns", "@prisma/client"],
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

module.exports = nextConfig;
