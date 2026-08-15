"use client";

import { Icon } from '@/components/shared/Icon';
import { useState, useMemo } from "react";
import { List, X, ChevronRight, Radio, Eye } from 'lucide-react';
import Link from "next/link";
import SafeImage from "@/components/shared/SafeImage";
import { sellerShopUrl } from "@/lib/utils";


interface ProductInfo {
  id: string;
  name: string;
  thumbnail: string | null;
  basePrice: number;
  slug: string;
}

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
  displayImages?: string[];
  products?: ProductInfo[];
  tags?: string[];
  isNew?: boolean;
  isLive?: boolean;
  liveInfo?: { shareCode: string; title: string; viewerCount: number } | null;
  /** 노출 상담상품 중 최저가 (상담상품이 없으면 null) */
  startPrice?: number | null;
}

function formatFanCount(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "만";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "천";
  return n.toLocaleString();
}

export default function SellerSearchClient({
  sellers,
  baseCategories,
}: {
  sellers: Seller[];
  /** 등록 상담사가 없어도 항상 노출할 기본 분야 칩 (사주·신점·타로 등) */
  baseCategories?: string[];
}) {
  const [viewMode, setViewMode] = useState<"ranking" | "grid">("ranking");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");

  const categories = useMemo(() => {
    const fromSellers = sellers.map((s) => s.category).filter(Boolean) as string[];
    // 기본 분야를 먼저(정해진 순서대로) 두고, 그 외 상담사가 실제로 쓰는 분야를 뒤에 붙인다.
    const base = baseCategories ?? [];
    const extra = Array.from(new Set(fromSellers.filter((c) => !base.includes(c)))).sort();
    return [...base, ...extra];
  }, [sellers, baseCategories]);

  const filteredSellers = useMemo(() => {
    return sellers.filter((s) => {
      const matchSearch = !search || s.shopName.toLowerCase().includes(search.toLowerCase())
        || s.shopDescription?.toLowerCase().includes(search.toLowerCase())
        || s.category?.toLowerCase().includes(search.toLowerCase())
        || s.mood?.toLowerCase().includes(search.toLowerCase())
        || s.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()));
      const matchCategory = !selectedCategory || s.category === selectedCategory;
      return matchSearch && matchCategory;
    });
  }, [sellers, search, selectedCategory]);

  return (
    <div>
      {/* 검색 + 필터 + 뷰 토글 */}
      <div className="px-4 pt-4 pb-2">
        {/* 검색 바 */}
        <div className="relative mb-3">
          <Icon name="Search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="상담사 이름, 카테고리로 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:bg-white border border-gray-100 focus:border-brand-200 transition-all"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
              <X size={11} />
            </button>
          )}
        </div>

        {/* 카테고리 + 뷰 토글 */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex overflow-x-auto scrollbar-hide gap-1.5 flex-1 -mx-1 px-1">
            <button
              onClick={() => setSelectedCategory("")}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
                !selectedCategory
                  ? "bg-black text-white"
                  : "bg-gray-100 text-gray-500 active:bg-gray-200"
              }`}
            >
              전체
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(selectedCategory === cat ? "" : cat)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
                  selectedCategory === cat
                    ? "bg-black text-white"
                    : "bg-gray-100 text-gray-500 active:bg-gray-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="flex gap-1 flex-shrink-0 ml-2">
            <button
              onClick={() => setViewMode("ranking")}
              className={`p-1.5 rounded-lg transition-all ${viewMode === "ranking" ? "bg-black text-white" : "bg-gray-100 text-gray-400"}`}
              aria-label="랭킹 보기"
            >
              <List size={14} />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-lg transition-all ${viewMode === "grid" ? "bg-black text-white" : "bg-gray-100 text-gray-400"}`}
              aria-label="카드 보기"
            >
              <Icon name="Category" size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* 결과 수 */}
      <div className="px-4 py-2">
        <span className="text-[11px] text-gray-400">{filteredSellers.length}명의 상담사</span>
      </div>

      {/* 상담사 목록 */}
      {filteredSellers.length === 0 ? (
        <div className="text-center py-20 text-gray-400 px-4">
          <Icon name="Search" size={32} strokeWidth={1.5} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium text-gray-500">검색 결과가 없습니다</p>
          <p className="text-xs mt-1">다른 키워드로 검색해보세요</p>
        </div>
      ) : viewMode === "ranking" ? (
        <div className="divide-y divide-gray-100">
          {filteredSellers.map((seller, idx) => (
            <SellerRankingCard key={seller.slug} seller={seller} rank={idx + 1} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 px-4 pb-6">
          {filteredSellers.map((seller) => (
            <SellerGridCard key={seller.slug} seller={seller} />
          ))}
        </div>
      )}

      <div className="h-8" />

      {/* 두근두근 애니메이션 스타일 */}
      <style>{`
        @keyframes heartbeat {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          25% { transform: scale(1.08); box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
          50% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.2); }
          75% { transform: scale(1.05); box-shadow: 0 0 0 4px rgba(239, 68, 68, 0); }
        }
        .animate-heartbeat {
          animation: heartbeat 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

/* ── 랭킹 카드 ── */
function SellerRankingCard({ seller, rank }: { seller: Seller; rank: number }) {
  const images = seller.displayImages || [];
  const tags = seller.tags || [];

  return (
    <div className="px-4 py-4">
      {/* 상단: 순위 + 이름 + 뱃지 + 태그 + 하트 */}
      <div className="flex items-start gap-3 mb-3">
        {/* 순위 번호 */}
        <span className="text-lg font-bold text-gray-900 leading-none mt-0.5 w-5 text-center flex-shrink-0">
          {rank}
        </span>

        {/* 이름 + 태그 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <Link href={sellerShopUrl(seller.slug)} className="text-[15px] font-bold text-gray-900 hover:underline truncate">
              {seller.shopName}
            </Link>
            {/* 기존 LIVE 텍스트 뱃지 삭제 - 프로필 이미지로 대체 */}
            {seller.isNew && !seller.isLive && (
              <span className="text-[9px] font-bold text-white bg-brand-500 px-1.5 py-0.5 rounded flex-shrink-0">
                신작
              </span>
            )}
          </div>
          {/* 태그 행 */}
          <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
            {tags.slice(0, 5).map((tag, i) => (
              <span key={i} className="text-[11px] text-gray-400">
                {tag}
              </span>
            ))}
          </div>
          {/* 시작 가격 */}
          {typeof seller.startPrice === "number" && (
            <p className="mt-1 text-[11px] text-gray-500">
              <span className="text-gray-400">상담 </span>
              <span className="font-bold text-gray-900">{seller.startPrice.toLocaleString()}원</span>
              <span className="text-gray-400"> 부터</span>
            </p>
          )}
        </div>

        {/* 하트 + 팬 수 */}
        <div className="flex flex-col items-center gap-0.5 flex-shrink-0 pt-0.5">
          <Icon name="Wishlist" size={16} strokeWidth={1.5} className="text-gray-300" />
          <span className="text-[11px] text-gray-400 font-medium">
            {formatFanCount(seller.totalFans)}
          </span>
        </div>
      </div>

      {/* 하단: 프로필 이미지 + 상담상품/콘텐츠 이미지 그리드 */}
      <Link href={sellerShopUrl(seller.slug)} className="flex items-start gap-2.5">
        {/* 프로필 이미지 (원형) - 라이브 중이면 두근두근 애니메이션 + 하단 LIVE 표시 */}
        <div className="flex flex-col items-center flex-shrink-0">
          <div className={`w-11 h-11 rounded-full overflow-hidden border bg-gray-100 ${
            seller.isLive
              ? "border-red-400 ring-2 ring-red-300 animate-heartbeat"
              : "border-gray-200"
          }`}>
            <SafeImage
              src={seller.shopLogo}
              alt={seller.shopName}
              width={44}
              height={44}
              fallbackText={seller.shopName.charAt(0)}
              className="w-full h-full object-cover"
            />
          </div>
          {/* 라이브 뱃지 - 프로필 이미지 바로 아래 */}
          {seller.isLive && (
            <span className="flex items-center gap-0.5 bg-red-500 text-white text-[7px] font-bold px-1.5 py-[1px] rounded-full -mt-1.5 relative z-10 shadow-sm">
              <span className="w-1 h-1 bg-white rounded-full animate-pulse" /> LIVE
            </span>
          )}
        </div>

        {/* 이미지 그리드 (5~6개 가로 스크롤) */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide flex-1 -mr-4 pr-4">
          {images.length > 0 ? (
            images.slice(0, 6).map((url, i) => (
              <div key={i} className="w-[72px] h-[90px] rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                <img
                  src={url}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </div>
            ))
          ) : seller.products && seller.products.length > 0 ? (
            seller.products.slice(0, 6).map((p, i) => (
              <div key={i} className="w-[72px] h-[90px] rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                {p.thumbnail ? (
                  <img
                    src={p.thumbnail}
                    alt={p.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300 text-[9px]">No img</div>
                )}
              </div>
            ))
          ) : (
            /* 이미지 없을 때 플레이스홀더 */
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="w-[72px] h-[90px] rounded-lg bg-gray-100 flex-shrink-0" />
            ))
          )}
        </div>
      </Link>
    </div>
  );
}

/* ── 그리드 카드 (카드형 보기) ── */
function SellerGridCard({ seller }: { seller: Seller }) {
  const images = seller.displayImages || [];

  return (
    <Link
      href={sellerShopUrl(seller.slug)}
      className="group block bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md transition-all"
    >
      {/* 이미지 영역 */}
      <div className="relative h-32 overflow-hidden bg-gray-100">
        {images.length > 0 ? (
          <div className="flex h-full">
            <div className="w-1/2 h-full">
              <img src={images[0]} alt="" className="w-full h-full object-cover" loading="lazy" />
            </div>
            <div className="w-1/2 h-full flex flex-col">
              {images[1] && <img src={images[1]} alt="" className="w-full h-1/2 object-cover" loading="lazy" />}
              {images[2] && <img src={images[2]} alt="" className="w-full h-1/2 object-cover" loading="lazy" />}
            </div>
          </div>
        ) : seller.shopBanner ? (
          <SafeImage src={seller.shopBanner} alt={seller.shopName} width={300} height={128} fallbackText={seller.shopName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-50" />
        )}
        {/* 기존 상단 LIVE/신작 텍스트 뱃지 삭제 */}
        {seller.isNew && !seller.isLive && (
          <span className="absolute top-2 left-2 text-[8px] font-bold text-white bg-brand-500 px-1.5 py-0.5 rounded">신작</span>
        )}
      </div>

      {/* 정보 */}
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1">
          {/* 프로필 이미지 - 라이브 중이면 두근두근 + 하단 LIVE */}
          <div className="flex flex-col items-center flex-shrink-0">
            <div className={`w-8 h-8 rounded-full overflow-hidden border bg-white ${
              seller.isLive
                ? "border-red-400 ring-2 ring-red-300 animate-heartbeat"
                : "border-gray-200"
            }`}>
              <SafeImage src={seller.shopLogo} alt={seller.shopName} width={32} height={32} fallbackText={seller.shopName.charAt(0)} />
            </div>
            {seller.isLive && (
              <span className="flex items-center gap-0.5 bg-red-500 text-white text-[6px] font-bold px-1 py-[1px] rounded-full -mt-1.5 relative z-10 shadow-sm">
                <span className="w-0.5 h-0.5 bg-white rounded-full animate-pulse" /> LIVE
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xs font-bold text-gray-900 truncate">{seller.shopName}</h3>
            {seller.category && <p className="text-[10px] text-gray-400">{seller.category}</p>}
          </div>
        </div>
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
          <span className="text-[10px] text-gray-400 flex items-center gap-1">
            <Icon name="Wishlist" size={10} strokeWidth={2} className="text-gray-300" />
            {formatFanCount(seller.totalFans)}
          </span>
          {typeof seller.startPrice === "number" ? (
            <span className="text-[10px] text-gray-500">
              <span className="font-bold text-gray-900">{seller.startPrice.toLocaleString()}원</span> 부터
            </span>
          ) : seller._count.shopProducts > 0 ? (
            <span className="text-[10px] text-gray-400">상담상품 {seller._count.shopProducts}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
