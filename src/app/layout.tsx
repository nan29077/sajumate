import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import Providers from "@/components/shared/Providers";
import NavigationProgress from "@/components/shared/NavigationProgress";
import { getFeatureFlags } from "@/lib/settings";
import ThemeEffect from "@/components/shared/ThemeEffect";
import { prisma } from "@/lib/prisma";
import {
  SOCIAL_SHARE_IMAGE_PATH,
  absolutePublicUrl,
  resolveRequestOrigin,
} from "@/lib/siteUrl";

export const dynamic = "force-dynamic";

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
  },
  twitter: {
    card: "summary_large_image",
    title: "사주메이트 - 라이브 점사 예약 플랫폼",
    description:
      "방송하는 동안 예약이 알아서 들어옵니다. 유튜브·SNS 사주·신점·타로 상담사를 위한 예약 커머스",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  // metadataBase만 바꾸면 Next가 상대 이미지 URL을 이전 환경값으로 먼저 확정할 수 있다.
  // 카카오 크롤러가 localhost/만료된 터널을 보지 않도록 URL과 이미지를 모두 절대 주소로 넣는다.
  const origin = resolveRequestOrigin();
  const shareImageUrl = absolutePublicUrl(SOCIAL_SHARE_IMAGE_PATH, origin);
  const resolvedMetadata: Metadata = {
    ...baseMetadata,
    metadataBase: new URL(origin),
    alternates: { canonical: origin },
    openGraph: {
      ...baseMetadata.openGraph,
      url: origin,
      images: [
        {
          url: shareImageUrl,
          secureUrl: shareImageUrl,
          type: "image/png",
          width: 1200,
          height: 630,
          alt: "사주메이트 - 라이브 점사 예약 플랫폼",
        },
      ],
    },
    twitter: {
      ...baseMetadata.twitter,
      images: [shareImageUrl],
    },
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
