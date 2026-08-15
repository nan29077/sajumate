"use client";

import { Icon } from "@/components/shared/Icon";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

// 점집 전용 하단 네비.
// - 공통 하단 네비(MobileNav)는 점집에서 숨기고, 구매회원에게 필요한 기능만 노출.
// - 메인 페이지로 가는 항목은 두지 않는다(점집홈/장바구니/예약내역/내정보).
export default function SellerShopBottomNav({
  sellerSlug,
}: {
  sellerSlug: string;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { data: session } = useSession();
  const shopPath = `/shop/${encodeURIComponent(sellerSlug)}`;
  const loginPath = `/auth/login?callbackUrl=${encodeURIComponent(shopPath)}`;

  const items = [
    {
      href: `/shop/${sellerSlug}`,
      icon: "Home",
      label: "홈",
      active: pathname === `/shop/${sellerSlug}`,
    },
    {
      href: "/my/orders",
      icon: "OrderHistory",
      label: "예약내역",
      active: pathname.startsWith("/my/orders"),
      requiresAuth: true,
    },
    {
      href: `/shop/${sellerSlug}/my`,
      icon: "MyPage",
      label: "마이페이지",
      active: pathname.startsWith(`/shop/${sellerSlug}/my`),
      requiresAuth: true,
    },
  ];

  const handleLogout = async () => {
    await signOut({ redirect: false });
    window.location.href = shopPath;
  };

  return (
    <>
      {/* 모바일 하단 네비 (md 미만) */}
      <nav
        className="fixed bottom-0 left-1/2 z-[60] w-full max-w-[480px] -translate-x-1/2 border-t border-brand-100/70 bg-white/95 backdrop-blur-xl md:hidden"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          WebkitTransform: "translateX(-50%) translateZ(0)",
        }}
      >
        <div className="flex items-center justify-around h-16 px-1">
          {items.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              prefetch={true}
              onClick={(e) => {
                if (item.requiresAuth && !session) {
                  e.preventDefault();
                  router.push(loginPath);
                }
              }}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 flex-1 py-1 min-h-[56px]",
                "touch-manipulation select-none active:scale-95 transition-transform duration-75",
                item.active ? "text-brand-700" : "text-gray-400",
              )}
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              {item.active && (
                <span className="absolute left-1/2 top-0 h-[2px] w-7 -translate-x-1/2 rounded-full bg-brand-600" />
              )}
              <Icon
                name={item.icon}
                size={28}
                className={item.active ? "" : "opacity-60"}
              />
              <span
                className={cn(
                  "text-[12px] leading-tight",
                  item.active ? "font-semibold text-brand-700" : "font-normal",
                )}
              >
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </nav>

      {/* PC 우측 세로 고정 네비 (md+) */}
      <nav
        className="fixed top-1/2 z-[60] hidden -translate-y-1/2 flex-col items-center gap-1 rounded-2xl border border-brand-100 bg-white/90 px-2 py-4 shadow-md backdrop-blur-sm md:flex"
        style={{ left: "calc(50% + 248px)" }}
      >
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            prefetch={true}
            title={item.label}
            onClick={(e) => {
              if (item.requiresAuth && !session) {
                e.preventDefault();
                router.push(loginPath);
              }
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-1 w-14 h-14 rounded-xl transition-colors",
              item.active
                ? "bg-brand-50 text-brand-800"
                : "text-gray-400 hover:bg-brand-50 hover:text-brand-600",
            )}
          >
            <Icon
              name={item.icon}
              size={24}
              className={item.active ? "" : "opacity-60"}
            />
            <span className="text-[11px] leading-tight font-medium">
              {item.label}
            </span>
          </Link>
        ))}

        <div className="my-1 h-px w-6 bg-brand-100" />

        {session ? (
          <button
            onClick={handleLogout}
            title="로그아웃"
            className="flex flex-col items-center justify-center gap-1 w-14 h-14 rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
          >
            <Icon name="Logout" size={24} strokeWidth={1.5} />
            <span className="text-[11px] leading-tight font-medium">
              로그아웃
            </span>
          </button>
        ) : (
          <Link
            href={loginPath}
            title="로그인"
            className="flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-xl text-gray-400 transition-colors hover:bg-brand-50 hover:text-brand-600"
          >
            <Icon name="Login" size={24} strokeWidth={1.5} />
            <span className="text-[11px] leading-tight font-medium">
              로그인
            </span>
          </Link>
        )}
      </nav>
    </>
  );
}
