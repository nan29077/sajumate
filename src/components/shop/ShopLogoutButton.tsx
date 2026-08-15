"use client";

import { Icon } from "@/components/shared/Icon";
import { signOut } from "next-auth/react";

// 점집 전용 로그아웃 버튼.
// 로그아웃 후 사주메이트 메인이 아니라 "이 점집 홈"으로 돌려보내
// 고객이 점집 세계 안에 머물도록 한다(SellerShopBottomNav 와 동일한 UX).
export default function ShopLogoutButton({ sellerSlug }: { sellerSlug: string }) {
  const handleLogout = async () => {
    await signOut({ redirect: false });
    window.location.href = `/shop/${encodeURIComponent(sellerSlug)}`;
  };

  return (
    <button
      onClick={handleLogout}
      className="flex w-full items-center justify-between rounded-2xl border border-red-100 bg-white px-4 py-3.5 text-left transition-colors hover:bg-red-50 active:scale-[0.99]"
    >
      <span className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50">
          <Icon name="Logout" size={18} className="text-red-500" strokeWidth={1.5} />
        </span>
        <span className="text-sm font-semibold text-red-600">로그아웃</span>
      </span>
      <Icon name="ChevronDown" size={16} className="-rotate-90 text-red-300" />
    </button>
  );
}
