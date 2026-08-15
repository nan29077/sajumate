import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import "./globals.css";
import Providers from "@/components/shared/Providers";
import NavigationProgress from "@/components/shared/NavigationProgress";
import { getFeatureFlags } from "@/lib/settings";
import ThemeEffect from "@/components/shared/ThemeEffect";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 실제 접속한 도메인(클라우드플레어 터널 등)을 요청 헤더에서 읽어 og:image / og:url 의
// 절대 URL 을 만든다. 터널 URL 이 바뀌어도 .env 수정·재시작 없이 자동으로 맞춰지고,
// localhost 가 카드에 박히는 문제를 막는다. 헤더가 없으면 NEXT_PUBLIC_APP_URL 로 폴백.
function resolveBaseUrl(): string {
  try {
    const h = headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    if (host) {
      const proto =
        h.get("x-forwarded-proto") ||
        (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // 정적 렌더링 등 헤더를 못 읽는 상황에서는 아래 환경변수로 폴백한다.
  }
  return process.env.NEXT_PUBLIC_APP_URL || "https://sajumate.co.kr";
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const baseMetadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://sajumate.co.kr"),
  title: "사주메이트 - 라이브 점사 예약 플랫폼",
  description:
    "방송하는 동안 예약이 알아서 들어옵니다. 유튜브·SNS 사주·신점·타로 상담사를 위한 예약 커머스",
  keywords: ["사주메이트", "사주", "신점", "타로", "궁합", "작명", "라이브 상담", "점사 예약"],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: "/favicon.png", sizes: "64x64", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "사주메이트 - 라이브 점사 예약 플랫폼",
    description:
      "방송하는 동안 예약이 알아서 들어옵니다. 유튜브·SNS 사주·신점·타로 상담사를 위한 예약 커머스",
    url: "/",
    siteName: "사주메이트",
    locale: "ko_KR",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "사주메이트 - 라이브 점사 예약 플랫폼",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "사주메이트 - 라이브 점사 예약 플랫폼",
    description:
      "방송하는 동안 예약이 알아서 들어옵니다. 유튜브·SNS 사주·신점·타로 상담사를 위한 예약 커머스",
    images: ["/og-image.png"],
  },
};

export async function generateMetadata(): Promise<Metadata> {
  // 요청한 도메인을 기준으로 절대 URL 을 다시 계산한다(카톡·SNS 카드 이미지용).
  const resolvedMetadata: Metadata = {
    ...baseMetadata,
    metadataBase: new URL(resolveBaseUrl()),
  };

  let customFavicon = "";
  try {
    const row = await prisma.setting.findUnique({ where: { key: "site.faviconUrl" }, select: { value: true } });
    customFavicon = row?.value?.trim() || "";
  } catch {
    // 설정 조회 실패 시 코드에 포함된 초승달 파비콘을 사용한다.
  }

  if (!customFavicon) return resolvedMetadata;

  return {
    ...resolvedMetadata,
    icons: {
      icon: [
        { url: customFavicon },
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/favicon.ico", type: "image/x-icon" },
      ],
      apple: customFavicon,
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const flags = await getFeatureFlags();
  return (
    <html lang="ko">
      <body className="min-h-screen">
        <Providers flags={flags}>
          <ThemeEffect flags={flags} />
          <Suspense fallback={null}>
            <NavigationProgress />
          </Suspense>
          {children}
        </Providers>
      </body>
    </html>
  );
}
