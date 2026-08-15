"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import SafeImage from "@/components/shared/SafeImage";
import NotificationBell from "@/components/shared/NotificationBell";
import { pickSajuAvatar } from "@/lib/defaults";

// 점집 전용 상단 바.
// - 좌측 상단: 사주메이트 로고 대신 "상담사 프로필 사진(또는 점집 로고) + 상담사 이름".
// - 메인 페이지로 가는 링크는 일절 두지 않는다(상담사 세계 안에서만 이동).
// - 우측: 구매회원용 장바구니/내정보 진입만 제공.
export default function SellerShopHeader({
  sellerName,
  sellerLogo,
  sellerSlug,
  sellerId,
  showLive,
  liveHref,
}: {
  sellerName: string;
  sellerLogo: string | null;
  sellerSlug: string;
  sellerId?: string;
  showLive?: boolean;
  liveHref?: string | null;
}) {
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-50 border-b border-brand-100/70 bg-white/90 backdrop-blur-xl">
      <div className="flex items-center justify-between h-14 px-4">
        {/* 좌측: 상담사 로고 + 이름 — 항상 점집 홈으로 이동 (라이브 여부 무관) */}
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            href={`/shop/${sellerSlug}`}
            scroll={true}
            className="flex items-center gap-2.5 min-w-0"
          >
            <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-xl bg-brand-50 ring-1 ring-brand-100">
              <SafeImage
                src={sellerLogo}
                placeholder={pickSajuAvatar(sellerId || sellerSlug)}
                alt={sellerName}
                width={36}
                height={36}
                fallbackText={sellerName.charAt(0)}
              />
            </div>
            <span className="truncate text-[15px] font-extrabold tracking-[-0.02em] text-brand-950">{sellerName}</span>
          </Link>
        </div>

        {/* 우측: 비로그인 → 점집 전용 로그인/회원가입, 로그인 → 알림 */}
        {session ? (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {/* 알림 버튼 — 모든 사용자 노출 */}
            <NotificationBell className="text-gray-800" size={32} buttonClassName="p-3" />
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* 점집 독립 로그인/가입 — 사주메이트 메인과 분리된 점집 전용 화면 */}
            <Link
              href={`/shop/${sellerSlug}/login`}
              className="rounded-full border border-brand-100 px-3 py-1.5 text-[13px] font-medium text-brand-700 transition-colors hover:bg-brand-50"
            >
              로그인
            </Link>
            <Link
              href={`/shop/${sellerSlug}/join`}
              className="rounded-full bg-brand-700 px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-800"
            >
              회원가입
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
