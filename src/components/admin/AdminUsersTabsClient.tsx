"use client";

import { Icon } from '@/components/shared/Icon';
import { useState } from "react";
;
import UserListClient from "@/components/admin/UserListClient";
import AdminSellersClient, { type Seller } from "@/components/admin/AdminSellersClient";

interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  gender?: string | null;
  birthday?: string | null;
  role: string;
  isActive: boolean;
  reservationCount: number;
  reviewCount: number;
  createdAt: string;
  authProviders?: string[];
  sellerId?: string | null;
  commissionRate?: number | null;
}

export default function AdminUsersTabsClient({
  users,
  sellers,
}: {
  users: User[];
  sellers: Seller[];
}) {
  const [tab, setTab] = useState<"users" | "sellers">("users");

  return (
    <div className="animate-fade-in">
      {/* 탭 전환 버튼 */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab("users")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            tab === "users"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Icon name="Users" size={15} />
          전체 회원
          <span className="ml-1 text-[11px] font-bold bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">
            {users.length}
          </span>
        </button>
        <button
          onClick={() => setTab("sellers")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            tab === "sellers"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Icon name="Store" size={15} />
          상담사 관리
          <span className="ml-1 text-[11px] font-bold bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">
            {sellers.length}
          </span>
        </button>
      </div>

      {tab === "users" ? (
        <UserListClient users={users} />
      ) : (
        <AdminSellersClient sellers={sellers} />
      )}
    </div>
  );
}
