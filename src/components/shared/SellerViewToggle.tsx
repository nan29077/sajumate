"use client";

import { Icon } from '@/components/shared/Icon';
import { useState } from "react";
import { List } from 'lucide-react';
import Link from "next/link";
import SafeImage from "@/components/shared/SafeImage";
import { sellerShopUrl } from "@/lib/utils";

interface Seller {
  slug: string;
  shopName: string;
  shopLogo: string | null;
  shopBanner: string | null;
  shopDescription?: string | null;
  category: string | null;
  mood: string | null;
  totalFans: number;
  _count: {
    shopProducts: number;
    fans: number;
  };
}

export default function SellerViewToggle({ sellers }: { sellers: Seller[] }) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  return (
    <div>
      {/* 뷰 토글 */}
      <div className="flex items-center justify-end mb-3 gap-1">
        <button
          onClick={() => setViewMode("grid")}
          className={`p-1.5 rounded-lg transition-colors ${viewMode === "grid" ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-400 hover:text-gray-600"}`}
          aria-label="카드 보기"
        >
          <Icon name="Category" size={16} />
        </button>
        <button
          onClick={() => setViewMode("list")}
          className={`p-1.5 rounded-lg transition-colors ${viewMode === "list" ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-400 hover:text-gray-600"}`}
          aria-label="한 줄 보기"
        >
          <List size={16} />
        </button>
      </div>

      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {sellers.map((seller) => (
            <SellerGridCard key={seller.slug} seller={seller} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {sellers.map((seller) => (
            <SellerListCard key={seller.slug} seller={seller} />
          ))}
        </div>
      )}
    </div>
  );
}

function SellerGridCard({ seller }: { seller: Seller }) {
  return (
    <Link
      href={sellerShopUrl(seller.slug)}
      className="group block bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg hover:border-brand-200 transition-all duration-300"
    >
      <div className="relative h-28 overflow-hidden bg-gradient-to-br from-brand-100 to-purple-100">
        {seller.shopBanner ? (
          <SafeImage src={seller.shopBanner} alt={seller.shopName} width={400} height={112} fallbackText={seller.shopName} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-brand-400/20 via-purple-300/20 to-pink-300/20" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
        {seller.category && (
          <span className="absolute top-2.5 right-2.5 text-[10px] font-medium text-white bg-black/30 backdrop-blur-sm px-2 py-0.5 rounded-full">{seller.category}</span>
        )}
      </div>

      <div className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl border-2 border-gray-100 shadow-sm overflow-hidden bg-white flex-shrink-0 -mt-8 relative z-10">
            <SafeImage src={seller.shopLogo} alt={seller.shopName} width={48} height={48} fallbackText={seller.shopName.charAt(0)} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-bold text-gray-900 truncate leading-tight">{seller.shopName}</h3>
            {seller.mood && <p className="text-[11px] text-gray-400 truncate mt-0.5">{seller.mood}</p>}
          </div>
        </div>

        {seller.shopDescription && (
          <p className="text-xs text-gray-500 line-clamp-2 mt-2.5 leading-relaxed">{seller.shopDescription}</p>
        )}

        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
          <span className="flex items-center gap-1 text-[11px] text-gray-500">
            <Icon name="Users" size={12} strokeWidth={1.5} className="text-brand-400" /> 팬 {seller.totalFans.toLocaleString()}
          </span>
          {seller._count.shopProducts > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-gray-500">
              <Icon name="Cart" size={12} strokeWidth={1.5} className="text-gray-400" /> 상담상품 {seller._count.shopProducts}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function SellerListCard({ seller }: { seller: Seller }) {
  return (
    <Link
      href={sellerShopUrl(seller.slug)}
      className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 p-3 hover:shadow-md transition-all"
    >
      <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 border border-gray-100 bg-white">
        <SafeImage src={seller.shopLogo} alt={seller.shopName} width={48} height={48} fallbackText={seller.shopName.charAt(0)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-gray-900 truncate">{seller.shopName}</h3>
          {seller.category && (
            <span className="text-[10px] text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded flex-shrink-0">{seller.category}</span>
          )}
        </div>
        <div className="flex items-center gap-2.5 mt-0.5">
          <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
            <Icon name="Users" size={10} strokeWidth={1.5} /> 팬 {seller.totalFans.toLocaleString()}
          </span>
          {seller._count.shopProducts > 0 && (
            <span className="text-[11px] text-gray-400">상담상품 {seller._count.shopProducts}</span>
          )}
        </div>
        {seller.mood && <p className="text-[10px] text-gray-300 mt-0.5 truncate">{seller.mood}</p>}
      </div>
      <Icon name="ChevronDown" size={16} strokeWidth={1.5} className="text-gray-300 flex-shrink-0 -rotate-90" />
    </Link>
  );
}
