"use client";

import { Icon } from '@/components/shared/Icon';
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useTransition, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useFeatureFlags } from "@/components/shared/FeatureFlagsProvider";
import { useShopChrome } from "@/components/shared/ShopChromeProvider";

// 비고객(상담사/관리자/브랜드/중간관리자)의 "마이페이지" 목적지는 본인 대시보드.
// /my 로 보내면 서버에서 다시 대시보드로 리다이렉트되며 플래시가 생기므로, 처음부터 대시보드로 연결한다.
function myPageHref(role?: string): string {
  switch (role) {
    case "SUPER_ADMIN": return "/admin";
    case "CONSULTANT": return "/seller";
    default: return "/my";
  }
}

// 하단 네비게이션을 숨길 경로 패턴
const HIDDEN_PATHS = [
  /^\/products\/[^/]+$/,
  /^\/cart$/,
  /^\/live\/[^/]+$/,
  // 점집은 공통 하단 네비를 숨기고 점집 전용 하단 네비(SellerShopBottomNav)를 사용.
  /^\/shop\/[^/]+/,
];

const DASHBOARD_PATHS = [
  /^\/admin(\/|$)/,
  /^\/seller(\/|$)/,
];

export default function MobileNav() {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  // 라이브 팝업(iframe, ?embedded=true) 또는 라이브 진입/예약(?from=live) 시 하단 네비 숨김
  const embedded = searchParams?.get("embedded") === "true" || searchParams?.get("from") === "live";
  const flags = useFeatureFlags();
  const { data: session } = useSession();
  // 상담사 서브페이지에서는 공통 하단바 대신 상담사 전용 하단바(SellerShopBottomNav)를 사용한다.
  const { subpageActive } = useShopChrome();

  // "마이페이지"는 역할에 따라 본인 대시보드 또는 /my 로 연결 (비고객 /my 리다이렉트 플래시 방지)
  const myHref = myPageHref(session?.user?.role);

  // 메인(고객) 하단 메뉴: 홈 · 라이브 · 예약 · 상담사 · 마이페이지
  // ('상담사 탐색'이 꺼져 있으면 /sellers 가 404이므로 대신 내 단골 상담사(/my/seller)를 연결한다)
  const navItems: { href: string; icon: string; label: string; matchExact?: boolean }[] = [
    { href: "/", icon: "Home", label: "홈", matchExact: true },
    ...(flags.liveCommerce ? [{ href: "/live", icon: "Live", label: "라이브" }] : []),
    { href: "/my/reservations", icon: "Calendar", label: "예약" },
    flags.seller
      ? { href: "/sellers", icon: "Users", label: "상담사" }
      : { href: "/my/seller", icon: "Users", label: "상담사" },
    { href: myHref, icon: "MyPage", label: "마이페이지", matchExact: true },
  ];

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tappedHref, setTappedHref] = useState<string | null>(null);

  const handleNavClick = useCallback((e: React.MouseEvent, href: string, matchExact?: boolean) => {
    e.preventDefault();
    const isActive = matchExact || href === "/" ? pathname === href : pathname.startsWith(href);
    if (isActive) return;
    setTappedHref(href);
    // 홈('/') 버튼: 비고객 역할(상담사/관리자)은 /?main=1 로 이동하여 대시보드 자동 리다이렉트 우회
    const role = (session?.user as any)?.role;
    const pushHref = href === "/" && role && role !== "CUSTOMER" ? "/?main=1" : href;
    startTransition(() => {
      router.push(pushHref);
    });
  }, [pathname, router, session]);

  useEffect(() => {
    if (!isPending && tappedHref) setTappedHref(null);
  }, [isPending, tappedHref]);

  // 문의하기 패널 열기 (FloatingButtons에 이벤트 전달)
  const openContact = () => {
    window.dispatchEvent(new CustomEvent("open-contact"));
  };

  const shouldHide = HIDDEN_PATHS.some((p) => p.test(pathname))
    || DASHBOARD_PATHS.some((p) => p.test(pathname))
    || subpageActive
    || embedded;
  if (shouldHide) return null;

  return (
    <>
      {/* 모바일(lg 미만): 기존 하단 탭바 */}
      <nav
        className="lg:hidden fixed bottom-0 left-1/2 -translate-x-1/2 z-[60] bg-white border-t border-gray-100 w-full max-w-[480px]"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          WebkitBackfaceVisibility: "hidden",
          WebkitTransform: "translateX(-50%) translateZ(0)",
          willChange: "transform",
        }}
      >
        <div className="flex items-center justify-around h-14 px-1">
          {navItems.map((item) => {
            const isActive = tappedHref
              ? tappedHref === item.href
              : item.matchExact || item.href === "/"
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={(e) => handleNavClick(e, item.href, item.matchExact)}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-0.5 flex-1 py-1 min-h-[48px]",
                  "touch-manipulation select-none",
                  "active:scale-95 transition-transform duration-75",
                  isActive ? "text-black" : "text-gray-400"
                )}
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[2px] bg-black rounded-full" />
                )}
                <div className="relative">
                  <Icon name={item.icon} size={22} className={isActive ? "" : "opacity-60"} />
                </div>
                <span className={cn("text-[10px] leading-tight", isActive ? "font-semibold text-black" : "font-normal")}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>

        {/* 로딩 인디케이터 */}
        {isPending && (
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-black to-transparent animate-pulse" />
        )}
      </nav>

      {/* PC(lg+): 앱 컨테이너 바로 오른쪽 세로 사이드바 */}
      {/* 앱 컨테이너는 max-w-[480px] mx-auto → 오른쪽 끝: calc(50% + 240px). 사이드바는 그 바로 우측에 배치 */}
      <nav
        className="hidden lg:flex fixed top-1/2 -translate-y-1/2 z-[60] flex-col items-center gap-1 py-4 px-2 bg-white/90 backdrop-blur-sm border border-gray-100 rounded-2xl shadow-md"
        style={{ left: "calc(50% + 248px)" }}
      >
        {navItems.map((item) => {
          const isActive = tappedHref
            ? tappedHref === item.href
            : item.matchExact || item.href === "/"
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={(e) => handleNavClick(e, item.href, item.matchExact)}
              title={item.label}
              className={cn(
                "flex flex-col items-center justify-center gap-1 w-12 h-12 rounded-xl transition-colors",
                isActive ? "bg-brand-50 text-brand-700" : "text-gray-400 hover:bg-brand-50/70 hover:text-brand-700"
              )}
            >
              <Icon name={item.icon} size={20} className={isActive ? "" : "opacity-60"} />
              <span className="text-[9px] leading-tight font-medium">{item.label}</span>
            </Link>
          );
        })}

        {/* 구분선 */}
        <div className="w-6 h-px bg-gray-200 my-1" />

        {/* 문의하기 */}
        <button
          onClick={openContact}
          title="문의하기"
          className="flex flex-col items-center justify-center gap-1 w-12 h-12 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        >
          <Icon name="Message" size={20} strokeWidth={1.5} />
          <span className="text-[9px] leading-tight font-medium">문의하기</span>
        </button>

        {/* 구분선 */}
        <div className="w-6 h-px bg-gray-200 my-1" />

        {/* 로그아웃 */}
        {session && (
          <button
            onClick={async () => { await signOut({ redirect: false }); window.location.href = window.location.origin + "/"; }}
            title="로그아웃"
            className="flex flex-col items-center justify-center gap-1 w-12 h-12 rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
          >
            <Icon name="Logout" size={20} strokeWidth={1.5} />
            <span className="text-[9px] leading-tight font-medium">로그아웃</span>
          </button>
        )}
      </nav>
    </>
  );
}
