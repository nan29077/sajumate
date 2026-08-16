import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSellerLive, sellerProfileImage } from "@/lib/sellerLive";

export const dynamic = "force-dynamic";

// 상담사 이름 검색(자동완성) — 메인 페이지 히어로 검색에서 사용.
// MySQL 기본 collation 으로 대소문자 무시 검색(mode:"insensitive" 사용 불가).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();

  if (!q) {
    return NextResponse.json({ sellers: [] });
  }

  const sellers = await prisma.sellerProfile.findMany({
    where: {
      isApproved: true,
      // CONSULTANT 역할만 검색 — 셀러브릭스 SELLER 잔재 계정 제외
      user: { role: "CONSULTANT" },
      OR: [
        { shopName: { contains: q } },
        { slug: { contains: q } },
        { mood: { contains: q } },
        { category: { contains: q } },
      ],
    },
    select: {
      // id 는 sellerProfileImage() 의 동물 캐릭터 해시 시드 — 누락 시 전 상담사가 동일 캐릭터로 표시됨
      id: true,
      slug: true,
      shopName: true,
      shopLogo: true,
      category: true,
      mood: true,
      totalFans: true,
      isManualLive: true,
      user: { select: { avatar: true } },
      liveLink: true,
      liveStreams: { where: { status: "LIVE" }, take: 1, select: { id: true, shareCode: true, externalUrl: true } },
    },
    orderBy: { totalFans: "desc" },
    take: 8,
  });

  return NextResponse.json({
    sellers: sellers.map((s) => ({
      slug: s.slug,
      shopName: s.shopName,
      category: s.category,
      mood: s.mood,
      totalFans: s.totalFans,
      profileImage: sellerProfileImage(s),
      isLive: isSellerLive(s),
      liveHref: (() => {
        const live = s.liveStreams?.[0];
        // 진행중 인앱 라이브는 항상 사주메이트 시청페이지로 연결 (외부 URL 직접연결 금지)
        if (live) return `/live/${live.shareCode}`;
        if (s.liveLink) return s.liveLink;
        return null;
      })(),
      // 인앱 라이브가 없고 수동 liveLink만 있을 때에만 외부 링크로 처리
      isExternalLive: !s.liveStreams?.[0] && !!s.liveLink,
    })),
  });
}
